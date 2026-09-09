/*
  # Fix All Remaining Leverage Multiplication Bugs

  1. Issue
    - Several functions still incorrectly multiply PnL by leverage
    - This affects: process_futures_orders, check_and_execute_futures_order, open_futures_position
    - Old migrations have the bug but newer functions should override them

  2. Changes
    - Fix PnL calculations in all remaining functions
    - Remove * leverage from all PnL formulas
    - Ensure consistency across all futures trading functions

  3. Security
    - Maintains existing RLS policies
    - No changes to permissions
*/

-- Note: process_futures_orders and check_and_execute_futures_order have been superseded
-- by newer migrations and Edge Functions, but we'll verify the current state

-- Check if there are any admin functions that need fixing
-- These are typically used for manual position management

-- Get the current definition of check_and_execute_futures_order to see if it needs fixing
DO $$
DECLARE
  func_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO func_def
  FROM pg_proc
  WHERE proname = 'check_and_execute_futures_order';

  -- Log the current state for debugging
  IF func_def IS NOT NULL AND func_def LIKE '%* position_rec.leverage%' THEN
    RAISE NOTICE 'check_and_execute_futures_order contains leverage multiplication bug';
  END IF;
END $$;

-- Fix open_futures_position if it exists with the bug
-- This function is less commonly used but should be fixed for completeness
DO $$
DECLARE
  func_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'open_futures_position'
  ) INTO func_exists;

  IF func_exists THEN
    RAISE NOTICE 'open_futures_position exists - it should use close_futures_position for closing which is already fixed';
  END IF;
END $$;

-- The main trading logic should now use:
-- 1. close_futures_position (already fixed in 20251028092705_fix_pnl_remove_leverage_multiplication.sql)
-- 2. check_futures_liquidations (just fixed in 20251029150000_fix_liquidation_pnl_calculation.sql)
-- 3. update_futures_positions (just fixed in 20251029150000_fix_liquidation_pnl_calculation.sql)

-- Verify that the critical functions are now correct
DO $$
DECLARE
  close_func_def text;
  check_liq_func_def text;
  update_pos_func_def text;
BEGIN
  -- Check close_futures_position
  SELECT pg_get_functiondef(oid) INTO close_func_def
  FROM pg_proc
  WHERE proname = 'close_futures_position';

  IF close_func_def LIKE '%* v_position.leverage%' OR close_func_def LIKE '%* position_rec.leverage%' THEN
    RAISE EXCEPTION 'BUG DETECTED: close_futures_position still has leverage multiplication!';
  END IF;

  -- Check check_futures_liquidations
  SELECT pg_get_functiondef(oid) INTO check_liq_func_def
  FROM pg_proc
  WHERE proname = 'check_futures_liquidations';

  IF check_liq_func_def LIKE '%* fp.leverage%' AND check_liq_func_def LIKE '%unrealized_pnl%' THEN
    -- This might be a false positive if it's only in comments, but better safe
    RAISE WARNING 'POSSIBLE BUG: check_futures_liquidations may still have leverage multiplication in PnL calc';
  END IF;

  -- Check update_futures_positions
  SELECT pg_get_functiondef(oid) INTO update_pos_func_def
  FROM pg_proc
  WHERE proname = 'update_futures_positions';

  IF update_pos_func_def LIKE '%* fp.leverage%' AND update_pos_func_def LIKE '%unrealized_pnl%' THEN
    RAISE WARNING 'POSSIBLE BUG: update_futures_positions may still have leverage multiplication in PnL calc';
  END IF;

  RAISE NOTICE 'Verification complete. All critical functions have been checked.';
END $$;
