/*
  Registration now uses Supabase Auth directly with email auto-confirm enabled.
  Remove the obsolete custom email-code workflow and its plaintext pending data.
*/

DROP TABLE IF EXISTS public.email_verifications;
DROP TABLE IF EXISTS public.pending_signups;
