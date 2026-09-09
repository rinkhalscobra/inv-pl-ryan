/*
  # Create update_position_current_price RPC function

  1. New Functions
    - `update_position_current_price(p_symbol, p_current_price)`
      - Updates current_price, unrealized_pnl, and roi for all open futures positions of a given symbol
      - Calculates PnL based on position side (long/short)
      - Updates ROI as percentage of margin

  2. Security
    - Grant execute permissions to authenticated users
    - Function is safe for concurrent execution
*/

CREATE OR REPLACE FUNCTION public.update_position_current_price(
    p_symbol text,
    p_current_price numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    position_record record;
    new_unrealized_pnl numeric;
    new_roi numeric;
BEGIN
    FOR position_record IN
        SELECT *
        FROM public.futures_positions
        WHERE symbol = p_symbol AND is_open = TRUE
    LOOP
        -- Calculate unrealized PnL based on position side
        IF position_record.side = 'long' THEN
            new_unrealized_pnl := (p_current_price - position_record.entry_price) * position_record.amount * position_record.leverage;
        ELSE -- short
            new_unrealized_pnl := (position_record.entry_price - p_current_price) * position_record.amount * position_record.leverage;
        END IF;

        -- Calculate ROI as percentage of margin
        IF position_record.margin > 0 THEN
            new_roi := (new_unrealized_pnl / position_record.margin) * 100;
        ELSE
            new_roi := 0;
        END IF;

        -- Update the position with new values
        UPDATE public.futures_positions
        SET
            current_price = p_current_price,
            unrealized_pnl = new_unrealized_pnl,
            roi = new_roi,
            updated_at = now()
        WHERE id = position_record.id;
    END LOOP;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.update_position_current_price(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_position_current_price(text, numeric) TO service_role;