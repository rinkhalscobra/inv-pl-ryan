/* Count a positive CRM primary-wallet balance adjustment as an automatic
   affiliate FTD when that single credit is worth at least 250 USD. The wallet
   editor records its EUR-ledger delta in USD-equivalent base units, while USD
   adjustments are already denominated in USD. BTC edits and other external
   balance changes remain excluded. */

CREATE OR REPLACE FUNCTION crm_private.first_qualifying_deposit_at(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT min(t.balance_processed_at)
  FROM public.transactions t
  WHERE t.user_id = p_user_id
    AND t.status = 'completed'
    AND t.type IN ('deposit', 'nowpayments_deposit')
    AND t.amount > 0
    AND t.balance_processed_at IS NOT NULL
    AND t.balance_reversed_at IS NULL
    AND t.balance_effect->>'legacy' IS DISTINCT FROM 'true'
    AND CASE
      WHEN t.balance_effect->>'external_balance_change' = 'true'
        AND (
          t.description LIKE 'CRM balance adjustment:%'
          OR t.description LIKE 'CRM USD balance adjustment:%'
        )
        THEN t.amount >= 250
      WHEN t.balance_effect->>'external_balance_change' IS DISTINCT FROM 'true'
        AND jsonb_typeof(t.balance_effect->'ledger_amount') = 'number'
        THEN (t.balance_effect->>'ledger_amount')::numeric >= 250
      ELSE false
    END;
$$;

REVOKE ALL ON FUNCTION crm_private.first_qualifying_deposit_at(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_private.first_qualifying_deposit_at(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION crm_private.capture_qualifying_affiliate_ftd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_qualifying_credit boolean := false;
BEGIN
  IF NEW.status = 'completed'
     AND NEW.type IN ('deposit', 'nowpayments_deposit')
     AND NEW.amount > 0
     AND NEW.balance_processed_at IS NOT NULL
     AND NEW.balance_reversed_at IS NULL
     AND NEW.balance_effect->>'legacy' IS DISTINCT FROM 'true' THEN
    v_is_qualifying_credit := CASE
      WHEN NEW.balance_effect->>'external_balance_change' = 'true'
        AND (
          NEW.description LIKE 'CRM balance adjustment:%'
          OR NEW.description LIKE 'CRM USD balance adjustment:%'
        )
        THEN NEW.amount >= 250
      WHEN NEW.balance_effect->>'external_balance_change' IS DISTINCT FROM 'true'
        AND jsonb_typeof(NEW.balance_effect->'ledger_amount') = 'number'
        THEN (NEW.balance_effect->>'ledger_amount')::numeric >= 250
      ELSE false
    END;
  END IF;

  IF v_is_qualifying_credit THEN
    PERFORM crm_private.sync_affiliate_lead_ftd(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

/* Backfill linked affiliate leads that already received a qualifying wallet
   adjustment before this rule was introduced. The synchronizer is idempotent. */
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT DISTINCT l.registered_user_id AS id
    FROM public.crm_leads l
    WHERE l.source_kind = 'affiliate_api'
      AND l.source_id IS NOT NULL
      AND l.registered_user_id IS NOT NULL
  LOOP
    PERFORM crm_private.sync_affiliate_lead_ftd(v_user.id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION crm_private.first_qualifying_deposit_at(uuid) IS
  'Earliest single deposit or positive CRM EUR/USD primary-wallet adjustment worth at least 250 USD.';

NOTIFY pgrst, 'reload schema';
