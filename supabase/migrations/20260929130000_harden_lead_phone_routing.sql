/* Make phone routing explicit, repeatable, and safe for existing CRM data.
   Office codes remain business identifiers; routing_country_code is the
   dedicated ISO alpha-2 mapping used for automatic phone routing. */

ALTER TABLE public.crm_offices
  ADD COLUMN IF NOT EXISTS routing_country_code text;

UPDATE public.crm_offices
SET routing_country_code = upper(btrim(code))
WHERE routing_country_code IS NULL
  AND upper(btrim(code)) ~ '^[A-Z]{2}$';

ALTER TABLE public.crm_offices
  DROP CONSTRAINT IF EXISTS crm_offices_routing_country_code_check,
  ADD CONSTRAINT crm_offices_routing_country_code_check
    CHECK (
      routing_country_code IS NULL
      OR routing_country_code = upper(btrim(routing_country_code))
        AND routing_country_code ~ '^[A-Z]{2}$'
    );

CREATE UNIQUE INDEX IF NOT EXISTS crm_offices_company_routing_country_unique_idx
  ON public.crm_offices(company_id, routing_country_code)
  WHERE routing_country_code IS NOT NULL;

/* Re-resolve all non-manual leads in a company, optionally limited to a set of
   detected countries. This uses the already validated libphonenumber result;
   it never trusts a submitted country or office label. */
