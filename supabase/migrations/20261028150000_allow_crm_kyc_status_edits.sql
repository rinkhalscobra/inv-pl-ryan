/* Manual CRM status changes are separate from the document-review workflow.
   Only the scoped administrator RPC can authorize an edit without documents. */
CREATE OR REPLACE FUNCTION public.protect_user_kyc_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_tax_status text;
  v_scoped_review boolean := COALESCE(
    current_setting('crm.kyc_review_authorized', true), ''
  ) = 'yes';
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

  IF COALESCE(current_setting('crm.kyc_status_edit_target', true), '') = NEW.id::text THEN
    PERFORM public.require_admin();
    PERFORM crm_private.assert_actor_user_access(NEW.id);
    RETURN NEW;
  END IF;

  SELECT status INTO v_tax_status
  FROM public.kyc_tax_id_submissions
  WHERE user_id = NEW.id;

  IF NEW.kyc_status = 'verified' THEN
    IF (NOT public.check_admin_role(auth.uid()) AND NOT v_scoped_review)
       OR v_tax_status IS DISTINCT FROM 'verified'
       OR NEW.document_id_path IS NULL
       OR NEW.document_selfie_path IS NULL THEN
      RAISE EXCEPTION 'Administrator approval of identity documents and Tax ID is required';
    END IF;
  ELSIF v_scoped_review THEN
    IF OLD.kyc_status IS DISTINCT FROM 'pending'
       OR NEW.kyc_status IS DISTINCT FROM 'not_verified'
       OR v_tax_status IS DISTINCT FROM 'rejected' THEN
      RAISE EXCEPTION 'Invalid KYC review transition';
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

CREATE OR REPLACE FUNCTION public.admin_set_user_kyc_status(
  p_target_user_id uuid,
  p_status text,
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
  v_next_tax_status text;
  v_previous_target text := COALESCE(current_setting('crm.kyc_status_edit_target', true), '');
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);

  IF p_status IS NULL OR p_status NOT IN ('not_verified', 'pending', 'verified') THEN
    RAISE EXCEPTION 'Invalid KYC status';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  -- Recheck after locking in case the account moved to another company.
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);
  IF v_user.kyc_status IS NOT DISTINCT FROM p_status THEN RETURN; END IF;

  SELECT status INTO v_tax_status
  FROM public.kyc_tax_id_submissions
  WHERE user_id = p_target_user_id
  FOR UPDATE;

  v_next_tax_status := CASE p_status
    WHEN 'verified' THEN 'verified'
    WHEN 'pending' THEN 'pending'
    ELSE 'rejected'
  END;

  -- Keep existing submissions consistent without inventing a Tax ID or files.
  UPDATE public.kyc_tax_id_submissions
  SET status = v_next_tax_status,
      reviewed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
      reviewed_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
      review_reason = CASE WHEN p_status = 'pending' THEN NULL ELSE btrim(p_reason) END
  WHERE user_id = p_target_user_id;

  UPDATE public.client_documents
  SET status = CASE WHEN p_status = 'pending' THEN 'pending_review' ELSE v_next_tax_status END
  WHERE user_id = p_target_user_id
    AND object_path IN (v_user.document_id_path, v_user.document_selfie_path);

  PERFORM set_config('crm.kyc_status_edit_target', p_target_user_id::text, true);
  UPDATE public.users
  SET kyc_status = p_status, updated_at = now()
  WHERE id = p_target_user_id;
  PERFORM set_config('crm.kyc_status_edit_target', v_previous_target, true);

  INSERT INTO public.admin_action_logs(
    admin_user_id, target_user_id, company_id, action, before_data, after_data, reason
  ) VALUES (
    auth.uid(), p_target_user_id, v_user.company_id, 'set_kyc_status',
    jsonb_build_object('kyc_status', v_user.kyc_status, 'tax_id_status', v_tax_status),
    jsonb_build_object(
      'kyc_status', p_status,
      'tax_id_status', CASE WHEN v_tax_status IS NULL THEN NULL ELSE v_next_tax_status END
    ),
    btrim(p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_kyc_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_kyc_status(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
