/*
  # Fix numeric field overflow errors

  1. Problem
    - Database columns with NUMERIC(10,4) precision can only store values up to 999,999.9999
    - Cryptocurrency prices and calculations often exceed this limit
    - This causes "numeric field overflow" errors in trading operations

  2. Solution
    - Increase precision to NUMERIC(20,8) for all monetary/price columns
    - This allows values up to 999,999,999,999.99999999
    - Sufficient for cryptocurrency prices and large portfolio values

  3. Affected Tables
    - futures_positions, futures_orders, prop_positions, prop_orders
    - market_data, balances, transactions, user_stakes
    - event_outcomes, event_bets, robot_states, portfolio_snapshots, user_assets
*/

-- Fix futures_positions table
ALTER TABLE public.futures_positions ALTER COLUMN entry_price TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN current_price TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN liquidation_price TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN unrealized_pnl TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN margin TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN roi TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN position_size TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN tp_price TYPE NUMERIC(20,8);
ALTER TABLE public.futures_positions ALTER COLUMN sl_price TYPE NUMERIC(20,8);

-- Fix futures_orders table
ALTER TABLE public.futures_orders ALTER COLUMN price TYPE NUMERIC(20,8);
ALTER TABLE public.futures_orders ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.futures_orders ALTER COLUMN tp_price TYPE NUMERIC(20,8);
ALTER TABLE public.futures_orders ALTER COLUMN sl_price TYPE NUMERIC(20,8);

-- Fix prop_positions table
ALTER TABLE public.prop_positions ALTER COLUMN entry_price TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN current_price TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN liquidation_price TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN unrealized_pnl TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN margin TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN roi TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN position_size TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN tp_price TYPE NUMERIC(20,8);
ALTER TABLE public.prop_positions ALTER COLUMN sl_price TYPE NUMERIC(20,8);

-- Fix prop_orders table
ALTER TABLE public.prop_orders ALTER COLUMN price TYPE NUMERIC(20,8);
ALTER TABLE public.prop_orders ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.prop_orders ALTER COLUMN tp_price TYPE NUMERIC(20,8);
ALTER TABLE public.prop_orders ALTER COLUMN sl_price TYPE NUMERIC(20,8);

-- Fix market_data table
ALTER TABLE public.market_data ALTER COLUMN price TYPE NUMERIC(20,8);
ALTER TABLE public.market_data ALTER COLUMN volume_24h TYPE NUMERIC(20,8);
ALTER TABLE public.market_data ALTER COLUMN change_24h TYPE NUMERIC(20,8);
ALTER TABLE public.market_data ALTER COLUMN high_price_24h TYPE NUMERIC(20,8);
ALTER TABLE public.market_data ALTER COLUMN low_price_24h TYPE NUMERIC(20,8);
ALTER TABLE public.market_data ALTER COLUMN market_cap TYPE NUMERIC(30,2);
ALTER TABLE public.market_data ALTER COLUMN funding_rate TYPE NUMERIC(20,8);
ALTER TABLE public.market_data ALTER COLUMN open_interest TYPE NUMERIC(30,2);
ALTER TABLE public.market_data ALTER COLUMN bid_price TYPE NUMERIC(20,8);
ALTER TABLE public.market_data ALTER COLUMN ask_price TYPE NUMERIC(20,8);

-- Fix balances table
ALTER TABLE public.balances ALTER COLUMN usdt_balance TYPE NUMERIC(20,8);
ALTER TABLE public.balances ALTER COLUMN btc_balance TYPE NUMERIC(20,8);

-- Fix transactions table
ALTER TABLE public.transactions ALTER COLUMN amount TYPE NUMERIC(20,8);

-- Fix user_stakes table
ALTER TABLE public.user_stakes ALTER COLUMN staked_amount TYPE NUMERIC(20,8);
ALTER TABLE public.user_stakes ALTER COLUMN apy_rate TYPE NUMERIC(20,8);
ALTER TABLE public.user_stakes ALTER COLUMN earned_amount TYPE NUMERIC(20,8);

-- Fix event_outcomes table
ALTER TABLE public.event_outcomes ALTER COLUMN current_price TYPE NUMERIC(20,8);
ALTER TABLE public.event_outcomes ALTER COLUMN total_volume TYPE NUMERIC(20,8);

-- Fix event_bets table
ALTER TABLE public.event_bets ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.event_bets ALTER COLUMN price_at_bet TYPE NUMERIC(20,8);
ALTER TABLE public.event_bets ALTER COLUMN shares TYPE NUMERIC(20,8);

-- Fix robot_states table
ALTER TABLE public.robot_states ALTER COLUMN min_profit_threshold TYPE NUMERIC(20,8);
ALTER TABLE public.robot_states ALTER COLUMN max_trade_amount TYPE NUMERIC(20,8);
ALTER TABLE public.robot_states ALTER COLUMN allocated_balance TYPE NUMERIC(20,8);
ALTER TABLE public.robot_states ALTER COLUMN todays_profit TYPE NUMERIC(20,8);
ALTER TABLE public.robot_states ALTER COLUMN challenge_account_balance TYPE NUMERIC(20,8);
ALTER TABLE public.robot_states ALTER COLUMN challenge_profit_target TYPE NUMERIC(20,8);
ALTER TABLE public.robot_states ALTER COLUMN challenge_max_drawdown TYPE NUMERIC(20,8);
ALTER TABLE public.robot_states ALTER COLUMN challenge_initial_balance TYPE NUMERIC(20,8);

