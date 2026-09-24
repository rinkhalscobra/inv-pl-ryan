/* A processed deposit cannot be edited in place because that would desynchronise
   the wallet ledger. Correct it atomically by reversing the old deposit and
   issuing a replacement while the client remains in the Sales workspace. */

CREATE OR REPLACE FUNCTION public.crm_workflow_update_lead_deposit(
  p_transaction_id uuid,
  p_amount numeric,
  p_currency text,
  p_reference text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := crm_private.actor_role();
  v_currency text := upper(btrim(COALESCE(p_currency, '')));
  v_old public.transactions%ROWTYPE;
  v_new public.transactions%ROWTYPE;
BEGIN
  IF v_role NOT IN ('admin', 'workflow_manager') THEN
    RAISE EXCEPTION 'Workflow Manager access required';
  END IF;
  SELECT * INTO v_old FROM public.transactions
  WHERE id = p_transaction_id
    AND type = 'deposit'
    AND status = 'completed'
    AND description LIKE 'Workflow Manager deposit%'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an editable Workflow Manager deposit'; END IF;
  IF v_role = 'workflow_manager' AND NOT crm_private.can_view_client(v_old.user_id) THEN
    RAISE EXCEPTION 'This lead is outside your Sales scope';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_old.user_id AND NOT is_promoted) THEN
    RAISE EXCEPTION 'Deposits can only be updated while the client is an unpromoted lead';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000000 THEN
    RAISE EXCEPTION 'Enter a deposit amount greater than zero';
  END IF;
  IF v_currency NOT IN ('EUR', 'USD') THEN RAISE EXCEPTION 'Select EUR or USD'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Enter an audit reason'; END IF;

  /* The wallet trigger reverses the original credit and rejects the correction
     if those funds have already been spent. */
  UPDATE public.transactions
  SET status = 'failed', updated_at = now()
  WHERE id = v_old.id;

  INSERT INTO public.transactions(user_id, type, amount, currency, description, status)
  VALUES (
    v_old.user_id, 'deposit', round(p_amount, 2), v_currency,
    'Workflow Manager deposit correction for ' || v_old.id::text ||
      CASE WHEN NULLIF(btrim(COALESCE(p_reference, '')), '') IS NULL THEN ''
           ELSE ' - reference ' || btrim(p_reference) END,
    'completed'
  ) RETURNING * INTO v_new;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), v_old.user_id, 'workflow_update_lead_deposit', to_jsonb(v_old), to_jsonb(v_new), btrim(p_reason));
  RETURN to_jsonb(v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_workflow_update_lead_deposit(uuid,numeric,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_workflow_update_lead_deposit(uuid,numeric,text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
