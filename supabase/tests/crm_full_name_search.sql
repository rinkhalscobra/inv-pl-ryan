/* Isolated regression: all fixture accounts and companies are rolled back. */
BEGIN;
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE crm_name_search_result(search_variants integer,scope_checks integer) ON COMMIT DROP;
DO $$
DECLARE
  v_owner uuid; v_company uuid:=gen_random_uuid(); v_other_company uuid:=gen_random_uuid();
  v_office uuid:=gen_random_uuid(); v_admin uuid:=gen_random_uuid();
  v_workflow uuid:=gen_random_uuid(); v_agent uuid:=gen_random_uuid(); v_staff uuid:=gen_random_uuid();
  v_client uuid:=gen_random_uuid(); v_unassigned uuid:=gen_random_uuid(); v_foreign uuid:=gen_random_uuid();
  v_suffix text:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_first text; v_search text; v_result jsonb; v_count integer; v_variants integer:=0;
BEGIN
  SELECT id INTO v_owner FROM public.users WHERE is_admin AND company_id IS NULL ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Platform fixture owner is required'; END IF;
  v_first:='Mattia'||v_suffix;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.crm_companies(id,name,code,created_by) VALUES
    (v_company,'Full name regression '||v_suffix,'NAME_A_'||v_suffix,v_owner),
    (v_other_company,'Other name regression '||v_suffix,'NAME_B_'||v_suffix,v_owner);
  INSERT INTO public.crm_offices(id,name,code,company_id,created_by)
    VALUES(v_office,'Name test office','NAME_'||v_suffix,v_company,v_owner);
  INSERT INTO public.users(id,email,first_name,last_name,company_id,office_id,is_admin) VALUES
    (v_admin,'name-admin-'||v_suffix||'@example.invalid','Test','Administrator',v_company,v_office,true),
    (v_workflow,'name-manager-'||v_suffix||'@example.invalid','Test','Manager',v_company,v_office,false),
    (v_agent,'name-agent-'||v_suffix||'@example.invalid','Test','Agent',v_company,v_office,false),
    (v_staff,'name-staff-'||v_suffix||'@example.invalid',v_first,'Gatto',v_company,v_office,false),
    (v_client,'name-client-'||v_suffix||'@example.invalid',v_first,'Gatto',v_company,v_office,false),
    (v_unassigned,'name-unassigned-'||v_suffix||'@example.invalid',v_first,'Gatto',v_company,v_office,false),
    (v_foreign,'name-foreign-'||v_suffix||'@example.invalid',v_first,'Gatto',v_other_company,NULL,false);
  INSERT INTO public.crm_staff_roles(user_id,role) VALUES(v_workflow,'workflow_manager'),(v_agent,'agent'),(v_staff,'retention');
  INSERT INTO public.crm_client_agent_assignments(client_id,agent_id) VALUES(v_client,v_agent);
  INSERT INTO crm_private.admin_ip_allowlist(address,label,access_scope,company_id,created_by)
    VALUES('192.0.2.238','Name search regression','company',v_company,v_owner);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.headers','{"cf-connecting-ip":"192.0.2.238"}',true);
  PERFORM public.admin_set_user_kyc_status(v_client,'pending','Name search KYC fixture');
  PERFORM public.admin_set_user_kyc_status(v_unassigned,'verified','Name search KYC fixture');

  FOREACH v_search IN ARRAY ARRAY[
    v_first||' Gatto',lower(v_first)||' gatto','Gatto '||v_first,
    '  '||v_first||E'\t   Gatto  ',v_first,'Gatto'
  ] LOOP
    v_result:=public.admin_get_users(v_search,100,0,NULL,v_company);
    IF jsonb_array_length(v_result->'users')<>2 THEN RAISE EXCEPTION 'Full-name variant failed: %',v_search; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'users') u WHERE (u->>'id')::uuid NOT IN(v_client,v_unassigned)) THEN
      RAISE EXCEPTION 'Staff or another company leaked into client results';
    END IF;
    IF (v_result->'stats'->>'total_users')::integer<>2 THEN RAISE EXCEPTION 'Search changed company totals'; END IF;
    v_variants:=v_variants+1;
  END LOOP;
  v_result:=public.admin_get_users(v_first||' Gatto',100,0,'pending',v_company);
  IF jsonb_array_length(v_result->'users')<>1 OR (v_result->'users'->0->>'id')::uuid<>v_client THEN
    RAISE EXCEPTION 'KYC filter was bypassed by full-name search';
  END IF;
  FOREACH v_search IN ARRAY ARRAY[v_client::text,'name-client-'||v_suffix||'@example.invalid'] LOOP
    v_result:=public.admin_get_users(v_search,100,0,NULL,v_company);
    IF jsonb_array_length(v_result->'users')<>1 OR (v_result->'users'->0->>'id')::uuid<>v_client THEN
      RAISE EXCEPTION 'Existing identifier search failed';
    END IF;
    v_variants:=v_variants+1;
  END LOOP;
  BEGIN
    PERFORM public.admin_get_users(v_first||' Gatto',100,0,NULL,v_other_company);
    RAISE EXCEPTION 'Test: cross-company search unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%company%' OR SQLERRM LIKE 'Test:%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub',v_workflow::text,true);
  v_result:=public.crm_staff_get_scope(v_first||' Gatto');
  IF jsonb_array_length(v_result->'clients')<>2 THEN RAISE EXCEPTION 'Manager full-name search failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_agent::text,true);
  FOREACH v_search IN ARRAY ARRAY[v_first||' Gatto','Gatto '||v_first] LOOP
    v_result:=public.crm_staff_get_scope(v_search);
    IF jsonb_array_length(v_result->'clients')<>1 OR (v_result->'clients'->0->>'id')::uuid<>v_client THEN
      RAISE EXCEPTION 'Agent search escaped assignment scope or failed to match';
    END IF;
    v_variants:=v_variants+1;
  END LOOP;
  IF has_function_privilege('anon','public.admin_get_users(text,integer,integer,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.crm_staff_get_scope_unscoped(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Search API permissions were widened';
  END IF;
  INSERT INTO crm_name_search_result VALUES(v_variants,6);
END;
$$;
SELECT *,true AS all_fixtures_rolled_back FROM crm_name_search_result;
ROLLBACK;