-- Fix portfolio_snapshots table
ALTER TABLE public.portfolio_snapshots ALTER COLUMN total_value TYPE NUMERIC(20,8);
ALTER TABLE public.portfolio_snapshots ALTER COLUMN usdt_balance TYPE NUMERIC(20,8);
ALTER TABLE public.portfolio_snapshots ALTER COLUMN btc_balance TYPE NUMERIC(20,8);
ALTER TABLE public.portfolio_snapshots ALTER COLUMN btc_price TYPE NUMERIC(20,8);

-- Fix user_assets table
ALTER TABLE public.user_assets ALTER COLUMN balance TYPE NUMERIC(20,8);

-- Fix price_data table
ALTER TABLE public.price_data ALTER COLUMN price TYPE NUMERIC(20,8);

-- Fix binary_trades table
ALTER TABLE public.binary_trades ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.binary_trades ALTER COLUMN entry_price TYPE NUMERIC(20,8);
ALTER TABLE public.binary_trades ALTER COLUMN settlement_price TYPE NUMERIC(20,8);
ALTER TABLE public.binary_trades ALTER COLUMN pnl TYPE NUMERIC(20,8);
ALTER TABLE public.binary_trades ALTER COLUMN profit_percentage TYPE NUMERIC(20,8);

-- Fix spot_orders table
ALTER TABLE public.spot_orders ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.spot_orders ALTER COLUMN rate TYPE NUMERIC(20,8);
ALTER TABLE public.spot_orders ALTER COLUMN total TYPE NUMERIC(20,8);
ALTER TABLE public.spot_orders ALTER COLUMN filled TYPE NUMERIC(20,8);
ALTER TABLE public.spot_orders ALTER COLUMN remaining_amount TYPE NUMERIC(20,8);
ALTER TABLE public.spot_orders ALTER COLUMN stop_loss_price TYPE NUMERIC(20,8);
ALTER TABLE public.spot_orders ALTER COLUMN take_profit_price TYPE NUMERIC(20,8);

-- Fix order_book table
ALTER TABLE public.order_book ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.order_book ALTER COLUMN price TYPE NUMERIC(20,8);
ALTER TABLE public.order_book ALTER COLUMN filled_amount TYPE NUMERIC(20,8);
ALTER TABLE public.order_book ALTER COLUMN remaining_amount TYPE NUMERIC(20,8);

-- Fix stop_orders table
ALTER TABLE public.stop_orders ALTER COLUMN trigger_price TYPE NUMERIC(20,8);
ALTER TABLE public.stop_orders ALTER COLUMN execution_price TYPE NUMERIC(20,8);
ALTER TABLE public.stop_orders ALTER COLUMN amount TYPE NUMERIC(20,8);

-- Fix order_fills table
ALTER TABLE public.order_fills ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.order_fills ALTER COLUMN price TYPE NUMERIC(20,8);
ALTER TABLE public.order_fills ALTER COLUMN fee TYPE NUMERIC(20,8);

-- Fix futures_position_history table
ALTER TABLE public.futures_position_history ALTER COLUMN entry_price TYPE NUMERIC(20,8);
ALTER TABLE public.futures_position_history ALTER COLUMN exit_price TYPE NUMERIC(20,8);
ALTER TABLE public.futures_position_history ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.futures_position_history ALTER COLUMN margin TYPE NUMERIC(20,8);
ALTER TABLE public.futures_position_history ALTER COLUMN pnl TYPE NUMERIC(20,8);
ALTER TABLE public.futures_position_history ALTER COLUMN roi TYPE NUMERIC(20,8);

-- Fix prop_position_history table
ALTER TABLE public.prop_position_history ALTER COLUMN entry_price TYPE NUMERIC(20,8);
ALTER TABLE public.prop_position_history ALTER COLUMN exit_price TYPE NUMERIC(20,8);
ALTER TABLE public.prop_position_history ALTER COLUMN amount TYPE NUMERIC(20,8);
ALTER TABLE public.prop_position_history ALTER COLUMN margin TYPE NUMERIC(20,8);
ALTER TABLE public.prop_position_history ALTER COLUMN pnl TYPE NUMERIC(20,8);
ALTER TABLE public.prop_position_history ALTER COLUMN roi TYPE NUMERIC(20,8);

-- Fix prop_account_balances table
ALTER TABLE public.prop_account_balances ALTER COLUMN starting_balance TYPE NUMERIC(20,8);
ALTER TABLE public.prop_account_balances ALTER COLUMN current_balance TYPE NUMERIC(20,8);
ALTER TABLE public.prop_account_balances ALTER COLUMN max_balance TYPE NUMERIC(20,8);
ALTER TABLE public.prop_account_balances ALTER COLUMN max_drawdown TYPE NUMERIC(20,8);
ALTER TABLE public.prop_account_balances ALTER COLUMN max_drawdown_reached TYPE NUMERIC(20,8);
ALTER TABLE public.prop_account_balances ALTER COLUMN target_profit TYPE NUMERIC(20,8);
ALTER TABLE public.prop_account_balances ALTER COLUMN daily_loss_limit TYPE NUMERIC(20,8);
ALTER TABLE public.prop_account_balances ALTER COLUMN weekly_loss_limit TYPE NUMERIC(20,8);

-- Fix events table
ALTER TABLE public.events ALTER COLUMN volume TYPE NUMERIC(20,8);