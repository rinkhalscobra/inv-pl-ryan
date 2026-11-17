/* All client screens and settlement use the same quote and net valuation.
   Cash is reserved, not debited, on opening. Only closing settles P&L. */
/* Existing positions retain their original isolated liquidation threshold.
   The user explicitly chose to apply corrected maintenance only to new trades. */
ALTER TABLE public.futures_positions ADD COLUMN IF NOT EXISTS maintenance_model smallint NOT NULL DEFAULT 1;
ALTER TABLE public.futures_positions ALTER COLUMN maintenance_model SET DEFAULT 2;
COMMENT ON COLUMN public.futures_positions.maintenance_model IS '1: legacy isolated loss limit; 2: maintenance-margin liquidation. Existing rows retain model 1.';

CREATE OR REPLACE FUNCTION crm_private.derivative_market_quote(p_symbol text)
RETURNS TABLE(price numeric,quoted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT q.price,q.timestamp FROM (
    SELECT c.price,c.timestamp,0 AS priority FROM public.crypto_market_quotes c
      WHERE c.symbol=upper(btrim(p_symbol)) AND upper(btrim(p_symbol)) LIKE '%USDT'
    UNION ALL
    SELECT c.price,c.timestamp,0 FROM public.cfd_market_quotes c
      WHERE c.symbol=upper(btrim(p_symbol)) AND upper(btrim(p_symbol)) NOT LIKE '%USDT'
    UNION ALL
    SELECT m.price,m.timestamp,1 FROM public.market_data m
      WHERE m.symbol=upper(btrim(p_symbol))
        AND NOT EXISTS(SELECT 1 FROM public.crypto_market_quotes c WHERE c.symbol=m.symbol AND m.symbol LIKE '%USDT')
        AND NOT EXISTS(SELECT 1 FROM public.cfd_market_quotes c WHERE c.symbol=m.symbol AND m.symbol NOT LIKE '%USDT')
  ) q WHERE q.price>0 AND q.price::text NOT IN('NaN','Infinity','-Infinity')
    AND q.timestamp IS NOT NULL AND q.timestamp<=now()+interval '1 minute'
  ORDER BY q.priority,q.timestamp DESC NULLS LAST LIMIT 1;
$$;
REVOKE ALL ON FUNCTION crm_private.derivative_market_quote(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.derivative_usd_per_currency(p_currency text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rate numeric; v_at timestamptz;
BEGIN
  IF upper(p_currency) IN('USD','USDT') THEN RETURN 1; END IF;
  SELECT q.price,q.quoted_at INTO v_rate,v_at FROM crm_private.derivative_market_quote(upper(p_currency)||'/USD') q;
  IF v_rate>0 AND v_at BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute' THEN RETURN v_rate; END IF;
  SELECT q.price,q.quoted_at INTO v_rate,v_at FROM crm_private.derivative_market_quote('USD/'||upper(p_currency)) q;
  IF v_rate>0 AND v_at BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute' THEN RETURN 1/v_rate; END IF;
  RAISE EXCEPTION 'No fresh USD conversion quote is available for %',p_currency;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.derivative_loss_limit(p_position public.futures_positions,p_wallet numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN p_position.margin_type='cross' THEN greatest(COALESCE(p_wallet,0)
    -COALESCE((SELECT sum(margin) FROM public.futures_positions
      WHERE user_id=p_position.user_id AND is_open AND margin_type='isolated' AND id<>p_position.id),0),0)
    ELSE least(greatest(COALESCE(p_position.margin,0),0),greatest(COALESCE(p_wallet,0),0)) END;
$$;
REVOKE ALL ON FUNCTION crm_private.derivative_loss_limit(public.futures_positions,numeric) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_private.derivative_position_valuation(
  p_position public.futures_positions,p_price numeric,p_wallet numeric,p_at timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_notional numeric; v_gross numeric; v_exit numeric; v_swap numeric; v_daily numeric;
  v_net numeric; v_cost numeric; v_collateral numeric; v_fx numeric:=1; v_slope numeric;
  v_notional_slope numeric; v_notional_constant numeric:=0; v_liquidation numeric;
  v_maintenance numeric:=CASE WHEN p_position.margin_type='isolated' AND p_position.maintenance_model<2
    THEN 0 ELSE COALESCE(p_position.maintenance_margin_rate,0.005) END;
BEGIN
  IF p_price IS NULL OR p_price<=0 OR p_price::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid valuation price'; END IF;
  v_notional:=public.calculate_derivative_notional_usd(p_position.symbol,p_position.amount,p_price);
  v_gross:=public.calculate_derivative_pnl_usd(p_position.symbol,p_position.side,p_position.entry_price,p_price,p_position.amount);
  v_exit:=public.calculate_derivative_spread_cost_usd(p_position.symbol,v_notional);
  v_daily:=v_notional*public.derivative_swap_rate(p_position.symbol);
  v_swap:=COALESCE(p_position.accumulated_swap_cost,0)+v_daily
    *greatest(extract(epoch FROM (p_at-COALESCE(p_position.swap_accrued_at,p_position.created_at))),0)/86400;
  v_cost:=COALESCE(p_position.spread_cost,0)+v_exit+v_swap;
  v_collateral:=crm_private.derivative_loss_limit(p_position,p_wallet);
  v_net:=greatest(v_gross-v_cost,-v_collateral);

  /* Maintenance estimate in the instrument's quote units, including costs.
     Actual risk exits below use current net equity, never this estimate. */
  IF upper(p_position.symbol) ~ '^[A-Z]{3}/[A-Z]{3}$' THEN
    v_fx:=public.derivative_usd_per_currency(split_part(upper(p_position.symbol),'/',2));
  END IF;
  v_slope:=p_position.amount*v_fx;
  v_notional_slope:=v_slope;
  IF upper(p_position.symbol) LIKE 'USD/%' THEN
    v_notional_slope:=0; v_notional_constant:=p_position.amount;
  END IF;
  IF p_position.side='long' THEN
    v_liquidation:=(v_slope*p_position.entry_price-v_collateral+v_cost+v_maintenance*v_notional_constant)
      /NULLIF(v_slope-v_maintenance*v_notional_slope,0);
  ELSE
    v_liquidation:=(v_collateral+v_slope*p_position.entry_price-v_cost-v_maintenance*v_notional_constant)
      /NULLIF(v_slope+v_maintenance*v_notional_slope,0);
  END IF;
  RETURN jsonb_build_object('current_price',p_price,'unrealized_pnl',v_net,
    'roi',CASE WHEN p_position.margin>0 THEN v_net/p_position.margin*100 ELSE 0 END,
    'gross_unrealized_pnl',v_gross,'entry_spread_cost',COALESCE(p_position.spread_cost,0),
    'uncapped_unrealized_pnl',v_gross-v_cost,
    'estimated_exit_spread_cost',v_exit,'estimated_swap_cost',v_swap,'daily_swap_cost',v_daily,
    'liquidation_price',round(greatest(COALESCE(v_liquidation,0.00000001),0.00000001),8),
    'valuation_at',p_at,'valuation_available',true);
END;
$$;
REVOKE ALL ON FUNCTION crm_private.derivative_position_valuation(public.futures_positions,numeric,numeric,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_private.mark_derivative_position(p_position_id uuid,p_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_position public.futures_positions; v_wallet numeric; v_values jsonb;
BEGIN
  SELECT * INTO v_position FROM public.futures_positions WHERE id=p_position_id AND is_open FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT usdt_balance INTO v_wallet FROM public.balances WHERE user_id=v_position.user_id;
  v_values:=crm_private.derivative_position_valuation(v_position,p_price,v_wallet);
  UPDATE public.futures_positions SET current_price=p_price,
    unrealized_pnl=(v_values->>'unrealized_pnl')::numeric,roi=(v_values->>'roi')::numeric,
    liquidation_price=(v_values->>'liquidation_price')::numeric,updated_at=now() WHERE id=p_position_id;
END;
$$;
REVOKE ALL ON FUNCTION crm_private.mark_derivative_position(uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_my_derivative_positions()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_position public.futures_positions; v_wallet numeric; v_price numeric; v_quote_at timestamptz;
  v_values jsonb; v_rows jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT usdt_balance INTO v_wallet FROM public.balances WHERE user_id=auth.uid();
  FOR v_position IN SELECT * FROM public.futures_positions WHERE user_id=auth.uid() AND is_open ORDER BY created_at DESC LOOP
    BEGIN
      SELECT q.price,q.quoted_at INTO v_price,v_quote_at FROM crm_private.derivative_market_quote(v_position.symbol) q;
      v_values:=crm_private.derivative_position_valuation(v_position,COALESCE(v_price,v_position.current_price),v_wallet);
      v_values:=v_values||jsonb_build_object('quote_timestamp',v_quote_at,
        'quote_fresh',COALESCE(v_quote_at BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute',false));
    EXCEPTION WHEN OTHERS THEN
      /* A missing FX quote must not hide this client's other positions. */
      v_values:=jsonb_build_object('valuation_available',false,'valuation_error',SQLERRM);
    END;
    v_rows:=v_rows||jsonb_build_array(to_jsonb(v_position)||v_values);
  END LOOP;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_derivative_positions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_derivative_positions() TO authenticated;

/* Commissions derive from a real closed position, never a browser-supplied P&L.
   Match the deployed referral schema and the existing configured rate. */
CREATE OR REPLACE FUNCTION public.process_referral_commission(
  p_referred_user_id uuid,p_position_id uuid,p_position_pnl numeric,p_position_symbol text,p_position_side text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_history public.futures_position_history; v_referrer uuid; v_rate numeric; v_amount numeric;
BEGIN
  SELECT * INTO v_history FROM public.futures_position_history
    WHERE id=p_position_id AND user_id=p_referred_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'A settled position is required for referral commission'; END IF;
  IF v_history.pnl<=0 THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('derivative-referral:'||p_position_id::text,0));
  IF EXISTS(SELECT 1 FROM public.referral_earnings WHERE position_id=p_position_id) THEN RETURN; END IF;
  SELECT c.referred_by,COALESCE(c.referral_commission_rate,0.01) INTO v_referrer,v_rate
    FROM public.users c JOIN public.users r ON r.id=c.referred_by AND r.company_id=c.company_id
    WHERE c.id=p_referred_user_id AND r.id<>c.id;
  IF v_referrer IS NULL OR v_rate IS NULL OR v_rate<=0 THEN RETURN; END IF;
  IF v_rate>1 THEN RAISE EXCEPTION 'Invalid referral commission rate'; END IF;
  v_amount:=round(v_history.pnl*v_rate,8);
  IF v_amount<=0 THEN RETURN; END IF;
  INSERT INTO public.referral_earnings(referrer_id,referred_user_id,position_id,commission_amount,position_pnl,position_symbol,position_side)
    VALUES(v_referrer,p_referred_user_id,p_position_id,v_amount,v_history.pnl,v_history.symbol,v_history.side);
  UPDATE public.balances SET usdt_balance=usdt_balance+v_amount,updated_at=now() WHERE user_id=v_referrer;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referral wallet not found'; END IF;
  UPDATE public.users SET total_referral_earnings=COALESCE(total_referral_earnings,0)+v_amount,updated_at=now() WHERE id=v_referrer;
  INSERT INTO public.transactions(user_id,type,amount,currency,description,status)
    VALUES(v_referrer,'trade',v_amount,'USDT','Referral commission from '||v_history.symbol||' '||v_history.side||' position','completed');
END;
$$;
REVOKE ALL ON FUNCTION public.process_referral_commission(uuid,uuid,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_commission(uuid,uuid,numeric,text,text) TO service_role;

DO $migration$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.place_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric)'::regprocedure) INTO v_definition;
  v_definition:=replace(v_definition,'v_id uuid;','v_id uuid; v_quote_at timestamptz;');
  v_old:='IF p_user_id IS NULL THEN RAISE EXCEPTION ''User is required''; END IF;';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected placement definition'; END IF;
  v_definition:=replace(v_definition,v_old,v_old||$patch$
    IF p_symbol IS NULL OR p_side IS NULL OR p_margin_type IS NULL OR p_order_type IS NULL
      OR p_leverage IS NULL OR p_leverage<1 OR p_leverage>10000
      OR p_amount::text IN('NaN','Infinity','-Infinity') OR p_amount<>round(p_amount,8)
      OR (p_stop_loss IS NOT NULL AND (p_stop_loss<=0 OR p_stop_loss::text IN('NaN','Infinity','-Infinity')))
      OR (p_take_profit IS NOT NULL AND (p_take_profit<=0 OR p_take_profit::text IN('NaN','Infinity','-Infinity')))
      OR (p_limit_price IS NOT NULL AND p_limit_price::text IN('NaN','Infinity','-Infinity')) THEN
      RAISE EXCEPTION 'Invalid order parameters';
    END IF;
    SELECT q.price,q.quoted_at INTO p_market_price,v_quote_at FROM crm_private.derivative_market_quote(p_symbol) q;
    IF p_market_price IS NULL OR v_quote_at IS NULL OR v_quote_at NOT BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute' THEN
      RAISE EXCEPTION 'A verified live price is required before placing an order.';
    END IF;
  $patch$);
  v_definition:=replace(v_definition,'WHEN v_symbol ~ ''^[A-Z]{3}/[A-Z]{3}$'' THEN',
    'WHEN v_symbol ~ ''^[A-Z]{3}/[A-Z]{3}$'' AND COALESCE(v_instrument_type,'''') NOT IN(''commodity'',''stock'',''index'') THEN');
  v_old:='RETURN jsonb_build_object(''success'', true, ''kind'', ''position'', ''id'', v_id, ''margin'', v_margin);';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected placement return'; END IF;
  v_definition:=replace(v_definition,v_old,$patch$
    PERFORM crm_private.mark_derivative_position(v_id,p_market_price);
    IF EXISTS(SELECT 1 FROM public.futures_positions WHERE id=v_id
      AND margin+unrealized_pnl<=v_notional*0.005) THEN
      RAISE EXCEPTION 'Insufficient margin to cover trading costs and maintenance';
    END IF;
  $patch$||v_old);
  EXECUTE v_definition;

  SELECT pg_get_functiondef('crm_private.client_trade_limits(uuid,text)'::regprocedure) INTO v_definition;
  EXECUTE replace(v_definition,'WHEN p_symbol ~ ''^[A-Z]{3}/[A-Z]{3}$'' THEN',
    'WHEN p_symbol ~ ''^[A-Z]{3}/[A-Z]{3}$'' AND COALESCE(s.instrument_type,'''') NOT IN(''commodity'',''stock'',''index'') THEN');

  SELECT pg_get_functiondef('public.close_futures_position(uuid,numeric)'::regprocedure) INTO v_definition;
  v_old:='FROM public.market_data md WHERE md.symbol = v_position.symbol';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected close quote source'; END IF;
  v_definition:=replace(v_definition,'SELECT md.price, md.timestamp','SELECT md.price, md.quoted_at');
  v_definition:=replace(v_definition,v_old,'FROM crm_private.derivative_market_quote(v_position.symbol) md');
  v_definition:=replace(v_definition,'ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC LIMIT 1;', 'LIMIT 1;');
  v_definition:=replace(v_definition,'interval ''2 minutes''','interval ''6 minutes''');
  /* Exit execution is exactly the authenticated server quote, never a browser price. */
  v_definition:=replace(v_definition,'v_notional := public.calculate_derivative_notional_usd',
    'exit_price:=v_market_price; v_notional := public.calculate_derivative_notional_usd');
  v_old:='CASE WHEN v_position.margin_type = ''cross'' THEN -v_wallet_balance ELSE -v_position.margin END';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected close loss limit'; END IF;
  v_definition:=replace(v_definition,v_old,'-crm_private.derivative_loss_limit(v_position,v_wallet_balance)');
  v_old:=substring(v_definition FROM position('  SELECT u.referred_by' IN v_definition)
    FOR position('  RETURN v_net_pnl;' IN v_definition)-position('  SELECT u.referred_by' IN v_definition));
  IF v_old IS NULL OR position('public.referral_earnings' IN v_old)=0 THEN RAISE EXCEPTION 'Unexpected referral settlement block'; END IF;
  v_definition:=replace(v_definition,v_old,$patch$
    IF v_net_pnl>0 THEN
      PERFORM public.process_referral_commission(v_position.user_id,position_id,v_net_pnl,v_position.symbol,v_position.side);
    END IF;
  $patch$);
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.process_futures_engine()'::regprocedure) INTO v_definition;
  v_definition:=replace(v_definition,chr(13),'');
  v_definition:=replace(v_definition,'v_closed integer := 0;','v_closed integer := 0; v_risk_net numeric;');
  v_definition:=replace(v_definition,'SELECT md.price, md.timestamp INTO v_price, v_price_time',
    'SELECT md.price, md.quoted_at INTO v_price, v_price_time');
  v_definition:=replace(v_definition,'FROM public.market_data md WHERE md.symbol = v_order.symbol',
    'FROM crm_private.derivative_market_quote(v_order.symbol) md');
  v_definition:=replace(v_definition,'FROM public.market_data md WHERE md.symbol = v_position.symbol',
    'FROM crm_private.derivative_market_quote(v_position.symbol) md');
  v_definition:=replace(v_definition,'ORDER BY md.updated_at DESC NULLS LAST, md.timestamp DESC LIMIT 1;','LIMIT 1;');
  v_definition:=replace(v_definition,'interval ''3 minutes''','interval ''6 minutes''');
  v_definition:=replace(v_definition,'interval ''2 minutes''','interval ''6 minutes''');
  /* A missing conversion for one pending order cannot abort unrelated fills. */
  v_old:='    ORDER BY created_at FOR UPDATE SKIP LOCKED'||chr(10)||'  LOOP';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected pending-order loop'; END IF;
  v_definition:=replace(v_definition,v_old,v_old||chr(10)||'    BEGIN');
  v_old:='    v_filled := v_filled + 1;'||chr(10)||'  END LOOP;';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected pending-order completion'; END IF;
  v_definition:=replace(v_definition,v_old,'    v_filled := v_filled + 1;
    EXCEPTION WHEN OTHERS THEN RAISE WARNING ''Order % could not be filled: %'',v_order.id,SQLERRM; END;
  END LOOP;');
  v_old:=substring(v_definition FROM position('  UPDATE public.futures_positions fp' IN v_definition)
    FOR position('  FOR v_position IN' IN v_definition)-position('  UPDATE public.futures_positions fp' IN v_definition));
  IF v_old IS NULL OR position('SET current_price' IN v_old)=0 THEN RAISE EXCEPTION 'Unexpected mark-to-market block'; END IF;
  v_new:=$patch$
  FOR v_position IN SELECT * FROM public.futures_positions WHERE is_open FOR UPDATE SKIP LOCKED LOOP
    SELECT q.price,q.quoted_at INTO v_price,v_price_time FROM crm_private.derivative_market_quote(v_position.symbol) q;
    IF v_price>0 AND v_price_time BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute' THEN
      BEGIN
        PERFORM crm_private.mark_derivative_position(v_position.id,v_price);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Position % could not be valued: %',v_position.id,SQLERRM;
      END;
    END IF;
  END LOOP;

  $patch$;
  v_definition:=replace(v_definition,v_old,v_new);
  /* Use the executable quote for a limit fill, including price improvement. */
  v_definition:=replace(v_definition,'v_margin := v_order.reserved_margin;',
    'v_margin := round(public.calculate_derivative_notional_usd(v_order.symbol,v_order.amount,v_price)/v_order.leverage,8);');
  v_definition:=replace(v_definition,'v_order.amount, v_order.price','v_order.amount, v_price');
  v_definition:=replace(v_definition,'v_order.price, v_order.amount','v_price, v_order.amount');
  v_definition:=replace(v_definition,'v_order.price, v_price, v_order.amount','v_price, v_price, v_order.amount');
  v_old:='    v_liquidation := public.futures_liquidation_price(';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected limit fill calculation'; END IF;
  v_definition:=replace(v_definition,v_old,'    IF v_margin-2*v_spread<=v_notional*0.005 THEN
      UPDATE public.futures_orders SET status=''cancelled'' WHERE id=v_order.id; CONTINUE;
    END IF;'||chr(10)||v_old);
  v_definition:=replace(v_definition,'IF (v_position.tp_price IS NOT NULL AND (',$patch$
    BEGIN
      SELECT (crm_private.derivative_position_valuation(v_position,v_price,b.usdt_balance)->>'uncapped_unrealized_pnl')::numeric
        INTO v_risk_net FROM public.balances b WHERE b.user_id=v_position.user_id;
    EXCEPTION WHEN OTHERS THEN CONTINUE; END;
    IF (v_position.tp_price IS NOT NULL AND (
  $patch$);
  v_definition:=replace(v_definition,'v_position.unrealized_pnl <= -v_position.margin',
    'v_position.margin+v_risk_net <= public.calculate_derivative_notional_usd(v_position.symbol,v_position.amount,v_price)*CASE WHEN v_position.maintenance_model>=2 THEN COALESCE(v_position.maintenance_margin_rate,0.005) ELSE 0 END');
  v_definition:=replace(v_definition,'b.usdt_balance + sum(fp.unrealized_pnl) AS entry_price',
    'b.usdt_balance - COALESCE((SELECT sum(i.margin) FROM public.futures_positions i WHERE i.user_id=fp.user_id AND i.is_open AND i.margin_type=''isolated''),0) + sum(fp.unrealized_pnl) AS entry_price');
  v_definition:=replace(v_definition,
    'PERFORM public.close_futures_position(v_position.id, v_price);'||chr(10)||'      v_closed := v_closed + 1;',
    'BEGIN PERFORM public.close_futures_position(v_position.id, v_price); v_closed:=v_closed+1;
     EXCEPTION WHEN OTHERS THEN RAISE WARNING ''Position % risk exit failed: %'',v_position.id,SQLERRM; END;');
  v_definition:=replace(v_definition,
    'PERFORM public.close_futures_position(v_position_id, v_price);'||chr(10)||'        v_closed := v_closed + 1;',
    'BEGIN PERFORM public.close_futures_position(v_position_id, v_price); v_closed:=v_closed+1;
     EXCEPTION WHEN OTHERS THEN RAISE WARNING ''Cross position % risk exit failed: %'',v_position_id,SQLERRM; END;');
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.update_futures_risk(uuid,numeric,numeric,boolean,boolean)'::regprocedure) INTO v_definition;
  v_old:='IF v_user_id IS NULL THEN RAISE EXCEPTION ''Authentication required''; END IF;';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected risk update guard'; END IF;
  EXECUTE replace(v_definition,v_old,v_old||$patch$
    IF (p_update_stop_loss AND p_stop_loss IS NOT NULL AND
        (p_stop_loss<=0 OR p_stop_loss::text IN('NaN','Infinity','-Infinity')))
      OR (p_update_take_profit AND p_take_profit IS NOT NULL AND
        (p_take_profit<=0 OR p_take_profit::text IN('NaN','Infinity','-Infinity'))) THEN
      RAISE EXCEPTION 'Enter valid stop-loss and take-profit prices';
    END IF;
  $patch$);

  SELECT pg_get_functiondef('public.admin_update_module_record(uuid,text,uuid,jsonb,text)'::regprocedure) INTO v_definition;
  IF position('''created_at'', ''updated_at''' IN v_definition)>0 THEN
    EXECUTE replace(v_definition,'''created_at'', ''updated_at''','''created_at'', ''updated_at'', ''maintenance_model''');
  ELSE RAISE EXCEPTION 'Unexpected CRM record-ownership guard'; END IF;
END;
$migration$;

CREATE TABLE crm_private.derivative_order_requests(
  request_key uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parameters jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON crm_private.derivative_order_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.place_client_derivative_order(
  p_user_id uuid,p_symbol text,p_side text,p_amount numeric,p_leverage integer,p_margin_type text,
  p_order_type text,p_market_price numeric,p_limit_price numeric DEFAULT NULL,
  p_stop_loss numeric DEFAULT NULL,p_take_profit numeric DEFAULT NULL,p_request_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parameters jsonb; v_existing crm_private.derivative_order_requests; v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  /* Legacy published clients can still place orders without a request key. */
  IF p_request_key IS NULL THEN
    RETURN public.place_derivative_order(p_user_id,p_symbol,p_side,p_amount,p_leverage,p_margin_type,p_order_type,p_market_price,p_limit_price,p_stop_loss,p_take_profit);
  END IF;
  v_parameters:=jsonb_build_object('symbol',upper(btrim(p_symbol)),'side',p_side,'amount',p_amount,
    'leverage',p_leverage,'margin_type',p_margin_type,'order_type',p_order_type,
    'limit_price',p_limit_price,'stop_loss',p_stop_loss,'take_profit',p_take_profit);
  PERFORM pg_advisory_xact_lock(hashtextextended('client-order:'||p_request_key::text,0));
  SELECT * INTO v_existing FROM crm_private.derivative_order_requests WHERE request_key=p_request_key;
  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM p_user_id OR v_existing.parameters IS DISTINCT FROM v_parameters THEN
      RAISE EXCEPTION 'This request reference has already been used for a different order';
    END IF;
    RETURN v_existing.result;
  END IF;
  v_result:=public.place_derivative_order(p_user_id,p_symbol,p_side,p_amount,p_leverage,p_margin_type,p_order_type,p_market_price,p_limit_price,p_stop_loss,p_take_profit);
  INSERT INTO crm_private.derivative_order_requests(request_key,user_id,parameters,result)
    VALUES(p_request_key,p_user_id,v_parameters,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.place_client_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.place_client_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric,uuid) TO service_role;

/* Spread configuration is public trading metadata, with a qualified lookup. */
CREATE OR REPLACE FUNCTION public.get_instrument_spread(p_symbol text)
RETURNS TABLE(symbol text,instrument_type text,spread_percentage numeric,min_spread_value numeric,max_spread_value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN QUERY SELECT s.symbol,s.instrument_type,s.spread_percentage,s.min_spread_value,s.max_spread_value
    FROM public.instrument_spreads s WHERE s.symbol=upper(btrim(p_symbol)) AND s.is_active LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT upper(btrim(p_symbol)),'unknown'::text,0.0001::numeric,0.00000001::numeric,999999.99999999::numeric; END IF;
END;
$$;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
    AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='instrument_spreads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.instrument_spreads;
  END IF;
END;
$$;
