/* CRM market orders use the existing engine and the selected client's scope.
   This migration creates no client positions and changes no balances. */
CREATE OR REPLACE FUNCTION crm_private.require_client_trade_access(p_target_user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);
END;
$$;
REVOKE ALL ON FUNCTION crm_private.require_client_trade_access(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION crm_private.client_trade_available_margin(p_client uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT greatest(b.usdt_balance
    - COALESCE((SELECT sum(margin) FROM public.futures_positions WHERE user_id=p_client AND is_open),0)
    - COALESCE((SELECT sum(reserved_margin) FROM public.futures_orders WHERE user_id=p_client AND status='open'),0),0)
  FROM public.balances b WHERE b.user_id=p_client;
$$;
REVOKE ALL ON FUNCTION crm_private.client_trade_available_margin(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE crm_private.client_trade_markets (
  symbol text PRIMARY KEY,
  market text NOT NULL CHECK(market IN('futures','cfd')),
  instrument_type text NOT NULL,
  contract_size numeric NOT NULL CHECK(contract_size>0)
);
ALTER TABLE crm_private.client_trade_markets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_private.client_trade_markets FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO crm_private.client_trade_markets(symbol,market,instrument_type,contract_size) VALUES
  ('BTCUSDT','futures','crypto',1),
  ('ETHUSDT','futures','crypto',1),
  ('SOLUSDT','futures','crypto',1),
  ('BNBUSDT','futures','crypto',1),
  ('XRPUSDT','futures','crypto',1),
  ('DOGEUSDT','futures','crypto',1),
  ('ADAUSDT','futures','crypto',1),
  ('AVAXUSDT','futures','crypto',1),
  ('LINKUSDT','futures','crypto',1),
  ('DOTUSDT','futures','crypto',1),
  ('NEARUSDT','futures','crypto',1),
  ('LTCUSDT','futures','crypto',1),
  ('UNIUSDT','futures','crypto',1),
  ('SUIUSDT','futures','crypto',1),
  ('APTUSDT','futures','crypto',1),
  ('ARBUSDT','futures','crypto',1),
  ('OPUSDT','futures','crypto',1),
  ('INJUSDT','futures','crypto',1),
  ('POLUSDT','futures','crypto',1),
  ('ATOMUSDT','futures','crypto',1),
  ('TRXUSDT','futures','crypto',1),
  ('BCHUSDT','futures','crypto',1),
  ('XLMUSDT','futures','crypto',1),
  ('XMRUSDT','futures','crypto',1),
  ('HBARUSDT','futures','crypto',1),
  ('VETUSDT','futures','crypto',1),
  ('FILUSDT','futures','crypto',1),
  ('1000PEPEUSDT','futures','crypto',1),
  ('SHIB1000USDT','futures','crypto',1),
  ('AAVEUSDT','futures','crypto',1),
  ('SKYUSDT','futures','crypto',1),
  ('ALGOUSDT','futures','crypto',1),
  ('XTZUSDT','futures','crypto',1),
  ('AUSDT','futures','crypto',1),
  ('RENDERUSDT','futures','crypto',1),
  ('EUR/USD','cfd','forex',100000),
  ('GBP/USD','cfd','forex',100000),
  ('AUD/USD','cfd','forex',100000),
  ('NZD/USD','cfd','forex',100000),
  ('USD/JPY','cfd','forex',100000),
  ('USD/CHF','cfd','forex',100000),
  ('USD/CAD','cfd','forex',100000),
  ('EUR/JPY','cfd','forex',100000),
  ('EUR/GBP','cfd','forex',100000),
  ('EUR/AUD','cfd','forex',100000),
  ('EUR/CHF','cfd','forex',100000),
  ('EUR/CAD','cfd','forex',100000),
  ('EUR/NZD','cfd','forex',100000),
  ('GBP/JPY','cfd','forex',100000),
  ('GBP/AUD','cfd','forex',100000),
  ('GBP/CHF','cfd','forex',100000),
  ('GBP/CAD','cfd','forex',100000),
  ('GBP/NZD','cfd','forex',100000),
  ('AUD/CAD','cfd','forex',100000),
  ('AUD/CHF','cfd','forex',100000),
  ('AUD/JPY','cfd','forex',100000),
  ('AUD/NZD','cfd','forex',100000),
  ('NZD/JPY','cfd','forex',100000),
  ('NZD/CHF','cfd','forex',100000),
  ('NZD/CAD','cfd','forex',100000),
  ('CAD/JPY','cfd','forex',100000),
  ('CAD/CHF','cfd','forex',100000),
  ('CHF/JPY','cfd','forex',100000),
  ('USD/TRY','cfd','forex',100000),
  ('EUR/TRY','cfd','forex',100000),
  ('USD/ZAR','cfd','forex',100000),
  ('USD/HKD','cfd','forex',100000),
  ('USD/SGD','cfd','forex',100000),
  ('USD/DKK','cfd','forex',100000),
  ('USD/NOK','cfd','forex',100000),
  ('USD/SEK','cfd','forex',100000),
  ('USD/PLN','cfd','forex',100000),
  ('USD/HUF','cfd','forex',100000),
  ('USD/CZK','cfd','forex',100000),
  ('USD/MXN','cfd','forex',100000),
  ('USD/BRL','cfd','forex',100000),
  ('USD/CNH','cfd','forex',100000),
  ('USD/THB','cfd','forex',100000),
  ('USD/IDR','cfd','forex',100000),
  ('AUD/SGD','cfd','forex',100000),
  ('AUD/HKD','cfd','forex',100000),
  ('NZD/SGD','cfd','forex',100000),
  ('SGD/JPY','cfd','forex',100000),
  ('HKD/JPY','cfd','forex',100000),
  ('USD/TWD','cfd','forex',100000),
  ('USD/KRW','cfd','forex',100000),
  ('USD/INR','cfd','forex',100000),
  ('USD/PHP','cfd','forex',100000),
  ('USD/MYR','cfd','forex',100000),
  ('EUR/SEK','cfd','forex',100000),
  ('EUR/NOK','cfd','forex',100000),
  ('EUR/DKK','cfd','forex',100000),
  ('EUR/PLN','cfd','forex',100000),
  ('EUR/HUF','cfd','forex',100000),
  ('EUR/CZK','cfd','forex',100000),
  ('USD/SAR','cfd','forex',100000),
  ('USD/AED','cfd','forex',100000),
  ('USD/QAR','cfd','forex',100000),
  ('USD/ILS','cfd','forex',100000),
  ('EUR/ILS','cfd','forex',100000),
  ('USD/CLP','cfd','forex',100000),
  ('USD/COP','cfd','forex',100000),
  ('USD/PEN','cfd','forex',100000),
  ('EUR/ZAR','cfd','forex',100000),
  ('GBP/ZAR','cfd','forex',100000),
  ('AUD/ZAR','cfd','forex',100000),
  ('XAG/USD','cfd','commodity',5000),
  ('BCO/USD','cfd','commodity',1000),
  ('WTICO/USD','cfd','commodity',1000),
  ('XPT/USD','cfd','commodity',100),
  ('XAU/USD','cfd','commodity',100),
  ('XPD/USD','cfd','commodity',100),
  ('BA','cfd','stock',100),
  ('JPM','cfd','stock',100),
  ('GS','cfd','stock',100),
  ('BAC','cfd','stock',100),
  ('WMT','cfd','stock',100),
  ('DIS','cfd','stock',100),
  ('CVX','cfd','stock',100),
  ('UBER','cfd','stock',100),
  ('LYFT','cfd','stock',100),
  ('PFE','cfd','stock',100),
  ('MRNA','cfd','stock',100),
  ('KO','cfd','stock',100),
  ('PEP','cfd','stock',100),
  ('XOM','cfd','stock',100),
  ('T','cfd','stock',100),
  ('V','cfd','stock',100),
  ('MA','cfd','stock',100),
  ('COST','cfd','stock',100),
  ('INTU','cfd','stock',100),
  ('SBUX','cfd','stock',100),
  ('MCD','cfd','stock',100),
  ('LOW','cfd','stock',100),
  ('HD','cfd','stock',100),
  ('CAT','cfd','stock',100),
  ('HON','cfd','stock',100),
  ('AMGN','cfd','stock',100),
  ('LLY','cfd','stock',100),
  ('UNH','cfd','stock',100),
  ('ABT','cfd','stock',100),
  ('CVS','cfd','stock',100),
  ('WFC','cfd','stock',100),
  ('MS','cfd','stock',100),
  ('AXP','cfd','stock',100),
  ('BLK','cfd','stock',100),
  ('C','cfd','stock',100),
  ('BK','cfd','stock',100),
  ('TGT','cfd','stock',100),
  ('NKE','cfd','stock',100),
  ('SPY','cfd','index',1),
  ('QQQ','cfd','index',1),
  ('IWM','cfd','index',1),
  ('VTI','cfd','index',1),
  ('ARKK','cfd','index',1),
  ('XLK','cfd','index',1),
  ('XLF','cfd','index',1),
  ('XLE','cfd','index',1),
  ('XLY','cfd','index',1),
  ('XLP','cfd','index',1),
  ('XLV','cfd','index',1),
  ('XLI','cfd','index',1),
  ('XLB','cfd','index',1),
  ('XLU','cfd','index',1),
  ('IYR','cfd','index',1),
  ('SMH','cfd','index',1),
  ('SOXX','cfd','index',1),
  ('TLT','cfd','index',1),
  ('HYG','cfd','index',1),
  ('GLD','cfd','index',1),
  ('SLV','cfd','index',1),
  ('BITO','cfd','index',1),
  ('SPYD','cfd','index',1),
  ('JEPI','cfd','index',1),
  ('VOO','cfd','index',1),
  ('AAPL','cfd','stock',100),
  ('MSFT','cfd','stock',100),
  ('NVDA','cfd','stock',100),
  ('AMZN','cfd','stock',100),
  ('GOOGL','cfd','stock',100),
  ('META','cfd','stock',100),
  ('TSLA','cfd','stock',100),
  ('NFLX','cfd','stock',100),
  ('AMD','cfd','stock',100),
  ('INTC','cfd','stock',100),
  ('ORCL','cfd','stock',100),
  ('IBM','cfd','stock',100),
  ('ADBE','cfd','stock',100),
  ('CRM','cfd','stock',100),
  ('NOW','cfd','stock',100),
  ('PLTR','cfd','stock',100),
  ('AVGO','cfd','stock',100),
  ('TSM','cfd','stock',100),
  ('ASML','cfd','stock',100),
  ('ARM','cfd','stock',100),
  ('QCOM','cfd','stock',100),
  ('MU','cfd','stock',100),
  ('MRVL','cfd','stock',100),
  ('TXN','cfd','stock',100),
  ('AMAT','cfd','stock',100),
  ('LRCX','cfd','stock',100),
  ('KLAC','cfd','stock',100),
  ('CSCO','cfd','stock',100),
  ('DELL','cfd','stock',100),
  ('HPE','cfd','stock',100),
  ('SMCI','cfd','stock',100),
  ('SNOW','cfd','stock',100),
  ('CRWD','cfd','stock',100),
  ('SHOP','cfd','stock',100),
  ('RIVN','cfd','stock',100),
  ('PYPL','cfd','stock',100),
  ('COIN','cfd','stock',100),
  ('HOOD','cfd','stock',100),
  ('SONY','cfd','stock',100);

CREATE TABLE crm_private.client_trade_requests (
  request_key uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parameters jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_private.client_trade_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_private.client_trade_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION crm_private.client_trade_limits(p_client uuid,p_symbol text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('minimum',CASE
    WHEN p_symbol LIKE '%USDT' THEN COALESCE(u.min_leverage_futures,1)
    WHEN p_symbol ~ '^[A-Z]{3}/[A-Z]{3}$' THEN COALESCE(u.min_leverage_forex,1)
    WHEN s.instrument_type='commodity' THEN COALESCE(u.min_leverage_commodities,1)
    WHEN s.instrument_type='stock' THEN COALESCE(u.min_leverage_stocks,1) ELSE 1 END,
    'maximum',CASE
    WHEN p_symbol LIKE '%USDT' THEN COALESCE(u.max_leverage_futures,100)
    WHEN p_symbol ~ '^[A-Z]{3}/[A-Z]{3}$' THEN COALESCE(u.max_leverage_forex,100)
    WHEN s.instrument_type='commodity' THEN COALESCE(u.max_leverage_commodities,100)
    WHEN s.instrument_type='stock' THEN COALESCE(u.max_leverage_stocks,100) ELSE 100 END)
  FROM public.users u LEFT JOIN public.instrument_spreads s ON s.symbol=p_symbol AND s.is_active
  WHERE u.id=p_client LIMIT 1;
$$;
REVOKE ALL ON FUNCTION crm_private.client_trade_limits(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION crm_private.client_trade_notional(p_symbol text,p_price numeric)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_price IS NULL OR p_price<=0 THEN RETURN NULL; END IF;
  RETURN public.calculate_derivative_notional_usd(p_symbol,1,p_price);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION crm_private.client_trade_notional(text,numeric) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.crm_get_client_trade_context(p_target_user_id uuid,p_market text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM crm_private.require_client_trade_access(p_target_user_id);
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_target_user_id AND NOT u.is_admin
    AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id)) THEN RAISE EXCEPTION 'Select a client account'; END IF;
  IF p_market IS NULL OR p_market NOT IN ('futures','cfd') THEN RAISE EXCEPTION 'Select Futures or CFD'; END IF;
  RETURN jsonb_build_object('client_id',p_target_user_id,'available_margin',crm_private.client_trade_available_margin(p_target_user_id),
    'markets',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'symbol',m.symbol,'instrument_type',m.instrument_type,'contract_size',m.contract_size,
      'price',q.price,'quoted_at',q.timestamp,
      'fresh',q.price>0 AND q.timestamp BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute',
      'notional_per_unit',crm_private.client_trade_notional(m.symbol,q.price),
      'limits',crm_private.client_trade_limits(p_target_user_id,m.symbol)) ORDER BY m.symbol)
      FROM crm_private.client_trade_markets m LEFT JOIN (
        SELECT 'futures'::text market,symbol,price,timestamp FROM public.crypto_market_quotes
        UNION ALL SELECT 'cfd',symbol,price,timestamp FROM public.cfd_market_quotes
      ) q ON q.symbol=m.symbol AND q.market=m.market WHERE m.market=p_market),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.crm_get_client_trade_context(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_get_client_trade_context(uuid,text) TO authenticated,service_role;

CREATE FUNCTION public.crm_open_client_position(
  p_target_user_id uuid,p_market text,p_symbol text,p_side text,p_quantity numeric,p_leverage integer,
  p_margin_type text,p_request_key uuid,p_reason text,p_stop_loss numeric DEFAULT NULL,p_take_profit numeric DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid(); catalog crm_private.client_trade_markets; previous crm_private.client_trade_requests;
  parameters jsonb; result jsonb; price numeric; quoted_at timestamptz; units numeric;
  prior_crm text:=COALESCE(current_setting('crm.client_position_authorized',true),'');
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'CRM staff access required'; END IF;
  PERFORM crm_private.require_client_trade_access(p_target_user_id);
  PERFORM 1 FROM public.users u WHERE u.id=p_target_user_id AND NOT u.is_admin
    AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a client account'; END IF;
  PERFORM crm_private.require_client_trade_access(p_target_user_id);
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'An order request reference is required'; END IF;
  IF length(btrim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Enter an audit reason'; END IF;
  parameters:=jsonb_build_object('client_id',p_target_user_id,'market',p_market,'symbol',upper(btrim(p_symbol)),
    'side',p_side,'quantity',p_quantity,'leverage',p_leverage,'margin_type',p_margin_type,
    'stop_loss',p_stop_loss,'take_profit',p_take_profit,'reason',btrim(p_reason));
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-position:'||p_request_key::text,0));
  SELECT * INTO previous FROM crm_private.client_trade_requests WHERE request_key=p_request_key;
  IF FOUND THEN
    IF previous.actor_id IS DISTINCT FROM actor OR previous.client_id IS DISTINCT FROM p_target_user_id OR previous.parameters IS DISTINCT FROM parameters THEN
      RAISE EXCEPTION 'This request reference has already been used for a different order';
    END IF;
    RETURN previous.result;
  END IF;
  SELECT * INTO catalog FROM crm_private.client_trade_markets WHERE symbol=upper(btrim(p_symbol)) AND market=p_market;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a supported, tradable market'; END IF;
  IF p_side IS NULL OR p_side NOT IN ('long','short') OR p_margin_type IS NULL OR p_margin_type NOT IN ('isolated','cross') THEN RAISE EXCEPTION 'Invalid side or margin mode'; END IF;
  IF p_leverage IS NULL OR p_leverage<1 OR p_leverage>10000 THEN RAISE EXCEPTION 'Enter a valid leverage'; END IF;
  IF (p_stop_loss IS NOT NULL AND (p_stop_loss<=0 OR p_stop_loss::text IN ('NaN','Infinity','-Infinity')))
    OR (p_take_profit IS NOT NULL AND (p_take_profit<=0 OR p_take_profit::text IN ('NaN','Infinity','-Infinity'))) THEN
    RAISE EXCEPTION 'Enter valid stop-loss and take-profit prices';
  END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity<=0
    OR p_quantity<>round(p_quantity,8) OR (p_market='cfd' AND p_quantity<0.01) THEN RAISE EXCEPTION 'Enter a valid position size'; END IF;
  units:=p_quantity*catalog.contract_size;
  IF units>1000000000 OR units<>round(units,8) THEN RAISE EXCEPTION 'Position size is too large or too precise'; END IF;
  IF p_market='futures' THEN
    SELECT q.price,q.timestamp INTO price,quoted_at FROM public.crypto_market_quotes q WHERE q.symbol=catalog.symbol;
  ELSE
    SELECT q.price,q.timestamp INTO price,quoted_at FROM public.cfd_market_quotes q WHERE q.symbol=catalog.symbol;
  END IF;
  IF price IS NULL OR price<=0 OR price::text IN ('NaN','Infinity','-Infinity') OR quoted_at IS NULL
    OR quoted_at NOT BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute' THEN
    RAISE EXCEPTION 'A verified live price is required before placing an order.';
  END IF;
  PERFORM set_config('crm.client_position_authorized',p_target_user_id::text,true);
  result:=public.place_derivative_order(p_target_user_id,catalog.symbol,p_side,units,p_leverage,p_margin_type,'market',price,NULL,p_stop_loss,p_take_profit);
  PERFORM set_config('crm.client_position_authorized',prior_crm,true);
  IF result->>'kind' IS DISTINCT FROM 'position' OR result->>'id' IS NULL THEN RAISE EXCEPTION 'The position was not opened'; END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,company_id,action,after_data,reason)
    VALUES(actor,p_target_user_id,(SELECT company_id FROM public.users WHERE id=p_target_user_id),'crm_client_position_opened',parameters||jsonb_build_object('position',result,'units',units,'quote_price',price,'quote_at',quoted_at),btrim(p_reason));
  INSERT INTO crm_private.client_trade_requests(request_key,actor_id,client_id,parameters,result)
    VALUES(p_request_key,actor,p_target_user_id,parameters,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_open_client_position(uuid,text,text,text,numeric,integer,text,uuid,text,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_open_client_position(uuid,text,text,text,numeric,integer,text,uuid,text,numeric,numeric) TO authenticated,service_role;

/* The raw engine remains service-role-only. Only this audited CRM wrapper may
   delegate an authenticated client's order, and scope is checked again by the
   engine. No JWT role or user identity is changed. */
DO $$
DECLARE v_definition text; v_original text;
BEGIN
  SELECT pg_get_functiondef('public.place_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric)'::regprocedure)
    INTO v_definition;
  v_original := 'IF COALESCE(auth.role(), '''') <> ''service_role'' THEN RAISE EXCEPTION ''Service role required''; END IF;';
  IF position(v_original IN v_definition)=0 THEN
    RAISE EXCEPTION 'The expected derivative engine authorization guard was not found';
  END IF;
  EXECUTE replace(v_definition,v_original,$guard$
    IF COALESCE(auth.role(),'')<>'service_role' THEN
      IF auth.uid() IS NULL OR COALESCE(current_setting('crm.client_position_authorized',true),'') IS DISTINCT FROM p_user_id::text THEN
        RAISE EXCEPTION 'Service role required';
      END IF;
      PERFORM crm_private.require_client_trade_access(p_user_id);
    END IF;
  $guard$);
END;
$$;
REVOKE ALL ON FUNCTION public.place_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.place_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric) TO service_role;
NOTIFY pgrst,'reload schema';
