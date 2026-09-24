/* CRM chooses only the outcome. The bonus base and currency are snapshotted
   automatically from the client's latest completed fiat deposit. */

ALTER TABLE public.wheel_spin_grants
  ADD COLUMN IF NOT EXISTS source_transaction_id uuid
  REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wheel_spin_grants_source_transaction
  ON public.wheel_spin_grants(source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wheel_spin_grants_one_available_per_deposit
  ON public.wheel_spin_grants(source_transaction_id)
  WHERE source_transaction_id IS NOT NULL AND status = 'available';

CREATE OR REPLACE FUNCTION public.sync_claimed_crm_wheel_to_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'claimed' AND OLD.status = 'available'
     AND NEW.source_transaction_id IS NOT NULL THEN
    UPDATE public.transactions
    SET wheel_spun = true,
        wheel_winning_percentage = NEW.winning_percentage,
        wheel_winning_amount = NEW.winning_amount,
        updated_at = now()
    WHERE id = NEW.source_transaction_id
      AND user_id = NEW.user_id
      AND type = 'deposit'
      AND status = 'completed'
      AND COALESCE(wheel_spun, false) = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The deposit linked to this wheel spin is no longer eligible';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_claimed_crm_wheel_to_deposit_trigger ON public.wheel_spin_grants;
CREATE TRIGGER sync_claimed_crm_wheel_to_deposit_trigger
  AFTER UPDATE OF status ON public.wheel_spin_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_claimed_crm_wheel_to_deposit();

DROP FUNCTION IF EXISTS public.admin_grant_wheel_spin(uuid, numeric, text, integer, text);

CREATE OR REPLACE FUNCTION public.admin_grant_wheel_spin(
  p_target_user_id uuid,
  p_winning_percentage integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deposit public.transactions%ROWTYPE;
  v_currency text;
  v_grant public.wheel_spin_grants%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'Select a client account'; END IF;
  IF p_winning_percentage IS NULL OR p_winning_percentage NOT IN (0, 5, 10, 20, 50, 70, 80, 100) THEN
    RAISE EXCEPTION 'Select a valid wheel result';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Enter an audit reason'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_target_user_id
      AND NOT COALESCE(u.is_admin, false)
      AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles sr WHERE sr.user_id = u.id)
  ) THEN RAISE EXCEPTION 'The selected account is not a client'; END IF;

  SELECT t.* INTO v_deposit
  FROM public.transactions t
  WHERE t.user_id = p_target_user_id
    AND t.type = 'deposit'
    AND t.status = 'completed'
    AND COALESCE(t.wheel_spun, false) = false
    AND upper(COALESCE(t.currency, '')) IN ('EUR', 'USD')
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This client has no unused completed EUR or USD deposit for a wheel spin';
  END IF;

  v_currency := upper(v_deposit.currency);
  INSERT INTO public.wheel_spin_grants(
    user_id, reference_amount, currency, configured_percentage,
    source_transaction_id, granted_by
  ) VALUES (
    p_target_user_id, round(abs(v_deposit.amount), 2), v_currency,
    p_winning_percentage, v_deposit.id, auth.uid()
  )
  RETURNING * INTO v_grant;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'grant_wheel_spin', to_jsonb(v_grant), btrim(p_reason));

  RETURN to_jsonb(v_grant);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_wheel_spin(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_wheel_spin(uuid, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
