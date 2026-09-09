/* Bank-transfer details expected by the wallet deposit and withdrawal views. */

CREATE TABLE IF NOT EXISTS public.client_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  bank_name text,
  account_number text,
  routing_number text,
  swift_code text,
  beneficiary_name text,
  iban text,
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_bank_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bank details" ON public.client_bank_details;
CREATE POLICY "Users can view own bank details"
  ON public.client_bank_details
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage client bank details" ON public.client_bank_details;
CREATE POLICY "Admins can manage client bank details"
  ON public.client_bank_details
  FOR ALL
  TO authenticated
  USING (public.check_admin_role(auth.uid()))
  WITH CHECK (public.check_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage client bank details" ON public.client_bank_details;
CREATE POLICY "Service role can manage client bank details"
  ON public.client_bank_details
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_client_bank_details_updated_at ON public.client_bank_details;
CREATE TRIGGER update_client_bank_details_updated_at
BEFORE UPDATE ON public.client_bank_details
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_client_bank_details_user_id
  ON public.client_bank_details(user_id);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS withdrawal_details jsonb;
