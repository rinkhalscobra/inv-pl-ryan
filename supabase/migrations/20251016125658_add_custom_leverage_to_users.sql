/*
  # Add Custom Leverage Settings to Users

  1. New Columns
    - `max_leverage_forex` (integer, nullable) - Custom max leverage for forex trading
    - `max_leverage_commodities` (integer, nullable) - Custom max leverage for commodities trading
    - `max_leverage_stocks` (integer, nullable) - Custom max leverage for stocks trading

  2. Notes
    - If these fields are NULL, the system will use default leverage based on account tier
    - If these fields have values, they override the default tier-based leverage
    - This allows admins to customize leverage limits per user from the backend
*/

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS max_leverage_forex integer,
ADD COLUMN IF NOT EXISTS max_leverage_commodities integer,
ADD COLUMN IF NOT EXISTS max_leverage_stocks integer;