/* Make EUR explicit for fiat operations while preserving USDT crypto ledgers. */

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USDT';

ALTER TABLE public.client_bank_details
  ALTER COLUMN currency SET DEFAULT 'EUR';

UPDATE public.client_bank_details
SET currency = 'EUR', updated_at = now()
WHERE upper(currency) = 'USD';

ALTER TABLE public.sandbox_payment_transactions
  ALTER COLUMN currency SET DEFAULT 'EUR';

NOTIFY pgrst, 'reload schema';