CREATE OR REPLACE FUNCTION crm_private.refresh_lead_phone_routing(
  p_company_id uuid,
  p_country_codes text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH candidates AS (
    SELECT
      l.id,
      (
        SELECT o.id
        FROM public.crm_offices o
        WHERE o.company_id = l.company_id
          AND o.status = 'active'
          AND o.routing_country_code = l.phone_country_code
        LIMIT 1
      ) AS matched_office_id
    FROM public.crm_leads l
    WHERE l.company_id = p_company_id
      AND l.status = 'new'
      AND l.phone_validation_status = 'valid'
      AND l.phone_country_code IS NOT NULL
      AND l.phone_routing_status <> 'manual'
      AND (
        p_country_codes IS NULL
        OR cardinality(array_remove(p_country_codes, NULL)) = 0
        OR l.phone_country_code = ANY(array_remove(p_country_codes, NULL))
      )
  ), resolved AS (
    SELECT
      c.id,
      c.matched_office_id,
      CASE
        WHEN c.matched_office_id IS NULL THEN 'no_office'
        WHEN EXISTS (
          SELECT 1
          FROM public.crm_staff_roles s
          JOIN public.users u ON u.id = s.user_id
          WHERE s.role = 'desk_manager'
            AND u.company_id = p_company_id
            AND u.office_id = c.matched_office_id
        ) THEN 'routed'
        ELSE 'no_desk_manager'
      END AS next_routing_status
    FROM candidates c
  )
  UPDATE public.crm_leads l
  SET office_id = r.matched_office_id,
      phone_routing_status = r.next_routing_status,
      phone_routed_at = now()
  FROM resolved r
  WHERE l.id = r.id
    AND (
      l.office_id IS DISTINCT FROM r.matched_office_id
      OR l.phone_routing_status IS DISTINCT FROM r.next_routing_status
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION crm_private.refresh_lead_phone_routing(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_private.refresh_lead_phone_routing(uuid, text[]) TO service_role;

/* Enforce the current routing configuration on every newly inserted classified
   lead. This closes the race between an Edge Function loading configuration
   and an administrator changing an Office while that request is in flight. */
CREATE OR REPLACE FUNCTION crm_private.enforce_lead_phone_routing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_office_id uuid;
BEGIN
  IF NEW.status <> 'new' THEN RETURN NEW; END IF;
  IF NEW.phone_routing_status = 'manual'
     OR (TG_OP = 'UPDATE' AND OLD.phone_routing_status = 'manual') THEN
    RETURN NEW;
  END IF;

  IF NEW.phone_validation_status <> 'valid' OR NEW.phone_country_code IS NULL THEN
    NEW.office_id := NULL;
    NEW.phone_routing_status := 'invalid';
    NEW.phone_routed_at := now();
    RETURN NEW;
  END IF;

  SELECT o.id INTO v_office_id
  FROM public.crm_offices o
  WHERE o.company_id = NEW.company_id
    AND o.status = 'active'
    AND o.routing_country_code = NEW.phone_country_code
  LIMIT 1;

  NEW.office_id := v_office_id;
  IF v_office_id IS NULL THEN
    NEW.phone_routing_status := 'no_office';
  ELSIF EXISTS (
    SELECT 1
    FROM public.crm_staff_roles s
    JOIN public.users u ON u.id = s.user_id
    WHERE s.role = 'desk_manager'
      AND u.company_id = NEW.company_id
      AND u.office_id = v_office_id
  ) THEN
    NEW.phone_routing_status := 'routed';
  ELSE
    NEW.phone_routing_status := 'no_desk_manager';
  END IF;
  NEW.phone_routed_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_enforce_lead_phone_routing_trigger ON public.crm_leads;
CREATE TRIGGER crm_enforce_lead_phone_routing_trigger
BEFORE INSERT OR UPDATE OF company_id, phone_country_code, phone_validation_status
ON public.crm_leads
FOR EACH ROW
EXECUTE FUNCTION crm_private.enforce_lead_phone_routing();

/* Office activation or country mapping changes immediately refresh affected
   existing leads. Manual classifications are intentionally preserved. */
CREATE OR REPLACE FUNCTION crm_private.refresh_leads_after_office_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.routing_country_code IS NOT NULL THEN
      PERFORM crm_private.refresh_lead_phone_routing(
        NEW.company_id,
        ARRAY[NEW.routing_country_code]
      );
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.routing_country_code IS NOT NULL THEN
    PERFORM crm_private.refresh_lead_phone_routing(
      OLD.company_id,
      ARRAY[OLD.routing_country_code]
    );
  END IF;
  IF NEW.routing_country_code IS NOT NULL
     AND (
       NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.routing_country_code IS DISTINCT FROM OLD.routing_country_code
     ) THEN
    PERFORM crm_private.refresh_lead_phone_routing(
      NEW.company_id,
      ARRAY[NEW.routing_country_code]
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_refresh_leads_after_office_change_trigger ON public.crm_offices;
CREATE TRIGGER crm_refresh_leads_after_office_change_trigger
AFTER INSERT OR UPDATE OF status, routing_country_code, company_id
ON public.crm_offices
FOR EACH ROW
EXECUTE FUNCTION crm_private.refresh_leads_after_office_change();

/* Adding, removing, moving, or changing a Desk Manager immediately refreshes
   routing health for the affected company. These actions are rare and using a
   company-wide refresh prevents stale assignments across all offices. */
CREATE OR REPLACE FUNCTION crm_private.refresh_leads_after_staff_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_company uuid;
  v_new_company uuid;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.role = 'desk_manager' THEN
    SELECT u.company_id INTO v_old_company
    FROM public.users u
    WHERE u.id = OLD.user_id;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.role = 'desk_manager' THEN
    SELECT u.company_id INTO v_new_company
    FROM public.users u
    WHERE u.id = NEW.user_id;
  END IF;

  IF v_old_company IS NOT NULL THEN
    PERFORM crm_private.refresh_lead_phone_routing(v_old_company, NULL);
  END IF;
  IF v_new_company IS NOT NULL AND v_new_company IS DISTINCT FROM v_old_company THEN
    PERFORM crm_private.refresh_lead_phone_routing(v_new_company, NULL);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_refresh_leads_after_staff_role_change_trigger ON public.crm_staff_roles;
CREATE TRIGGER crm_refresh_leads_after_staff_role_change_trigger
AFTER INSERT OR UPDATE OF role, user_id OR DELETE
ON public.crm_staff_roles
FOR EACH ROW
EXECUTE FUNCTION crm_private.refresh_leads_after_staff_role_change();

CREATE OR REPLACE FUNCTION crm_private.refresh_leads_after_desk_manager_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.crm_staff_roles s
    WHERE s.user_id = NEW.id AND s.role = 'desk_manager'
  ) THEN
    IF OLD.company_id IS NOT NULL THEN
      PERFORM crm_private.refresh_lead_phone_routing(OLD.company_id, NULL);
    END IF;
    IF NEW.company_id IS NOT NULL AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      PERFORM crm_private.refresh_lead_phone_routing(NEW.company_id, NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_refresh_leads_after_desk_manager_move_trigger ON public.users;
CREATE TRIGGER crm_refresh_leads_after_desk_manager_move_trigger
AFTER UPDATE OF office_id, company_id
ON public.users
FOR EACH ROW
WHEN (
  OLD.office_id IS DISTINCT FROM NEW.office_id
  OR OLD.company_id IS DISTINCT FROM NEW.company_id
)
EXECUTE FUNCTION crm_private.refresh_leads_after_desk_manager_move();

/* Extend the existing RPC without changing its name or the meaning of Office
   code. The final parameter has a default for backward compatibility. */
DROP FUNCTION IF EXISTS public.crm_admin_save_office(uuid, text, text, text, uuid);
CREATE FUNCTION public.crm_admin_save_office(
  p_office_id uuid,
  p_name text,
  p_code text,
  p_status text DEFAULT 'active',
  p_company_id uuid DEFAULT NULL,
  p_routing_country_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_office public.crm_offices%ROWTYPE;
  v_company uuid := crm_private.effective_company(p_company_id);
  v_code text := upper(btrim(COALESCE(p_code, '')));
  v_routing_country_code text := NULLIF(upper(btrim(COALESCE(p_routing_country_code, ''))), '');
BEGIN
  PERFORM public.require_admin();
  IF length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Enter an Office name';
  END IF;
  IF v_code !~ '^[A-Z0-9_-]{2,20}$' OR p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid Office details';
  END IF;
  IF v_routing_country_code IS NOT NULL AND v_routing_country_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Select a valid two-letter phone-routing country';
  END IF;

  IF p_office_id IS NULL THEN
    INSERT INTO public.crm_offices(
      name,
      code,
      status,
      created_by,
      company_id,
      routing_country_code
    )
    VALUES (
      btrim(p_name),
      v_code,
      p_status,
      auth.uid(),
      v_company,
      v_routing_country_code
    )
    RETURNING * INTO v_office;
  ELSE
    UPDATE public.crm_offices
    SET name = btrim(p_name),
        code = v_code,
        status = p_status,
        routing_country_code = v_routing_country_code,
        updated_at = now()
    WHERE id = p_office_id AND company_id = v_company
    RETURNING * INTO v_office;
    IF NOT FOUND THEN RAISE EXCEPTION 'Office not found in this company'; END IF;
  END IF;

  INSERT INTO public.admin_action_logs(
    admin_user_id,
    company_id,
    action,
    after_data,
    reason
  )
  VALUES (
    auth.uid(),
    v_company,
    'crm_office_saved',
    to_jsonb(v_office),
    'CRM Office management'
  );
  RETURN to_jsonb(v_office);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_admin_save_office(uuid, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_save_office(uuid, text, text, text, uuid, text) TO authenticated;

/* Normalize all existing non-manual routing against the new explicit mapping. */
DO $$
DECLARE
  v_company record;
BEGIN
  FOR v_company IN SELECT id FROM public.crm_companies LOOP
    PERFORM crm_private.refresh_lead_phone_routing(v_company.id, NULL);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
