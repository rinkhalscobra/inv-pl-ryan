/*
  # Fix update_position_current_price - Remove Leverage Multiplication

  1. Changes
    - Remove leverage multiplication from unrealized PnL calculation
    - PnL should be: (price_difference) * amount
    - NOT: (price_difference) * amount * leverage
    - Applies to both futures_positions and prop_positions

  2. Description
    - When updating current prices for open positions, PnL was being inflated by leverage
    - The amount already represents the leveraged position size
    - This function is used to show real-time unrealized PnL on open positions
*/

CREATE OR REPLACE FUNCTION public.update_position_current_price(
    p_symbol text,
    p_current_price numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update futures_positions WITHOUT leverage multiplication
    UPDATE public.futures_positions
    SET
        current_price = p_current_price,
        unrealized_pnl = CASE
            WHEN side = 'long' THEN (p_current_price - entry_price) * amount
            WHEN side = 'short' THEN (entry_price - p_current_price) * amount
            ELSE 0
        END,
        roi = CASE
            WHEN margin > 0 THEN (
                CASE
                    WHEN side = 'long' THEN (p_current_price - entry_price) * amount
                    WHEN side = 'short' THEN (entry_price - p_current_price) * amount
                    ELSE 0
                END
            ) / margin * 100
            ELSE 0
        END,
        updated_at = now()
    WHERE
        symbol = p_symbol AND is_open = TRUE;

    -- Update prop_positions WITHOUT leverage multiplication
    UPDATE public.prop_positions
    SET
        current_price = p_current_price,
        unrealized_pnl = CASE
            WHEN side = 'long' THEN (p_current_price - entry_price) * amount
            WHEN side = 'short' THEN (entry_price - p_current_price) * amount
            ELSE 0
        END,
        roi = CASE
            WHEN margin > 0 THEN (
                CASE
                    WHEN side = 'long' THEN (p_current_price - entry_price) * amount
                    WHEN side = 'short' THEN (entry_price - p_current_price) * amount
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
