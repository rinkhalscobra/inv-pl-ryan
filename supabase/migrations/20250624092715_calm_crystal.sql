-- Function to add a column to a table if it doesn't exist
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
  table_name text,
  column_name text,
  column_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = add_column_if_not_exists.table_name
      AND column_name = add_column_if_not_exists.column_name
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', 
                  add_column_if_not_exists.table_name, 
                  add_column_if_not_exists.column_name, 
                  add_column_if_not_exists.column_type);
  END IF;
END;
$$;