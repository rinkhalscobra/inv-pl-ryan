-- Generate new short referral codes for all users

-- Ensure the function exists
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
  code_exists boolean;
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

    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM users WHERE referral_code = result) INTO code_exists;

    -- If code doesn't exist, we're done
    IF NOT code_exists THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

-- Generate new short codes for ALL users (including those with NULL codes)
DO $$
DECLARE
  user_record record;
  new_code text;
  updated_count integer := 0;
BEGIN
  FOR user_record IN SELECT id FROM users
  LOOP
    new_code := generate_referral_code();

    UPDATE users
    SET referral_code = new_code
    WHERE id = user_record.id;

    updated_count := updated_count + 1;
  END LOOP;

  RAISE NOTICE 'Generated % referral codes', updated_count;
END $$;
