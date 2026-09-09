ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS document_id_path text,
  ADD COLUMN IF NOT EXISTS document_selfie_path text;

COMMENT ON COLUMN public.users.document_id_path IS
  'Private kyc-documents bucket path for the submitted identity document.';

COMMENT ON COLUMN public.users.document_selfie_path IS
  'Private kyc-documents bucket path for the submitted selfie document.';

NOTIFY pgrst, 'reload schema';
