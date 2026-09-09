/*
  # Add custom daily profit percentage field to robot_states

  1. New Columns
    - `custom_daily_profit_percentage` (numeric, nullable)
      - Allows admin to override the default tier-based profit percentage
      - When set, this value will be used instead of the calculated tier percentage
      - When null, falls back to the standard tier-based calculation

  2. Changes
    - Added nullable column to robot_states table
    - No impact on existing data (all values will be null initially)
    - Backend will check this field first before using tier-based calculation

  3. Security
    - Only service role can modify this field
    - Users cannot see or modify this value from frontend
*/

-- Add custom daily profit percentage column to robot_states table
ALTER TABLE public.robot_states
ADD COLUMN IF NOT EXISTS custom_daily_profit_percentage numeric(20,8) DEFAULT NULL;

-- Add comment to document the purpose
COMMENT ON COLUMN public.robot_states.custom_daily_profit_percentage IS 'Admin-only field to override default tier-based profit percentage. When set, this value is used instead of calculated tier percentage.';

-- Add index for performance (optional, since this will be used infrequently)
CREATE INDEX IF NOT EXISTS idx_robot_states_custom_profit 
ON public.robot_states (custom_daily_profit_percentage) 
WHERE custom_daily_profit_percentage IS NOT NULL;