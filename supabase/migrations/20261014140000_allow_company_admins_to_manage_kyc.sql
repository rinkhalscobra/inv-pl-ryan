/*
  Give an administrator assigned to a company the same client-management
  workflow as a platform administrator, but only for that administrator's own
  company and approved company network.

  KYC review previously passed require_admin() and then failed in
  protect_user_kyc_status(), because check_admin_role() deliberately grants a
  direct-table bypass only to platform-network administrators.  Keep that
  direct-table protection and authorize the narrowly scoped review RPC instead.
*/

CREATE OR REPLACE FUNCTION crm_private.effective_company(p_requested uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_scope text;
  v_network_company uuid;
  v_result uuid;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT n.access_scope, n.company_id
  INTO v_scope, v_network_company
  FROM crm_private.request_network_context() n;
  IF v_scope IS NULL THEN RAISE EXCEPTION 'CRM access requires an approved network'; END IF;

  IF v_actor.is_admin THEN
    IF v_actor.company_id IS NOT NULL THEN
      IF v_scope <> 'company' OR v_network_company IS DISTINCT FROM v_actor.company_id THEN
        RAISE EXCEPTION 'Administrator account and network belong to different companies';
      END IF;
      IF p_requested IS NOT NULL AND p_requested IS DISTINCT FROM v_actor.company_id THEN
        RAISE EXCEPTION 'Administrator cannot access another company';
      END IF;
      v_result := v_actor.company_id;
    ELSIF v_scope = 'platform' THEN
      v_result := p_requested;
      IF v_result IS NULL THEN
        SELECT id INTO v_result FROM public.crm_companies WHERE is_default_registration;
      END IF;
    ELSE
      v_result := v_network_company;
    END IF;
  ELSE
    IF v_scope <> 'company' OR v_actor.company_id IS DISTINCT FROM v_network_company THEN
      RAISE EXCEPTION 'This account is not assigned to the company for this network';
    END IF;
    v_result := v_actor.company_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.crm_companies WHERE id = v_result AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Company is unavailable';
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_scope text;
  v_network_company uuid;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN; END IF;

  SELECT * INTO v_actor FROM public.users WHERE id = auth.uid();
  IF NOT FOUND OR NOT v_actor.is_admin THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT n.access_scope, n.company_id
  INTO v_scope, v_network_company
  FROM crm_private.request_network_context() n;
  IF v_scope IS NULL THEN RAISE EXCEPTION 'Administrator network access required'; END IF;

  IF v_actor.company_id IS NOT NULL
     AND (v_scope <> 'company' OR v_network_company IS DISTINCT FROM v_actor.company_id) THEN
    RAISE EXCEPTION 'Administrator account and network belong to different companies';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.admin_can_manage_user(
  p_actor_id uuid,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_target_company uuid;
  v_scope text;
  v_network_company uuid;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN true; END IF;

  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_id;
  SELECT company_id INTO v_target_company FROM public.users WHERE id = p_target_id;
  IF v_actor.id IS NULL OR NOT v_actor.is_admin OR NOT FOUND OR v_target_company IS NULL THEN
    RETURN false;
  END IF;

  SELECT n.access_scope, n.company_id
  INTO v_scope, v_network_company
  FROM crm_private.request_network_context() n;
  IF v_scope IS NULL THEN RETURN false; END IF;

  IF v_actor.company_id IS NOT NULL THEN
    RETURN v_scope = 'company'
       AND v_network_company IS NOT DISTINCT FROM v_actor.company_id
       AND v_target_company IS NOT DISTINCT FROM v_actor.company_id;
  END IF;

  RETURN v_scope = 'platform'
      OR (v_scope = 'company' AND v_target_company IS NOT DISTINCT FROM v_network_company);
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.assert_actor_user_access(p_target uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_target_company uuid;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id = auth.uid();
  SELECT company_id INTO v_target_company FROM public.users WHERE id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF auth.role() = 'service_role' OR auth.uid() = p_target THEN RETURN; END IF;

  IF v_actor.is_admin AND crm_private.admin_can_manage_user(auth.uid(), p_target) THEN RETURN; END IF;
  IF NOT v_actor.is_admin
     AND v_actor.company_id IS NOT NULL
     AND v_actor.company_id IS NOT DISTINCT FROM v_target_company THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Account belongs to another company';
END;
$$;

/* Edge functions use this service-role helper after independently validating
   the administrator's bearer token and the gateway-supplied client IP. */
CREATE OR REPLACE FUNCTION public.crm_service_actor_context(
  p_actor_id uuid,
  p_ip text,
  p_requested_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_scope text;
  v_network_company uuid;
  v_effective uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM account not found'; END IF;

  SELECT n.access_scope, n.company_id
  INTO v_scope, v_network_company
  FROM crm_private.network_context(p_ip) n;
  IF v_scope IS NULL THEN RAISE EXCEPTION 'CRM access requires an approved network'; END IF;

  IF v_actor.is_admin THEN
    IF v_actor.company_id IS NOT NULL THEN
      IF v_scope <> 'company' OR v_network_company IS DISTINCT FROM v_actor.company_id THEN
        RAISE EXCEPTION 'Administrator account and network belong to different companies';
      END IF;
      IF p_requested_company_id IS NOT NULL
         AND p_requested_company_id IS DISTINCT FROM v_actor.company_id THEN
        RAISE EXCEPTION 'Administrator cannot access another company';
      END IF;
      v_effective := v_actor.company_id;
    ELSIF v_scope = 'platform' THEN
      v_effective := COALESCE(
        p_requested_company_id,
        (SELECT id FROM public.crm_companies WHERE is_default_registration)
      );
    ELSE
      v_effective := v_network_company;
    END IF;
  ELSE
    IF v_scope <> 'company' OR v_actor.company_id IS DISTINCT FROM v_network_company THEN
      RAISE EXCEPTION 'Account and network belong to different companies';
    END IF;
    v_effective := v_actor.company_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.crm_companies WHERE id = v_effective AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Company is unavailable';
  END IF;

  RETURN jsonb_build_object(
    'actor_id', p_actor_id,
    'is_admin', v_actor.is_admin,
    'access_scope', v_scope,
    'company_id', v_effective
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_user_kyc_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_tax_status text;
  v_scoped_review boolean := COALESCE(
    current_setting('crm.kyc_review_authorized', true), ''
  ) = 'yes';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND COALESCE(NEW.kyc_status, 'not_verified') <> 'not_verified' THEN
      RAISE EXCEPTION 'KYC verification requires an administrator review';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.kyc_status IS NOT DISTINCT FROM NEW.kyc_status THEN RETURN NEW; END IF;
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;

  SELECT status INTO v_tax_status
  FROM public.kyc_tax_id_submissions
  WHERE user_id = NEW.id;

  IF NEW.kyc_status = 'verified' THEN
    IF (NOT public.check_admin_role(auth.uid()) AND NOT v_scoped_review)
       OR v_tax_status IS DISTINCT FROM 'verified'
       OR NEW.document_id_path IS NULL
       OR NEW.document_selfie_path IS NULL THEN
      RAISE EXCEPTION 'Administrator approval of identity documents and Tax ID is required';
    END IF;
  ELSIF v_scoped_review THEN
    IF OLD.kyc_status IS DISTINCT FROM 'pending'
       OR NEW.kyc_status IS DISTINCT FROM 'not_verified'
       OR v_tax_status IS DISTINCT FROM 'rejected' THEN
      RAISE EXCEPTION 'Invalid KYC review transition';
    END IF;
  ELSIF NOT public.check_admin_role(auth.uid()) THEN
    IF OLD.kyc_status = 'verified'
       OR NEW.kyc_status <> 'pending'
       OR v_tax_status IS DISTINCT FROM 'pending'
       OR NEW.document_id_path IS NULL
       OR NEW.document_selfie_path IS NULL THEN
      RAISE EXCEPTION 'Submit a complete KYC application before changing status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_kyc_application(
  p_target_user_id uuid,
  p_decision text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_tax_status text;
  v_next_status text;
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);

  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid review decision';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A review reason is required';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_user.company_id IS NULL THEN RAISE EXCEPTION 'Client is not assigned to a company'; END IF;

  SELECT status INTO v_tax_status
  FROM public.kyc_tax_id_submissions
  WHERE user_id = p_target_user_id
  FOR UPDATE;
  IF v_tax_status IS NULL OR v_tax_status <> 'pending' OR v_user.kyc_status <> 'pending' THEN
    RAISE EXCEPTION 'No pending KYC application is available for review';
  END IF;

  IF p_decision = 'approve'
     AND (
       v_user.document_id_path IS NULL
       OR v_user.document_selfie_path IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects
         WHERE bucket_id = 'kyc-documents' AND name = v_user.document_id_path
       )
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects
         WHERE bucket_id = 'kyc-documents' AND name = v_user.document_selfie_path
       )
     ) THEN
    RAISE EXCEPTION 'Identity documents are required before approval';
  END IF;

  v_next_status := CASE WHEN p_decision = 'approve' THEN 'verified' ELSE 'rejected' END;

  UPDATE public.kyc_tax_id_submissions
  SET status = v_next_status,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_reason = btrim(p_reason)
  WHERE user_id = p_target_user_id;

  UPDATE public.client_documents
  SET status = v_next_status
  WHERE user_id = p_target_user_id
    AND object_path IN (v_user.document_id_path, v_user.document_selfie_path);

  PERFORM set_config('crm.kyc_review_authorized', 'yes', true);
  UPDATE public.users
  SET kyc_status = CASE WHEN p_decision = 'approve' THEN 'verified' ELSE 'not_verified' END,
      updated_at = now()
  WHERE id = p_target_user_id;

  INSERT INTO public.admin_action_logs(
    admin_user_id,
    target_user_id,
    company_id,
    action,
    before_data,
    after_data,
    reason
  ) VALUES (
    auth.uid(),
    p_target_user_id,
    v_user.company_id,
    'review_kyc_application',
    jsonb_build_object('kyc_status', v_user.kyc_status, 'tax_id_status', v_tax_status),
    jsonb_build_object(
      'kyc_status', CASE WHEN p_decision = 'approve' THEN 'verified' ELSE 'not_verified' END,
      'tax_id_status', v_next_status
    ),
    btrim(p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION crm_private.admin_can_manage_user(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_kyc_application(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_kyc_application(uuid, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
