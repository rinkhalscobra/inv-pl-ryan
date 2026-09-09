/*
  Legacy transaction triggers resolve public tables through the caller's search
  path. Keep pg_catalog first and public explicit while those triggers run.
*/

ALTER FUNCTION public.start_prop_challenge(text)
  SET search_path = pg_catalog, public;
