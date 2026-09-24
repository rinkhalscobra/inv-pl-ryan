-- Grant, claim, credit, revoke and replay-protection checks. Fixtures roll back.
BEGIN;

SELECT set_config('crm.test.admin', (
  SELECT id::text FROM public.users WHERE is_admin = true ORDER BY id LIMIT 1
), true);
SELECT set_config('crm.test.client', (
  SELECT u.id::text
  FROM public.users u
  LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
  WHERE NOT COALESCE(u.is_admin, false) AND s.user_id IS NULL
    AND EXISTS (SELECT 1 FROM public.balances b WHERE b.user_id = u.id)
  ORDER BY u.id LIMIT 1
), true);

DO $$ BEGIN
  IF COALESCE(current_setting('crm.test.admin', true), '') = ''
     OR COALESCE(current_setting('crm.test.client', true), '') = '' THEN
    RAISE EXCEPTION 'Wheel test needs one administrator and one client with a wallet';
  END IF;
END $$;

INSERT INTO public.transactions(user_id, type, amount, currency, description, status)
VALUES (
  current_setting('crm.test.client')::uuid,
  'deposit', 100, 'USD', 'CRM wheel automated test deposit', 'completed'
);

SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT set_config('crm.test.grant', (
  public.admin_grant_wheel_spin(
    current_setting('crm.test.client')::uuid, 20, 'Automated wheel grant test'
  )->>'id'
), true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_action_logs
    WHERE action = 'grant_wheel_spin'
      AND target_user_id = current_setting('crm.test.client')::uuid
  ) THEN RAISE EXCEPTION 'Wheel grant was not audited'; END IF;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.client'), true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_before numeric;
  v_after numeric;
  v_result jsonb;
BEGIN
  SELECT usd_balance INTO v_before
  FROM public.balances
  WHERE user_id = current_setting('crm.test.client')::uuid;

  IF public.get_wheel_spin_eligibility()->>'id' <> current_setting('crm.test.grant') THEN
    RAISE EXCEPTION 'CRM wheel grant was not returned as eligible';
  END IF;

  v_result := public.claim_wheel_spin('crm_grant', current_setting('crm.test.grant')::uuid);
  SELECT usd_balance INTO v_after
  FROM public.balances
  WHERE user_id = current_setting('crm.test.client')::uuid;

  IF (v_result->>'percentage')::integer <> 20
     OR (v_result->>'winning_amount')::numeric <> 20 THEN
    RAISE EXCEPTION 'Wheel did not use the administrator-selected outcome';
  END IF;
  IF v_after - v_before <> (v_result->>'winning_amount')::numeric THEN
    RAISE EXCEPTION 'Wheel prize did not match the USD wallet credit';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.wheel_spin_grants g
    JOIN public.transactions t ON t.id = g.source_transaction_id
    WHERE g.id = current_setting('crm.test.grant')::uuid
      AND g.status = 'claimed'
      AND t.wheel_spun = true
      AND t.wheel_winning_percentage = 20
  ) THEN RAISE EXCEPTION 'Wheel grant was not consumed'; END IF;

  BEGIN
    PERFORM public.claim_wheel_spin('crm_grant', current_setting('crm.test.grant')::uuid);
    RAISE EXCEPTION 'Claimed wheel grant was accepted twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Claimed wheel grant was accepted twice' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
INSERT INTO public.transactions(user_id, type, amount, currency, description, status)
VALUES (
  current_setting('crm.test.client')::uuid,
  'deposit', 50, 'USD', 'CRM wheel automated revoke-test deposit', 'completed'
);
SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.admin'), true);
SET LOCAL ROLE authenticated;

SELECT set_config('crm.test.revoked_grant', (
  public.admin_grant_wheel_spin(
    current_setting('crm.test.client')::uuid, 50, 'Automated wheel revoke test'
  )->>'id'
), true);
SELECT public.admin_revoke_wheel_spin(
  current_setting('crm.test.client')::uuid,
  current_setting('crm.test.revoked_grant')::uuid,
  'Automated wheel revoke test'
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wheel_spin_grants
    WHERE id = current_setting('crm.test.revoked_grant')::uuid AND status = 'revoked'
  ) THEN RAISE EXCEPTION 'Unused wheel grant was not revoked'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
SELECT 'CRM wheel spin grant checks passed' AS result;
