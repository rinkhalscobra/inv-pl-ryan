/* Legacy transaction triggers require public to be explicit in the caller path. */

ALTER FUNCTION public.allocate_robot_funds(numeric)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.deallocate_robot_funds()
  SET search_path = pg_catalog, public;
