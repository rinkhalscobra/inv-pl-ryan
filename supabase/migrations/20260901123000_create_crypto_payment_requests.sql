/* Persist provider payments so status checks cannot be used to credit another user. */

CREATE TABLE IF NOT EXISTS public.crypto_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'nowpayments',
  provider_payment_id text NOT NULL UNIQUE,
  order_id text NOT NULL UNIQUE,
  price_amount numeric(20, 8) NOT NULL CHECK (price_amount > 0),
  price_currency text NOT NULL DEFAULT 'usd',
  pay_currency text NOT NULL,
  pay_amount numeric(36, 18),
  actually_paid numeric(36, 18),
  pay_address text NOT NULL,
  payment_status text NOT NULL DEFAULT 'waiting',
  credited boolean NOT NULL DEFAULT false,
  credited_at timestamptz,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crypto_payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crypto payment requests"
  ON public.crypto_payment_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage crypto payment requests"
  ON public.crypto_payment_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crypto_payment_requests_user_created
  ON public.crypto_payment_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_payment_requests_pending
  ON public.crypto_payment_requests(payment_status) WHERE credited = false;

CREATE TRIGGER update_crypto_payment_requests_updated_at
BEFORE UPDATE ON public.crypto_payment_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.finalize_nowpayments_payment(
  p_provider_payment_id text,
  p_payment_status text,
  p_actually_paid numeric,
  p_provider_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.crypto_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM public.crypto_payment_requests
  WHERE provider_payment_id = p_provider_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Payment request not found'; END IF;

  UPDATE public.crypto_payment_requests
  SET payment_status = p_payment_status,
      actually_paid = COALESCE(p_actually_paid, actually_paid),
      provider_response = COALESCE(p_provider_response, provider_response)
  WHERE id = v_payment.id;

  IF p_payment_status = 'finished' AND NOT v_payment.credited THEN
    INSERT INTO public.transactions (user_id, type, amount, status, description)
    VALUES (
      v_payment.user_id, 'nowpayments_deposit', v_payment.price_amount, 'completed',
      'Crypto deposit completed - payment ' || v_payment.provider_payment_id
    );

    UPDATE public.crypto_payment_requests
    SET credited = true, credited_at = now()
    WHERE id = v_payment.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_status', p_payment_status,
    'credited', p_payment_status = 'finished' OR v_payment.credited
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_nowpayments_payment(text, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_nowpayments_payment(text, text, numeric, jsonb)
  TO service_role;
