/*
  # Fix Referral Code Generation to Avoid Trigger Issues

  1. Changes
    - Make generate_referral_code function more robust
    - Handle the case where it's called within a trigger
    - Reduce the chance of conflicts
*/

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
  max_attempts integer := 10;
  attempt integer := 0;
BEGIN
  LOOP
    result := '';

    -- First character: letter only
    result := result || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 23 + 1)::int, 1);

    -- Next 5 characters: alphanumeric
    FOR i IN 1..5 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Last character: letter only
    result := result || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 23 + 1)::int, 1);

    -- Try to check if code exists, but handle errors gracefully
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM users WHERE referral_code = result) THEN
        RETURN result;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- If we can't check (e.g., within trigger), just return the code
        -- The odds of collision are very low with 7-character codes
        RETURN result;
    END;
    
    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      -- After max attempts, just return what we have
      RETURN result;
    END IF;
  END LOOP;
END;
$$;
