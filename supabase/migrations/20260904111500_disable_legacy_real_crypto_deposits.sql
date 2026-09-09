/* Retire the legacy VPS-backed Bitcoin deposit flow.
   Deposit requests now remain pending for CRM review. */

DROP FUNCTION IF EXISTS public.credit_crypto_deposit(uuid);

COMMENT ON TABLE public.crypto_deposit_addresses IS
  'Legacy Bitcoin address records. Real address generation is disabled.';

COMMENT ON TABLE public.crypto_deposits IS
  'Legacy on-chain deposit records. Automatic crediting is disabled.';
