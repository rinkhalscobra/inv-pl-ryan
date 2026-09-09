/* Replace external crypto settlement with CRM-controlled pending deposits. */

DROP FUNCTION IF EXISTS public.finalize_btcpay_invoice(text, text, jsonb);

ALTER TABLE public.crypto_payment_requests
  ALTER COLUMN provider SET DEFAULT 'manual';

COMMENT ON TABLE public.crypto_payment_requests IS
  'Legacy provider-payment requests. New fictive deposits are pending transactions reviewed in CRM.';

/* Users may see their own transactions and continue managing non-deposit
   records used by the existing app. Deposit records can only be changed by
   the existing admin policy or the service role. */
DROP POLICY IF EXISTS "Users can manage own transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions"
  ON public.transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own non-deposit transactions"
  ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND type <> 'deposit');

CREATE POLICY "Users can update own non-deposit transactions"
  ON public.transactions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND type <> 'deposit')
  WITH CHECK (auth.uid() = user_id AND type <> 'deposit');

CREATE POLICY "Users can delete own non-deposit transactions"
  ON public.transactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND type <> 'deposit');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
END;
$$;
