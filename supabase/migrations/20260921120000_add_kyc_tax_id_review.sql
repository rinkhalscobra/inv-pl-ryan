-- Keep tax identifiers outside the broadly readable user profile. Only the
-- submission and administrator review functions below may access this table.
CREATE TABLE IF NOT EXISTS public.kyc_tax_id_submissions (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  tax_id text NOT NULL CHECK (length(btrim(tax_id)) BETWEEN 4 AND 64),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_reason text
);

ALTER TABLE public.kyc_tax_id_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kyc_tax_id_submissions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_kyc_application(
  p_tax_id text,
  p_id_path text,
  p_selfie_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tax_id text := btrim(COALESCE(p_tax_id, ''));
  v_user_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(v_tax_id) NOT BETWEEN 4 AND 64 OR v_tax_id ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Enter a valid Tax ID (4 to 64 characters)';
  END IF;
  IF p_id_path IS NULL OR p_selfie_path IS NULL
     OR left(p_id_path, length(v_user_id::text) + 1) <> v_user_id::text || '/'
     OR left(p_selfie_path, length(v_user_id::text) + 1) <> v_user_id::text || '/'
     OR p_id_path = p_selfie_path THEN
    RAISE EXCEPTION 'Invalid identity document paths';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_id_path)
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_selfie_path) THEN
    RAISE EXCEPTION 'Upload both identity documents before submitting';
  END IF;

  SELECT kyc_status INTO v_user_status
  FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF v_user_status IS NULL THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF v_user_status = 'verified' THEN RAISE EXCEPTION 'Verified accounts cannot resubmit KYC'; END IF;
  IF v_user_status = 'pending'
     AND EXISTS (SELECT 1 FROM public.kyc_tax_id_submissions WHERE user_id = v_user_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Your KYC application is already pending review';
  END IF;

  INSERT INTO public.kyc_tax_id_submissions (user_id, tax_id, status, submitted_at)
  VALUES (v_user_id, v_tax_id, 'pending', now())
  ON CONFLICT (user_id) DO UPDATE
  SET tax_id = EXCLUDED.tax_id,
      status = 'pending',
      submitted_at = now(),
      reviewed_at = NULL,
      reviewed_by = NULL,
      review_reason = NULL;

  UPDATE public.users
  SET document_id_path = p_id_path,
      document_selfie_path = p_selfie_path,
      document_id_url = NULL,
      document_selfie_url = NULL,
      kyc_status = 'pending',
      updated_at = now()
  WHERE id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_kyc_tax_id_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT jsonb_build_object(
    'status', t.status,
    'last_four', right(t.tax_id, 4),
    'submitted_at', t.submitted_at,
    'reviewed_at', t.reviewed_at,
    'review_reason', CASE WHEN t.status = 'rejected' THEN t.review_reason ELSE NULL END
  ) INTO v_result
  FROM public.kyc_tax_id_submissions t
  WHERE t.user_id = auth.uid();
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_kyc_tax_id(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.require_admin();
  SELECT jsonb_build_object(
    'tax_id', t.tax_id,
    'status', t.status,
    'submitted_at', t.submitted_at,
    'reviewed_at', t.reviewed_at,
    'reviewed_by', t.reviewed_by
  ) INTO v_result
  FROM public.kyc_tax_id_submissions t
  WHERE t.user_id = p_target_user_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_kyc_application(
  p_target_user_id uuid,
  p_decision text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_tax_status text;
BEGIN
  PERFORM public.require_admin();
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A review reason is required'; END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  SELECT status INTO v_tax_status
  FROM public.kyc_tax_id_submissions
  WHERE user_id = p_target_user_id FOR UPDATE;
  IF v_tax_status IS NULL OR v_tax_status <> 'pending' OR v_user.kyc_status <> 'pending' THEN
    RAISE EXCEPTION 'No pending KYC application is available for review';
  END IF;
  IF p_decision = 'approve'
     AND (v_user.document_id_path IS NULL OR v_user.document_selfie_path IS NULL
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = v_user.document_id_path)
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = v_user.document_selfie_path)) THEN
    RAISE EXCEPTION 'Identity documents are required before approval';
  END IF;

  UPDATE public.kyc_tax_id_submissions
  SET status = CASE WHEN p_decision = 'approve' THEN 'verified' ELSE 'rejected' END,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_reason = btrim(p_reason)
  WHERE user_id = p_target_user_id;

  UPDATE public.users
  SET kyc_status = CASE WHEN p_decision = 'approve' THEN 'verified' ELSE 'not_verified' END,
      updated_at = now()
  WHERE id = p_target_user_id;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (
    auth.uid(), p_target_user_id, 'review_kyc_application',
    jsonb_build_object('kyc_status', v_user.kyc_status, 'tax_id_status', v_tax_status),
    jsonb_build_object('kyc_status', CASE WHEN p_decision = 'approve' THEN 'verified' ELSE 'not_verified' END,
                       'tax_id_status', CASE WHEN p_decision = 'approve' THEN 'verified' ELSE 'rejected' END),
    btrim(p_reason)
  );
END;
$$;

-- RLS protects rows; this trigger also protects the KYC status column on the
-- existing users table, where customers can update their own profile fields.
CREATE OR REPLACE FUNCTION public.protect_user_kyc_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_tax_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND COALESCE(NEW.kyc_status, 'not_verified') <> 'not_verified' THEN
      RAISE EXCEPTION 'KYC verification requires an administrator review';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.kyc_status IS NOT DISTINCT FROM NEW.kyc_status THEN RETURN NEW; END IF;
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;

  SELECT status INTO v_tax_status
  FROM public.kyc_tax_id_submissions WHERE user_id = NEW.id;

  IF NEW.kyc_status = 'verified' THEN
    IF NOT public.check_admin_role(auth.uid())
       OR v_tax_status IS DISTINCT FROM 'verified'
       OR NEW.document_id_path IS NULL
       OR NEW.document_selfie_path IS NULL THEN
      RAISE EXCEPTION 'Administrator approval of identity documents and Tax ID is required';
    END IF;
  ELSIF NOT public.check_admin_role(auth.uid()) THEN
    IF OLD.kyc_status = 'verified'
       OR NEW.kyc_status <> 'pending'
       OR v_tax_status IS DISTINCT FROM 'pending'
       OR NEW.document_id_path IS NULL
       OR NEW.document_selfie_path IS NULL THEN
      RAISE EXCEPTION 'Submit a complete KYC application before changing status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_kyc_status ON public.users;
CREATE TRIGGER protect_user_kyc_status
BEFORE UPDATE OF kyc_status ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_user_kyc_status();

DROP TRIGGER IF EXISTS protect_user_kyc_insert ON public.users;
CREATE TRIGGER protect_user_kyc_insert
BEFORE INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_user_kyc_status();

-- Customers submit document paths through submit_kyc_application, where both
-- objects and path ownership are checked. Direct profile updates cannot alter them.
CREATE OR REPLACE FUNCTION public.protect_user_kyc_documents()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' OR current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF OLD.document_id_path IS DISTINCT FROM NEW.document_id_path
     OR OLD.document_selfie_path IS DISTINCT FROM NEW.document_selfie_path
     OR OLD.document_id_url IS DISTINCT FROM NEW.document_id_url
     OR OLD.document_selfie_url IS DISTINCT FROM NEW.document_selfie_url THEN
    RAISE EXCEPTION 'Submit identity documents through the KYC application';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_kyc_documents ON public.users;
CREATE TRIGGER protect_user_kyc_documents
BEFORE UPDATE OF document_id_path, document_selfie_path, document_id_url, document_selfie_url ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_user_kyc_documents();

DROP POLICY IF EXISTS "Admins can review KYC documents" ON storage.objects;
CREATE POLICY "Admins can review KYC documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'kyc-documents' AND public.check_admin_role(auth.uid()));

REVOKE ALL ON FUNCTION public.submit_kyc_application(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_kyc_tax_id_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_kyc_tax_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_kyc_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_kyc_application(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_tax_id_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kyc_tax_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_kyc_application(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
