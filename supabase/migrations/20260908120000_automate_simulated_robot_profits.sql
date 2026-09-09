/*
  Credit one simulated, CRM-controlled profit per active robot per UTC day.

  The CRM writes robot_states.custom_daily_profit_percentage. When that value is
  null, the public investment-tier rate is used. The processor is safe to run
  repeatedly: row locks and last_profit_timestamp prevent duplicate daily credit.
*/

CREATE OR REPLACE FUNCTION public.process_simulated_robot_profits()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_robot public.robot_states%ROWTYPE;
  v_btc_price numeric := 50000;
  v_btc_amount numeric;
  v_daily_percentage numeric;
  v_daily_profit numeric;
  v_processed integer := 0;
  v_credited_total numeric := 0;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT md.price
  INTO v_btc_price
  FROM public.market_data AS md
  WHERE md.symbol = 'BTCUSDT' AND md.price > 0
  ORDER BY md.timestamp DESC
  LIMIT 1;

  v_btc_price := COALESCE(NULLIF(v_btc_price, 0), 50000);

  FOR v_robot IN
    SELECT rs.*
    FROM public.robot_states AS rs
    WHERE rs.is_active = true
      AND rs.allocated_balance > 0
      AND (
        rs.last_profit_timestamp IS NULL
        OR (rs.last_profit_timestamp AT TIME ZONE 'UTC')::date < v_today
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    v_btc_amount := v_robot.allocated_balance / v_btc_price;

    v_daily_percentage := CASE
      WHEN v_robot.custom_daily_profit_percentage IS NOT NULL
        THEN GREATEST(v_robot.custom_daily_profit_percentage, 0)
      WHEN v_btc_amount >= 50 THEN 2.1
      WHEN v_btc_amount >= 10 THEN 1.2
      WHEN v_btc_amount >= 5 THEN 0.8
      WHEN v_btc_amount >= 1 THEN 0.6
      WHEN v_btc_amount >= 0.1 THEN 0.35
      ELSE 0.2
    END;

    v_daily_profit := round(
      v_robot.allocated_balance * (v_daily_percentage / 100),
      8
    );

    UPDATE public.robot_states
    SET allocated_balance = allocated_balance + v_daily_profit,
        todays_profit = v_daily_profit,
        total_trades = COALESCE(total_trades, 0) + 1,
        successful_trades = COALESCE(successful_trades, 0) + 1,
        last_profit_timestamp = now(),
        updated_at = now()
    WHERE id = v_robot.id;

    IF v_daily_profit > 0 THEN
      INSERT INTO public.transactions (
        user_id, type, amount, description, status
      ) VALUES (
        v_robot.user_id,
        'robot_profit',
        v_daily_profit,
        format(
          'Daily simulated robot profit (%s%% of %s USDT)',
          v_daily_percentage,
          v_robot.allocated_balance
        ),
        'completed'
      );

      INSERT INTO public.system_logs (action, details)
      VALUES (
        'robot_daily_profit',
        format(
          'Robot %s credited %s USDT at %s%%',
          v_robot.id,
          v_daily_profit,
          v_daily_percentage
        )
      );
    END IF;

    v_processed := v_processed + 1;
    v_credited_total := v_credited_total + v_daily_profit;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'credited_total', v_credited_total,
    'date', v_today
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_simulated_robot_profits() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_simulated_robot_profits() FROM anon;
REVOKE ALL ON FUNCTION public.process_simulated_robot_profits() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_simulated_robot_profits() TO service_role;

-- Customers may update their normal robot settings, but only the CRM's service
-- role may change the rate that controls credited profit.
CREATE OR REPLACE FUNCTION public.protect_robot_profit_percentage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.custom_daily_profit_percentage IS DISTINCT FROM NEW.custom_daily_profit_percentage
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.check_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Only the CRM may change the robot profit percentage';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_robot_profit_percentage
ON public.robot_states;

CREATE TRIGGER protect_robot_profit_percentage
BEFORE UPDATE OF custom_daily_profit_percentage ON public.robot_states
FOR EACH ROW
EXECUTE FUNCTION public.protect_robot_profit_percentage();

-- Run frequently so newly activated robots do not have to wait until the next
-- midnight. The function itself guarantees at most one credit per UTC day.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'process-simulated-robot-profits';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'process-simulated-robot-profits',
  '*/5 * * * *',
  'SELECT public.process_simulated_robot_profits();'
);
