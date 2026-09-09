/* Replace NOWPayments with BTCPay Server invoices.

   BTCPay settles the invoice in crypto while the platform credits the invoice's
   USD amount through the existing transaction balance trigger. Provider status
   updates are idempotent and can only be finalized by the service role.
*/

ALTER TABLE public.crypto_payment_requests
  ALTER COLUMN provider SET DEFAULT 'btcpay',
  ALTER COLUMN pay_address DROP NOT NULL;

ALTER TABLE public.crypto_payment_requests
  ADD COLUMN IF NOT EXISTS checkout_url text;

COMMENT ON COLUMN public.crypto_payment_requests.checkout_url IS
  'Provider-hosted checkout URL. Currently populated by BTCPay Server.';

DROP FUNCTION IF EXISTS public.finalize_nowpayments_payment(text, text, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.finalize_btcpay_invoice(
  p_provider_payment_id text,
  p_payment_status text,
  p_provider_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payment public.crypto_payment_requests%ROWTYPE;
  v_is_settled boolean := lower(p_payment_status) = 'settled';
BEGIN
  SELECT * INTO v_payment
  FROM public.crypto_payment_requests
  WHERE provider = 'btcpay'
    AND provider_payment_id = p_provider_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BTCPay invoice not found';
  END IF;

  UPDATE public.crypto_payment_requests
  SET payment_status = p_payment_status,
      provider_response = COALESCE(p_provider_response, provider_response)
  WHERE id = v_payment.id;

  IF v_is_settled AND NOT v_payment.credited THEN
    INSERT INTO public.transactions (user_id, type, amount, status, description)
    VALUES (
      v_payment.user_id,
      'deposit',
      v_payment.price_amount,
      'completed',
      'Crypto deposit completed - BTCPay invoice ' || v_payment.provider_payment_id
    );

    UPDATE public.crypto_payment_requests
    SET credited = true,
        credited_at = now()
    WHERE id = v_payment.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_status', p_payment_status,
    'credited', v_is_settled OR v_payment.credited
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_btcpay_invoice(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_btcpay_invoice(text, text, jsonb)
  TO service_role;

