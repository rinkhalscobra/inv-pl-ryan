/*
  # Fix robot allocation balance inflation

  1. Problem
    - Due to a bug, allocating funds to the robot never deducted from usdt_balance
    - Additionally, robot profits were added to BOTH allocated_balance AND usdt_balance
    - This caused every user with an active robot to have inflated usdt_balance

  2. Fix
    - Deduct the robot allocated_balance from usdt_balance for all affected users
    - Cap at 0 to prevent negative balances
    - This brings existing data in line with the corrected application logic where:
      - Allocation deducts from usdt_balance
      - Robot profits only compound inside allocated_balance
      - Funds return to usdt_balance only when the user withdraws from the robot

  3. Affected tables
    - `balances`: usdt_balance reduced by the robot's allocated_balance amount
*/

UPDATE balances b
SET usdt_balance = GREATEST(0, b.usdt_balance - r.allocated_balance)
FROM robot_states r
WHERE r.user_id = b.user_id
  AND r.allocated_balance > 0;
