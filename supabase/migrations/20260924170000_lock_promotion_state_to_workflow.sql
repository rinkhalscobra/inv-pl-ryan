/* Even administrators must use the promotion workflow so active ownership is
   removed and Sales history is archived atomically. */
CREATE OR REPLACE FUNCTION crm_private.protect_client_security_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND crm_private.actor_role_for(auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Only administrators can change administrator access';
  END IF;
  IF NEW.is_promoted IS DISTINCT FROM OLD.is_promoted
     AND COALESCE(current_setting('crm.promotion_authorized', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Promotion state can only be changed through the CRM promotion workflow';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
