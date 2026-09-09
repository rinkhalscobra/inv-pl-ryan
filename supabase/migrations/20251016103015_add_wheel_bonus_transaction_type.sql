/*
  # Add Wheel Bonus Transaction Type

  1. Changes
    - Add 'wheel_bonus' to the allowed transaction types in the check constraint
    
  2. Notes
    - This allows the system to create transaction records for wheel spin bonuses
*/

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions ADD CONSTRAINT transactions_type_check 
CHECK (type = ANY (ARRAY[
  'deposit'::text, 
  'withdrawal'::text, 
  'trade'::text, 
  'robot_profit'::text, 
  'binary_trade'::text, 
  'stake'::text, 
  'staking_profit'::text, 
  'staking_return'::text, 
  'challenge_fee'::text, 
  'challenge_reward'::text, 
  'nowpayments_deposit'::text,
  'wheel_bonus'::text
]));