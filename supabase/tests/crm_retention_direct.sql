-- Promoted state is an immutable workspace boundary for ordinary callers.
BEGIN;
CREATE TEMP TABLE crm_promotion_account AS
SELECT u.id FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id=u.id
WHERE NOT u.is_admin AND NOT u.is_promoted AND s.user_id IS NULL LIMIT 1;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM crm_promotion_account) THEN RAISE EXCEPTION 'Promotion test needs one client'; END IF; END $$;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM crm_promotion_account),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN UPDATE public.users SET is_promoted=true WHERE id=auth.uid(); RAISE EXCEPTION 'Client changed promotion state';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT IN ('Promotion state can only be changed through the CRM promotion workflow','new row violates row-level security policy for table "users"') THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Promotion boundary checks passed' result;
