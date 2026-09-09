/*
  # Add robot allocation transaction types

  1. Changes
    - Updates `transactions_type_check` constraint to include `robot_allocation` and `robot_withdrawal`
    - These types track when users allocate funds to or remove funds from the arbitrage robot

  2. New transaction types
    - `robot_allocation`: Records when a user moves funds from their available balance into the robot
    - `robot_withdrawal`: Records when a user withdraws accumulated funds (including profits) from the robot
*/

DO $$
BEGIN
  ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
  ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
    CHECK (type IN (
      'deposit', 'withdrawal', 'trade', 'robot_profit', 'binary_trade',
      'stake', 'staking_profit', 'staking_return', 'challenge_fee', 'challenge_reward',
      'referral_earning', 'swap_fee', 'swap_refund', 'wheel_bonus', 'giveaway_prize',
      'robot_allocation', 'robot_withdrawal', 'bonus', 'bonus_removal'
    ));
END $$;
