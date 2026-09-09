/*
  # Add margin_type column to futures_orders table

  1. Changes
    - Add `margin_type` column to `futures_orders` table with default value 'isolated'
    - Add check constraint to ensure only valid values ('isolated', 'cross') are allowed

  2. Security
    - No changes to RLS policies needed as this is just adding a column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'futures_orders' AND column_name = 'margin_type'
  ) THEN
    ALTER TABLE futures_orders ADD COLUMN margin_type text NOT NULL DEFAULT 'isolated';
    
    ALTER TABLE futures_orders ADD CONSTRAINT futures_orders_margin_type_check 
    CHECK (margin_type = ANY (ARRAY['isolated'::text, 'cross'::text]));
  END IF;
END $$;