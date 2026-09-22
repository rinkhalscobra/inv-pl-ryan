-- The derivatives processor still reads market_data. Keep this compatibility
-- mirror tied to the canonical Twelve Data quote tables.
CREATE FUNCTION public.enforce_twelve_data_market_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_price numeric;
  v_timestamp timestamptz;
BEGIN
  IF NEW.symbol LIKE '%USDT' OR NEW.symbol = 'USDTUSD' THEN
    SELECT price, timestamp INTO v_price, v_timestamp
      FROM public.crypto_market_quotes WHERE symbol = NEW.symbol;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Crypto market % has no Twelve Data quote', NEW.symbol;
    END IF;
  ELSE
    SELECT price, timestamp INTO v_price, v_timestamp
      FROM public.cfd_market_quotes WHERE symbol = NEW.symbol;
    IF NOT FOUND THEN RETURN NEW; END IF;
  END IF;

  IF NEW.price IS DISTINCT FROM round(v_price, 8)
     OR NEW.timestamp IS DISTINCT FROM v_timestamp THEN
    RAISE EXCEPTION 'Market % must match the stored Twelve Data quote', NEW.symbol;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_twelve_data_market_mirror
BEFORE INSERT OR UPDATE OF price, timestamp ON public.market_data
FOR EACH ROW EXECUTE FUNCTION public.enforce_twelve_data_market_mirror();

REVOKE ALL ON FUNCTION public.enforce_twelve_data_market_mirror() FROM PUBLIC, anon, authenticated;
