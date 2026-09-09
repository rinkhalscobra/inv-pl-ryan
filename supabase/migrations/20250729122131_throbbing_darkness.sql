/*
  # Create update_position_current_price RPC function

  1. New Functions
    - `update_position_current_price(p_symbol, p_current_price)`
      - Updates current_price for all open positions with the given symbol
      - Recalculates unrealized_pnl based on position side and leverage
      - Recalculates roi as percentage of margin
      - Updates both futures_positions and prop_positions tables

  2. Security
    - Grant execute permissions to authenticated and service_role
    - Function is safe for concurrent execution
*/

CREATE OR REPLACE FUNCTION public.update_position_current_price(
    p_symbol text,
    p_current_price numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update futures_positions
    UPDATE public.futures_positions
    SET
        current_price = p_current_price,
        unrealized_pnl = CASE
            WHEN side = 'long' THEN (p_current_price - entry_price) * amount * leverage
            WHEN side = 'short' THEN (entry_price - p_current_price) * amount * leverage
            ELSE 0
        END,
        roi = CASE
            WHEN margin > 0 THEN (
                CASE
                    WHEN side = 'long' THEN (p_current_price - entry_price) * amount * leverage
                    WHEN side = 'short' THEN (entry_price - p_current_price) * amount * leverage
                    ELSE 0
                END
            ) / margin * 100
            ELSE 0
        END,
        updated_at = now()
    WHERE
        symbol = p_symbol AND is_open = TRUE;

    -- Update prop_positions
    UPDATE public.prop_positions
    SET
        current_price = p_current_price,
        unrealized_pnl = CASE
            WHEN side = 'long' THEN (p_current_price - entry_price) * amount * leverage
            WHEN side = 'short' THEN (entry_price - p_current_price) * amount * leverage
            ELSE 0
        END,
        roi = CASE
            WHEN margin > 0 THEN (
                CASE
                    WHEN side = 'long' THEN (p_current_price - entry_price) * amount * leverage
                    WHEN side = 'short' THEN (entry_price - p_current_price) * amount * leverage
                    ELSE 0
                END
            ) / margin * 100
            ELSE 0
        END,
        updated_at = now()
    WHERE
        symbol = p_symbol AND is_open = TRUE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_position_current_price(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_position_current_price(text, numeric) TO service_role;