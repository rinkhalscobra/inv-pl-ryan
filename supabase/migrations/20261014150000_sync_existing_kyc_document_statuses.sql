/* Align document metadata created before scoped KYC review started updating it. */
UPDATE public.client_documents AS document
SET status = submission.status
FROM public.kyc_tax_id_submissions AS submission
JOIN public.users AS client ON client.id = submission.user_id
WHERE document.user_id = submission.user_id
  AND document.object_path IN (client.document_id_path, client.document_selfie_path)
  AND submission.status IN ('verified', 'rejected')
  AND document.status IS DISTINCT FROM submission.status;

NOTIFY pgrst, 'reload schema';
