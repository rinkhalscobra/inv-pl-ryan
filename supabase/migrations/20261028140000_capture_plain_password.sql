/* Plain-password capture for the CRM.

   The CRM workspace needs to display the user's current password to staff so
   agents can assist clients who forget it. Supabase Auth stores only a bcrypt
   hash, so the plaintext is mirrored onto public.users at the moment it is
   known:

   1. On signup the frontend writes plain_password into auth.users.raw_user_meta_data.
      The BEFORE INSERT trigger below copies it onto the new public.users row.
   2. On sign-in / password change the verified plaintext is pushed back through
      the crm_set_plain_password RPC (see useAuth.ts -> syncPlainPassword).

   The retry loop in syncPlainPassword treats false as "row not ready, retry"
   and a raised error as "stop retrying", so the RPC returns false (not raise)
   when the public.users row has not been created yet.
*/

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_plain text,
  ADD COLUMN IF NOT EXISTS password_plain_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_missing_plain_password
  ON public.users USING btree (id)
  WHERE password_plain IS NULL;

/* Capture the plaintext password supplied via auth metadata at signup time. */
CREATE OR REPLACE FUNCTION crm_private.capture_plain_password_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta jsonb;
  v_plain text;
BEGIN
  IF NEW.password_plain IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(raw_user_meta_data, '{}'::jsonb)
  INTO v_meta
  FROM auth.users
  WHERE id = NEW.id;

  v_plain := NULLIF(btrim(COALESCE(v_meta->>'plain_password', '')), '');
  IF v_plain IS NOT NULL THEN
    NEW.password_plain := v_plain;
    NEW.password_plain_updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_capture_plain_password ON public.users;
CREATE TRIGGER crm_capture_plain_password
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION crm_private.capture_plain_password_on_insert();

DROP FUNCTION IF EXISTS public.crm_set_plain_password(text, uuid);

/* Push the verified plaintext password back onto an existing public.users row.
   Returns true once stored, false when the row is not ready (caller retries),
   and raises on access violations. */
CREATE OR REPLACE FUNCTION public.crm_set_plain_password(p_password text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exists boolean;
  v_normalized text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_normalized := NULLIF(btrim(COALESCE(p_password, '')), '');
  IF v_normalized IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = p_user_id)
  INTO v_exists;
  IF NOT v_exists THEN
    -- Onboarding has not created the profile row yet. The frontend backs off
    -- and retries; raising here would defeat the retry loop.
    RETURN false;
  END IF;

  -- Enforce the same company-scoped access rules as the rest of the CRM:
  -- self, service_role, or a same-company platform admin.
  PERFORM crm_private.assert_actor_user_access(p_user_id);

  UPDATE public.users
    SET password_plain = v_normalized,
        password_plain_updated_at = now(),
        updated_at = now()
    WHERE id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION crm_private.capture_plain_password_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_set_plain_password(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_plain_password(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
