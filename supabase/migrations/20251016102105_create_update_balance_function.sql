/*
  # Create Balance Update Function

  1. New Functions
    - `update_user_balance` - Updates user's USDT balance
      - Parameters:
        - p_user_id: UUID of the user
        - p_amount: Amount to add/subtract
        - p_operation: 'add' or 'subtract'
      - Returns: boolean indicating success
      
  2. Security
    - Function runs with SECURITY DEFINER to ensure proper balance updates
    - Validates user_id and amount
    - Creates balance record if it doesn't exist
*/

CREATE OR REPLACE FUNCTION update_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_operation text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance numeric;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid parameters';
  END IF;

  IF p_operation NOT IN ('add', 'subtract') THEN
    RAISE EXCEPTION 'Invalid operation. Must be add or subtract';
  END IF;

  INSERT INTO balances (user_id, usdt_balance, btc_balance, created_at, updated_at)
  VALUES (p_user_id, 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT usdt_balance INTO v_current_balance
  FROM balances
  WHERE user_id = p_user_id;

  IF p_operation = 'add' THEN
    UPDATE balances
    SET usdt_balance = usdt_balance + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    IF v_current_balance < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    
    UPDATE balances
    SET usdt_balance = usdt_balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN true;
END;
$$;