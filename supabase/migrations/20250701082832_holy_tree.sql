/*
  # Add Admin RLS Policies

  1. Security Updates
    - Add RLS policies for admin users to access all data
    - Maintain existing RLS policies for regular users
    - Ensure admins can manage all user data
    
  2. Tables Updated
    - Add admin policies to all relevant tables
*/

-- Add admin policies to balances table
CREATE POLICY "Admins can manage all balances"
  ON balances
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to futures_positions table
CREATE POLICY "Admins can manage all futures positions"
  ON futures_positions
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to futures_orders table
CREATE POLICY "Admins can manage all futures orders"
  ON futures_orders
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to futures_position_history table
CREATE POLICY "Admins can view all position history"
  ON futures_position_history
  FOR SELECT
  TO authenticated
  USING (check_admin_role(auth.uid()));

-- Add admin policies to transactions table
CREATE POLICY "Admins can manage all transactions"
  ON transactions
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to binary_trades table
CREATE POLICY "Admins can manage all binary trades"
  ON binary_trades
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to user_stakes table
CREATE POLICY "Admins can manage all stakes"
  ON user_stakes
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to user_assets table
CREATE POLICY "Admins can manage all user assets"
  ON user_assets
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to prop_positions table
CREATE POLICY "Admins can manage all prop positions"
  ON prop_positions
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to prop_orders table
CREATE POLICY "Admins can manage all prop orders"
  ON prop_orders
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to prop_position_history table
CREATE POLICY "Admins can view all prop position history"
  ON prop_position_history
  FOR SELECT
  TO authenticated
  USING (check_admin_role(auth.uid()));

-- Add admin policies to prop_account_balances table
CREATE POLICY "Admins can manage all prop account balances"
  ON prop_account_balances
  FOR ALL
  TO authenticated
  USING (check_admin_role(auth.uid()))
  WITH CHECK (check_admin_role(auth.uid()));

-- Add admin policies to prop_logs table
CREATE POLICY "Admins can view all prop logs"
  ON prop_logs
  FOR SELECT
  TO authenticated
  USING (check_admin_role(auth.uid()));

-- Add admin policies to trading_logs table
CREATE POLICY "Admins can view all trading logs"
  ON trading_logs
  FOR SELECT
  TO authenticated
  USING (check_admin_role(auth.uid()));

-- Add admin policies to portfolio_snapshots table
CREATE POLICY "Admins can view all portfolio snapshots"
  ON portfolio_snapshots
  FOR SELECT
  TO authenticated
  USING (check_admin_role(auth.uid()));

-- Add admin policies to users table
CREATE POLICY "Admins can view all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (check_admin_role(auth.uid()));

-- Add admin policies to user_2fa table
CREATE POLICY "Admins can view all 2FA settings"
  ON user_2fa
  FOR SELECT
  TO authenticated
  USING (check_admin_role(auth.uid()));