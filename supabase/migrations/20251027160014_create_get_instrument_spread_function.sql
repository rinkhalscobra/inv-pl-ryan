/*
  # Create Get Instrument Spread Function

  1. New Functions
    - `get_instrument_spread(p_symbol text)` - Returns spread configuration for a symbol
    - `calculate_spread_cost(p_symbol text, p_entry_price numeric, p_amount numeric)` - Calculates actual spread cost

  2. Description
    - Retrieves spread percentage and limits for a given trading instrument
    - Calculates the actual spread cost based on position size and entry price
    - Ensures spread stays within configured min/max bounds
    - Returns default spread if symbol not found in configuration
*/

-- Function to get instrument spread configuration
CREATE OR REPLACE FUNCTION get_instrument_spread(p_symbol text)
RETURNS TABLE (
  symbol text,
  instrument_type text,
  spread_percentage numeric,
  min_spread_value numeric,
  max_spread_value numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.symbol,
    s.instrument_type,
    s.spread_percentage,
    s.min_spread_value,
    s.max_spread_value
  FROM instrument_spreads s
  WHERE s.symbol = p_symbol
    AND s.is_active = true
  LIMIT 1;
  
  -- If no spread found, return default values
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      p_symbol::text,
      'unknown'::text,
      0.0001::numeric,
      0.00000001::numeric,
      999999.99999999::numeric;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate spread cost for a position
CREATE OR REPLACE FUNCTION calculate_spread_cost(
  p_symbol text,
  p_entry_price numeric,
  p_amount numeric
)
RETURNS numeric AS $$
DECLARE
  v_spread_percentage numeric;
  v_min_spread numeric;
  v_max_spread numeric;
  v_calculated_spread numeric;
  v_position_value numeric;
BEGIN
  -- Get spread configuration
  SELECT 
    spread_percentage,
    min_spread_value,
    max_spread_value
  INTO 
    v_spread_percentage,
    v_min_spread,
    v_max_spread
  FROM instrument_spreads
  WHERE symbol = p_symbol
    AND is_active = true
  LIMIT 1;
  
  -- Use default if not found
  IF v_spread_percentage IS NULL THEN
    v_spread_percentage := 0.0001;
    v_min_spread := 0.00000001;
    v_max_spread := 999999.99999999;
  END IF;
  
  -- Calculate position value
  v_position_value := p_entry_price * p_amount;
  
  -- Calculate spread cost as percentage of position value
  v_calculated_spread := v_position_value * v_spread_percentage;
  
  -- Ensure spread is within bounds
  v_calculated_spread := GREATEST(v_calculated_spread, v_min_spread);
  v_calculated_spread := LEAST(v_calculated_spread, v_max_spread);
  
  RETURN v_calculated_spread;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_instrument_spread(text) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_spread_cost(text, numeric, numeric) TO authenticated;
