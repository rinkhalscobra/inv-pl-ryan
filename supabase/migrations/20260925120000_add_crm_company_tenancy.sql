/*
  Database-enforced CRM multi-tenancy for a single domain / Supabase project.

  - 46.166.172.116 remains the platform network and may select any company.
  - 92.246.87.144 belongs to the initial company.
  - Additional IPs attached to a company share that company's CRM data.
  - New companies contain no users, leads, offices, or sources.
  - Client authentication is unchanged; registration_key routes signups in the
    background and the default company preserves existing registration links.
*/

CREATE TABLE public.crm_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  code text NOT NULL CHECK (code = upper(btrim(code)) AND code ~ '^[A-Z0-9_-]{2,24}$'),
  registration_key uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_default_registration boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code),
  UNIQUE (registration_key)
);
CREATE UNIQUE INDEX crm_companies_name_unique_idx ON public.crm_companies(lower(name));
CREATE UNIQUE INDEX crm_companies_one_default_idx ON public.crm_companies(is_default_registration) WHERE is_default_registration;
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_companies FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crm_companies TO service_role;

INSERT INTO public.crm_companies(name,code,is_default_registration)
VALUES ('Primary Company','PRIMARY',true);

ALTER TABLE public.users ADD COLUMN company_id uuid REFERENCES public.crm_companies(id) ON DELETE RESTRICT;
ALTER TABLE public.crm_offices ADD COLUMN company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE;
ALTER TABLE public.crm_lead_sources ADD COLUMN company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE;
ALTER TABLE public.crm_leads ADD COLUMN company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE;
ALTER TABLE public.admin_action_logs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL;

UPDATE public.users SET company_id=(SELECT id FROM public.crm_companies WHERE is_default_registration) WHERE NOT is_admin;
UPDATE public.crm_offices SET company_id=(SELECT id FROM public.crm_companies WHERE is_default_registration);
UPDATE public.crm_lead_sources SET company_id=(SELECT id FROM public.crm_companies WHERE is_default_registration);
UPDATE public.crm_leads SET company_id=(SELECT id FROM public.crm_companies WHERE is_default_registration);
UPDATE public.admin_action_logs l SET company_id=u.company_id FROM public.users u
WHERE l.company_id IS NULL AND u.id=COALESCE(l.target_user_id,l.admin_user_id);

ALTER TABLE public.crm_offices ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.crm_lead_sources ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.crm_leads ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.crm_offices DROP CONSTRAINT IF EXISTS crm_offices_code_key;
DROP INDEX IF EXISTS public.crm_offices_name_unique_idx;
CREATE UNIQUE INDEX crm_offices_company_code_unique_idx ON public.crm_offices(company_id,code);
CREATE UNIQUE INDEX crm_offices_company_name_unique_idx ON public.crm_offices(company_id,lower(name));

ALTER TABLE public.crm_leads DROP CONSTRAINT IF EXISTS crm_leads_email_key;
CREATE UNIQUE INDEX crm_leads_company_email_unique_idx ON public.crm_leads(company_id,email);
CREATE INDEX users_company_created_idx ON public.users(company_id,created_at DESC);
CREATE INDEX crm_offices_company_status_idx ON public.crm_offices(company_id,status,name);
CREATE INDEX crm_leads_company_status_created_idx ON public.crm_leads(company_id,status,created_at DESC);
CREATE INDEX crm_lead_sources_company_created_idx ON public.crm_lead_sources(company_id,created_at DESC);

ALTER TABLE crm_private.admin_ip_allowlist
  ADD COLUMN company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  ADD COLUMN access_scope text NOT NULL DEFAULT 'platform' CHECK (access_scope IN ('platform','company'));
UPDATE crm_private.admin_ip_allowlist
SET access_scope='company', company_id=(SELECT id FROM public.crm_companies WHERE is_default_registration)
WHERE address='92.246.87.144'::inet;
UPDATE crm_private.admin_ip_allowlist SET access_scope='platform',company_id=NULL
WHERE address<>'92.246.87.144'::inet;
ALTER TABLE crm_private.admin_ip_allowlist ADD CONSTRAINT admin_ip_scope_company_check CHECK (
  (access_scope='platform' AND company_id IS NULL) OR (access_scope='company' AND company_id IS NOT NULL)
);
CREATE INDEX admin_ip_company_idx ON crm_private.admin_ip_allowlist(company_id) WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION crm_private.request_ip()
RETURNS inet LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_headers jsonb; v_value text;
BEGIN
  BEGIN v_headers:=NULLIF(current_setting('request.headers',true),'')::jsonb;
  EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  v_value:=COALESCE(v_headers->>'cf-connecting-ip',split_part(v_headers->>'x-forwarded-for',',',1),v_headers->>'x-real-ip');
  BEGIN RETURN NULLIF(btrim(v_value),'')::inet;
  EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.network_context(p_ip text)
RETURNS TABLE(access_scope text,company_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ip inet;
BEGIN
  BEGIN v_ip:=NULLIF(btrim(p_ip),'')::inet; EXCEPTION WHEN OTHERS THEN RETURN; END;
  RETURN QUERY SELECT a.access_scope,a.company_id FROM crm_private.admin_ip_allowlist a WHERE a.address=v_ip;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.request_network_context()
RETURNS TABLE(access_scope text,company_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT a.access_scope,a.company_id FROM crm_private.admin_ip_allowlist a WHERE a.address=crm_private.request_ip();
$$;

CREATE OR REPLACE FUNCTION crm_private.effective_company(p_requested uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor public.users%ROWTYPE; v_scope text; v_network_company uuid; v_result uuid;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT n.access_scope,n.company_id INTO v_scope,v_network_company FROM crm_private.request_network_context() n;
  IF v_scope IS NULL THEN RAISE EXCEPTION 'CRM access requires an approved network'; END IF;
  IF v_actor.is_admin THEN
    IF v_scope='platform' THEN
      v_result:=p_requested;
      IF v_result IS NULL THEN SELECT id INTO v_result FROM public.crm_companies WHERE is_default_registration; END IF;
    ELSE v_result:=v_network_company;
    END IF;
  ELSE
    IF v_scope<>'company' OR v_actor.company_id IS DISTINCT FROM v_network_company THEN
      RAISE EXCEPTION 'This account is not assigned to the company for this network';
    END IF;
    v_result:=v_actor.company_id;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.crm_companies WHERE id=v_result AND status='active') THEN RAISE EXCEPTION 'Company is unavailable'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.is_platform_request()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM crm_private.request_network_context() n WHERE n.access_scope='platform');
$$;

CREATE OR REPLACE FUNCTION crm_private.same_company(p_left uuid,p_right uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.users a JOIN public.users b ON b.id=p_right
    WHERE a.id=p_left AND a.company_id IS NOT NULL AND a.company_id=b.company_id);
$$;

CREATE OR REPLACE FUNCTION crm_private.assert_actor_user_access(p_target uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor public.users%ROWTYPE; v_target_company uuid; v_effective uuid;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id=auth.uid();
  SELECT company_id INTO v_target_company FROM public.users WHERE id=p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF auth.role()='service_role' OR auth.uid()=p_target THEN RETURN; END IF;
  IF v_actor.is_admin THEN
    IF crm_private.is_platform_request() THEN RETURN; END IF;
    v_effective:=crm_private.effective_company(NULL);
    IF v_target_company IS NOT DISTINCT FROM v_effective THEN RETURN; END IF;
  ELSIF v_actor.company_id IS NOT NULL AND v_actor.company_id=v_target_company THEN RETURN;
  END IF;
  RAISE EXCEPTION 'Account belongs to another company';
END;
$$;

/* Direct table policies may use check_admin_role. Only a platform-network admin
   receives that global bypass; company admins use scoped SECURITY DEFINER RPCs. */
CREATE OR REPLACE FUNCTION public.check_admin_role(user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(auth.role()='service_role',false) OR (
    user_id=auth.uid() AND crm_private.is_platform_request()
    AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.is_admin));
$$;

CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role()<>'service_role' AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.is_admin) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF auth.role()<>'service_role' AND NOT EXISTS(SELECT 1 FROM crm_private.request_network_context()) THEN
    RAISE EXCEPTION 'Administrator network access required';
  END IF;
END;
$$;

/* Assign new clients without changing the registration UI. A valid hidden
   registration key or same-company referral wins; otherwise use the default. */
CREATE OR REPLACE FUNCTION crm_private.assign_new_user_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_meta jsonb; v_key uuid; v_ref text;
BEGIN
  IF NEW.company_id IS NOT NULL OR NEW.is_admin THEN RETURN NEW; END IF;
  SELECT COALESCE(raw_user_meta_data,'{}'::jsonb) INTO v_meta FROM auth.users WHERE id=NEW.id;
  BEGIN v_key:=NULLIF(v_meta->>'crm_company_key','')::uuid; EXCEPTION WHEN OTHERS THEN v_key:=NULL; END;
  v_ref:=upper(btrim(COALESCE(v_meta->>'referral_code','')));
  IF v_key IS NOT NULL THEN SELECT id INTO NEW.company_id FROM public.crm_companies WHERE registration_key=v_key AND status='active'; END IF;
  IF NEW.company_id IS NULL AND v_ref<>'' THEN SELECT company_id INTO NEW.company_id FROM public.users WHERE referral_code=v_ref LIMIT 1; END IF;
  IF NEW.company_id IS NULL THEN SELECT id INTO NEW.company_id FROM public.crm_companies WHERE is_default_registration AND status='active'; END IF;
  IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'No active registration company is configured'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS crm_assign_new_user_company_trigger ON public.users;
CREATE TRIGGER crm_assign_new_user_company_trigger BEFORE INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION crm_private.assign_new_user_company();

CREATE OR REPLACE FUNCTION crm_private.protect_user_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_target uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN RETURN NEW; END IF;
  IF auth.role()='service_role' OR COALESCE(current_setting('crm.company_authorized',true),'')='yes' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  v_target:=COALESCE(NEW.id,OLD.id);
  PERFORM crm_private.assert_actor_user_access(v_target);
  RAISE EXCEPTION 'Company assignment can only be changed through company administration';
END;
$$;
DROP TRIGGER IF EXISTS crm_protect_user_company_trigger ON public.users;
CREATE TRIGGER crm_protect_user_company_trigger BEFORE UPDATE OF company_id ON public.users
FOR EACH ROW EXECUTE FUNCTION crm_private.protect_user_company();

CREATE OR REPLACE FUNCTION crm_private.guard_user_profile_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.role()<>'service_role' THEN
    PERFORM crm_private.assert_actor_user_access(OLD.id);
    IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN PERFORM crm_private.assert_actor_user_access(NEW.id); END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DROP TRIGGER IF EXISTS crm_company_user_profile_guard ON public.users;
CREATE TRIGGER crm_company_user_profile_guard BEFORE UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION crm_private.guard_user_profile_row();

/* Guard every user-owned business row, including writes performed inside older
   SECURITY DEFINER administrator functions. */
CREATE OR REPLACE FUNCTION crm_private.guard_user_owned_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.role()='service_role' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP<>'INSERT' THEN BEGIN v_old:=(to_jsonb(OLD)->>TG_ARGV[0])::uuid; EXCEPTION WHEN OTHERS THEN v_old:=NULL; END; END IF;
  IF TG_OP<>'DELETE' THEN BEGIN v_new:=(to_jsonb(NEW)->>TG_ARGV[0])::uuid; EXCEPTION WHEN OTHERS THEN v_new:=NULL; END; END IF;
  IF v_old IS NOT NULL THEN PERFORM crm_private.assert_actor_user_access(v_old); END IF;
  IF v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN PERFORM crm_private.assert_actor_user_access(v_new); END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.guard_company_owned_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old uuid; v_new uuid; v_actor public.users%ROWTYPE; v_effective uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.role()='service_role' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  SELECT * INTO v_actor FROM public.users WHERE id=auth.uid();
  IF TG_OP<>'INSERT' THEN v_old:=(to_jsonb(OLD)->>'company_id')::uuid; END IF;
  IF TG_OP<>'DELETE' THEN v_new:=(to_jsonb(NEW)->>'company_id')::uuid; END IF;
  IF v_actor.is_admin AND crm_private.is_platform_request() THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  v_effective:=crm_private.effective_company(NULL);
  IF (v_old IS NULL OR v_old=v_effective) AND (v_new IS NULL OR v_new=v_effective) THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  RAISE EXCEPTION 'Record belongs to another company';
END;
$$;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['crm_offices','crm_leads','crm_lead_sources'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS crm_company_record_guard ON public.%I',n);
  EXECUTE format('CREATE TRIGGER crm_company_record_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION crm_private.guard_company_owned_row()',n);
END LOOP; END $$;
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t
    ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.column_name='user_id' AND c.table_name<>'users'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS crm_company_user_guard ON public.%I',r.table_name);
    EXECUTE format('CREATE TRIGGER crm_company_user_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION crm_private.guard_user_owned_row(''user_id'')',r.table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION crm_private.validate_company_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_company uuid; v_related uuid;
BEGIN
  IF TG_TABLE_NAME='crm_offices' THEN
    IF NEW.created_by IS NOT NULL AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=NEW.created_by AND NOT u.is_admin AND u.company_id IS DISTINCT FROM NEW.company_id) THEN RAISE EXCEPTION 'Office creator belongs to another company'; END IF;
  ELSIF TG_TABLE_NAME='crm_leads' THEN
    IF NEW.office_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_offices o WHERE o.id=NEW.office_id AND o.company_id=NEW.company_id) THEN RAISE EXCEPTION 'Lead Office belongs to another company'; END IF;
    IF NEW.source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_lead_sources s WHERE s.id=NEW.source_id AND s.company_id=NEW.company_id) THEN RAISE EXCEPTION 'Lead source belongs to another company'; END IF;
    IF NEW.registered_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=NEW.registered_user_id AND u.company_id=NEW.company_id) THEN RAISE EXCEPTION 'Registered client belongs to another company'; END IF;
  ELSIF TG_TABLE_NAME='users' AND NEW.office_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.crm_offices o WHERE o.id=NEW.office_id AND o.company_id=NEW.company_id) THEN RAISE EXCEPTION 'Office belongs to another company'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS crm_company_links_offices ON public.crm_offices;
CREATE TRIGGER crm_company_links_offices BEFORE INSERT OR UPDATE ON public.crm_offices FOR EACH ROW EXECUTE FUNCTION crm_private.validate_company_links();
DROP TRIGGER IF EXISTS crm_company_links_leads ON public.crm_leads;
CREATE TRIGGER crm_company_links_leads BEFORE INSERT OR UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION crm_private.validate_company_links();
DROP TRIGGER IF EXISTS crm_company_links_users ON public.users;
CREATE TRIGGER crm_company_links_users BEFORE INSERT OR UPDATE OF office_id,company_id ON public.users FOR EACH ROW EXECUTE FUNCTION crm_private.validate_company_links();

CREATE OR REPLACE FUNCTION public.crm_admin_list_companies()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_scope text; v_company uuid;
BEGIN
  PERFORM public.require_admin();
  SELECT n.access_scope,n.company_id INTO v_scope,v_company FROM crm_private.request_network_context() n;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',c.id,'name',c.name,'code',c.code,'status',c.status,'registration_key',c.registration_key,
    'registration_path','/auth/register?company='||c.registration_key::text,
    'user_count',(SELECT count(*) FROM public.users u WHERE u.company_id=c.id),
    'lead_count',(SELECT count(*) FROM public.crm_leads l WHERE l.company_id=c.id),
    'office_count',(SELECT count(*) FROM public.crm_offices o WHERE o.company_id=c.id)
  ) ORDER BY c.created_at) FROM public.crm_companies c WHERE v_scope='platform' OR c.id=v_company),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_create_company(p_name text,p_code text,p_primary_ip text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_company public.crm_companies%ROWTYPE; v_ip inet;
BEGIN
  PERFORM public.require_admin();
  IF NOT crm_private.is_platform_request() THEN RAISE EXCEPTION 'Platform network required to create a company'; END IF;
  IF length(btrim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Enter a company name'; END IF;
  IF upper(btrim(COALESCE(p_code,'')))!~'^[A-Z0-9_-]{2,24}$' THEN RAISE EXCEPTION 'Use a 2-24 character company code'; END IF;
  BEGIN v_ip:=btrim(p_primary_ip)::inet; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Enter a valid primary IP address'; END;
  INSERT INTO public.crm_companies(name,code,created_by) VALUES(btrim(p_name),upper(btrim(p_code)),auth.uid()) RETURNING * INTO v_company;
  INSERT INTO crm_private.admin_ip_allowlist(address,label,created_by,company_id,access_scope)
  VALUES(v_ip,v_company.name||' primary network',auth.uid(),v_company.id,'company');
  INSERT INTO public.admin_action_logs(admin_user_id,company_id,action,after_data,reason)
  VALUES(auth.uid(),v_company.id,'crm_company_created',jsonb_build_object('company_id',v_company.id,'code',v_company.code,'primary_ip',host(v_ip)),'CRM company administration');
  RETURN jsonb_build_object('id',v_company.id,'name',v_company.name,'code',v_company.code,'registration_key',v_company.registration_key,'registration_path','/auth/register?company='||v_company.registration_key::text);
END;
$$;

DROP FUNCTION public.crm_admin_list_ips();
CREATE FUNCTION public.crm_admin_list_ips()
RETURNS TABLE(ip_address text,label text,created_at timestamptz,created_by uuid,is_current boolean,access_scope text,company_id uuid,company_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_scope text; v_company uuid; v_ip inet;
BEGIN
  PERFORM public.require_admin();
  SELECT n.access_scope,n.company_id INTO v_scope,v_company FROM crm_private.request_network_context() n;
  v_ip:=crm_private.request_ip();
  RETURN QUERY SELECT host(a.address),a.label,a.created_at,a.created_by,a.address=v_ip,a.access_scope,a.company_id,c.name
  FROM crm_private.admin_ip_allowlist a LEFT JOIN public.crm_companies c ON c.id=a.company_id
  WHERE v_scope='platform' OR a.company_id=v_company ORDER BY c.name NULLS FIRST,a.created_at,a.address;
END;
$$;

DROP FUNCTION public.crm_admin_add_ip(text,text);
CREATE FUNCTION public.crm_admin_add_ip(p_ip text,p_label text DEFAULT '',p_company_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_address inet; v_label text:=btrim(COALESCE(p_label,'')); v_scope text; v_network_company uuid; v_target uuid;
BEGIN
  PERFORM public.require_admin();
  BEGIN v_address:=btrim(p_ip)::inet; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Enter a single valid IP address'; END;
  IF position('/' IN p_ip)>0 OR length(v_label)>80 THEN RAISE EXCEPTION 'Enter a single valid IP and a label up to 80 characters'; END IF;
  SELECT n.access_scope,n.company_id INTO v_scope,v_network_company FROM crm_private.request_network_context() n;
  v_target:=CASE WHEN v_scope='platform' THEN p_company_id ELSE v_network_company END;
  IF v_target IS NULL OR NOT EXISTS(SELECT 1 FROM public.crm_companies WHERE id=v_target AND status='active') THEN RAISE EXCEPTION 'Select an active company for this IP'; END IF;
  INSERT INTO crm_private.admin_ip_allowlist(address,label,created_by,company_id,access_scope) VALUES(v_address,v_label,auth.uid(),v_target,'company');
  INSERT INTO public.admin_action_logs(admin_user_id,company_id,action,after_data,reason)
  VALUES(auth.uid(),v_target,'admin_ip_added',jsonb_build_object('ip',host(v_address),'label',v_label),'CRM company network access');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_remove_ip(p_ip text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_address inet; v_current inet; v_scope text; v_company uuid; v_row crm_private.admin_ip_allowlist%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  BEGIN v_address:=btrim(p_ip)::inet; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Enter a single valid IP address'; END;
  v_current:=crm_private.request_ip();
  IF v_address=v_current THEN RAISE EXCEPTION 'Use another approved network to remove your current IP'; END IF;
  SELECT n.access_scope,n.company_id INTO v_scope,v_company FROM crm_private.request_network_context() n;
  SELECT * INTO v_row FROM crm_private.admin_ip_allowlist WHERE address=v_address FOR UPDATE;
  IF NOT FOUND OR (v_scope<>'platform' AND v_row.company_id IS DISTINCT FROM v_company) THEN RAISE EXCEPTION 'IP address is not available in your company'; END IF;
  IF v_row.access_scope='platform' AND (SELECT count(*) FROM crm_private.admin_ip_allowlist WHERE access_scope='platform')<=1 THEN RAISE EXCEPTION 'At least one platform network is required'; END IF;
  IF v_row.access_scope='company' AND (SELECT count(*) FROM crm_private.admin_ip_allowlist WHERE company_id=v_row.company_id)<=1 THEN RAISE EXCEPTION 'A company must keep at least one approved network'; END IF;
  DELETE FROM crm_private.admin_ip_allowlist WHERE address=v_address;
  INSERT INTO public.admin_action_logs(admin_user_id,company_id,action,before_data,reason)
  VALUES(auth.uid(),v_row.company_id,'admin_ip_removed',jsonb_build_object('ip',host(v_address),'label',v_row.label),'CRM company network access');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_network_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_scope text; v_company uuid;
BEGIN
  PERFORM public.require_admin();
  SELECT n.access_scope,n.company_id INTO v_scope,v_company FROM crm_private.request_network_context() n;
  RETURN jsonb_build_object('access_scope',v_scope,'company_id',v_company,'is_platform',v_scope='platform');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_staff_network_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.users u JOIN crm_private.request_network_context() n ON n.access_scope='company' AND n.company_id=u.company_id
    WHERE u.id=auth.uid() AND EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id));
$$;

ALTER FUNCTION public.crm_staff_get_scope(text) RENAME TO crm_staff_get_scope_unscoped;
REVOKE ALL ON FUNCTION public.crm_staff_get_scope_unscoped(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_staff_get_scope(p_search text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NOT public.crm_staff_network_allowed() THEN RAISE EXCEPTION 'CRM access requires your company network'; END IF;
  RETURN public.crm_staff_get_scope_unscoped(p_search); END; $$;
ALTER FUNCTION public.crm_staff_get_client_workspace(uuid) RENAME TO crm_staff_get_client_workspace_unscoped;
REVOKE ALL ON FUNCTION public.crm_staff_get_client_workspace_unscoped(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_staff_get_client_workspace(p_client_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NOT public.crm_staff_network_allowed() THEN RAISE EXCEPTION 'CRM access requires your company network'; END IF;
  IF NOT crm_private.same_company(auth.uid(),p_client_id) THEN RAISE EXCEPTION 'Client belongs to another company'; END IF;
  RETURN public.crm_staff_get_client_workspace_unscoped(p_client_id); END; $$;
ALTER FUNCTION public.crm_promote_client_to_retention(uuid) RENAME TO crm_promote_client_to_retention_unscoped;
REVOKE ALL ON FUNCTION public.crm_promote_client_to_retention_unscoped(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_promote_client_to_retention(p_client_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF crm_private.actor_role_for(auth.uid())<>'admin' AND NOT public.crm_staff_network_allowed() THEN RAISE EXCEPTION 'CRM access requires your company network'; END IF;
  PERFORM crm_private.assert_actor_user_access(p_client_id); PERFORM public.crm_promote_client_to_retention_unscoped(p_client_id); END; $$;
ALTER FUNCTION public.crm_workflow_add_lead_deposit(uuid,numeric,text,text,text) RENAME TO crm_workflow_add_lead_deposit_unscoped;
REVOKE ALL ON FUNCTION public.crm_workflow_add_lead_deposit_unscoped(uuid,numeric,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_workflow_add_lead_deposit(p_client_id uuid,p_amount numeric,p_currency text,p_reference text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF crm_private.actor_role_for(auth.uid())<>'admin' AND NOT public.crm_staff_network_allowed() THEN RAISE EXCEPTION 'CRM access requires your company network'; END IF;
  PERFORM crm_private.assert_actor_user_access(p_client_id); RETURN public.crm_workflow_add_lead_deposit_unscoped(p_client_id,p_amount,p_currency,p_reference,p_reason); END; $$;
ALTER FUNCTION public.crm_workflow_update_lead_deposit(uuid,numeric,text,text,text) RENAME TO crm_workflow_update_lead_deposit_unscoped;
REVOKE ALL ON FUNCTION public.crm_workflow_update_lead_deposit_unscoped(uuid,numeric,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_workflow_update_lead_deposit(p_transaction_id uuid,p_amount numeric,p_currency text,p_reference text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_client_id uuid;
BEGIN
  IF crm_private.actor_role_for(auth.uid())<>'admin' AND NOT public.crm_staff_network_allowed() THEN RAISE EXCEPTION 'CRM access requires your company network'; END IF;
  SELECT t.user_id INTO v_client_id FROM public.transactions t WHERE t.id=p_transaction_id;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Deposit not found'; END IF;
  PERFORM crm_private.assert_actor_user_access(v_client_id);
  RETURN public.crm_workflow_update_lead_deposit_unscoped(p_transaction_id,p_amount,p_currency,p_reference,p_reason);
END; $$;

CREATE OR REPLACE FUNCTION public.crm_service_actor_context(p_actor_id uuid,p_ip text,p_requested_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor public.users%ROWTYPE; v_scope text; v_network_company uuid; v_effective uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT * INTO v_actor FROM public.users WHERE id=p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM account not found'; END IF;
  SELECT n.access_scope,n.company_id INTO v_scope,v_network_company FROM crm_private.network_context(p_ip) n;
  IF v_scope IS NULL THEN RAISE EXCEPTION 'CRM access requires an approved network'; END IF;
  IF v_actor.is_admin THEN
    IF v_scope='platform' THEN v_effective:=COALESCE(p_requested_company_id,(SELECT id FROM public.crm_companies WHERE is_default_registration));
    ELSE v_effective:=v_network_company; END IF;
  ELSE
    IF v_scope<>'company' OR v_actor.company_id IS DISTINCT FROM v_network_company THEN RAISE EXCEPTION 'Account and network belong to different companies'; END IF;
    v_effective:=v_actor.company_id;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.crm_companies WHERE id=v_effective AND status='active') THEN RAISE EXCEPTION 'Company is unavailable'; END IF;
  RETURN jsonb_build_object('actor_id',p_actor_id,'is_admin',v_actor.is_admin,'access_scope',v_scope,'company_id',v_effective);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_service_set_user_company(p_user_id uuid,p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.crm_companies WHERE id=p_company_id AND status='active') THEN RAISE EXCEPTION 'Company is unavailable'; END IF;
  PERFORM set_config('crm.company_authorized','yes',true);
  UPDATE public.users SET company_id=p_company_id,updated_at=now() WHERE id=p_user_id AND (company_id IS NULL OR company_id=p_company_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Account belongs to another company'; END IF;
END;
$$;

/* Company-aware customer list. */
DROP FUNCTION public.admin_get_users(text,integer,integer,text);
CREATE FUNCTION public.admin_get_users(p_search text DEFAULT NULL,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0,p_kyc_status text DEFAULT NULL,p_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb; v_company uuid;
BEGIN
  PERFORM public.require_admin(); v_company:=crm_private.effective_company(p_company_id);
  IF p_kyc_status IS NOT NULL AND p_kyc_status NOT IN ('not_verified','pending','verified') THEN RAISE EXCEPTION 'Invalid KYC status filter'; END IF;
  WITH clients AS (SELECT u.* FROM public.users u WHERE u.company_id=v_company AND NOT u.is_admin
    AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id)),
  filtered AS (SELECT u.* FROM clients u WHERE (p_kyc_status IS NULL OR u.kyc_status=p_kyc_status) AND (
    p_search IS NULL OR btrim(p_search)='' OR u.email ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.first_name,'') ILIKE '%'||btrim(p_search)||'%'
    OR COALESCE(u.last_name,'') ILIKE '%'||btrim(p_search)||'%' OR u.id::text ILIKE '%'||btrim(p_search)||'%'
    OR EXISTS(SELECT 1 FROM public.client_profiles cp WHERE cp.user_id=u.id AND (cp.client_id ILIKE '%'||btrim(p_search)||'%' OR cp.client_number::text=btrim(p_search))))),
  page AS (SELECT * FROM filtered ORDER BY created_at DESC LIMIT LEAST(GREATEST(p_limit,1),250) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object('company_id',v_company,'users',COALESCE((SELECT jsonb_agg((to_jsonb(p)-'is_demo')||jsonb_build_object(
    'client_number',cp.client_number,'client_id',cp.client_id,'usdt_balance',COALESCE(b.usdt_balance,0),'usd_balance',COALESCE(b.usd_balance,0),
    'btc_balance',COALESCE(b.btc_balance,0),'robot_allocated_balance',COALESCE(r.allocated_balance,0),'robot_active',COALESCE(r.is_active,false)) ORDER BY p.created_at DESC)
    FROM page p LEFT JOIN public.client_profiles cp ON cp.user_id=p.id LEFT JOIN public.balances b ON b.user_id=p.id LEFT JOIN public.robot_states r ON r.user_id=p.id),'[]'::jsonb),
    'total',(SELECT count(*) FROM clients),'stats',jsonb_build_object('total_users',(SELECT count(*) FROM clients),'pending_kyc',(SELECT count(*) FROM clients WHERE kyc_status='pending'),
    'active_robots',(SELECT count(*) FROM public.robot_states r JOIN clients c ON c.id=r.user_id WHERE r.is_active),
    'total_usdt',(SELECT COALESCE(sum(b.usdt_balance),0) FROM public.balances b JOIN clients c ON c.id=b.user_id),
    'total_usd',(SELECT COALESCE(sum(b.usd_balance),0) FROM public.balances b JOIN clients c ON c.id=b.user_id),
    'total_robot_allocated',(SELECT COALESCE(sum(r.allocated_balance),0) FROM public.robot_states r JOIN clients c ON c.id=r.user_id))) INTO v_result;
  RETURN v_result;
END;
$$;

/* Put tenant checks in front of the existing rich workspace/detail readers. */
ALTER FUNCTION public.admin_get_user_workspace(uuid) RENAME TO admin_get_user_workspace_unscoped;
REVOKE ALL ON FUNCTION public.admin_get_user_workspace_unscoped(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_get_user_workspace(p_target_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.require_admin(); PERFORM crm_private.assert_actor_user_access(p_target_user_id); RETURN public.admin_get_user_workspace_unscoped(p_target_user_id); END; $$;
ALTER FUNCTION public.admin_get_kyc_tax_id(uuid) RENAME TO admin_get_kyc_tax_id_unscoped;
REVOKE ALL ON FUNCTION public.admin_get_kyc_tax_id_unscoped(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_get_kyc_tax_id(p_target_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.require_admin(); PERFORM crm_private.assert_actor_user_access(p_target_user_id); RETURN public.admin_get_kyc_tax_id_unscoped(p_target_user_id); END; $$;
ALTER FUNCTION public.admin_get_client_onboarding(uuid) RENAME TO admin_get_client_onboarding_unscoped;
REVOKE ALL ON FUNCTION public.admin_get_client_onboarding_unscoped(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_get_client_onboarding(p_target_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.require_admin(); PERFORM crm_private.assert_actor_user_access(p_target_user_id); RETURN public.admin_get_client_onboarding_unscoped(p_target_user_id); END; $$;
ALTER FUNCTION public.admin_get_account_role(uuid) RENAME TO admin_get_account_role_unscoped;
REVOKE ALL ON FUNCTION public.admin_get_account_role_unscoped(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_get_account_role(p_target_user_id uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.require_admin(); PERFORM crm_private.assert_actor_user_access(p_target_user_id); RETURN public.admin_get_account_role_unscoped(p_target_user_id); END; $$;
ALTER FUNCTION public.admin_get_user_wheel_grants(uuid) RENAME TO admin_get_user_wheel_grants_unscoped;
REVOKE ALL ON FUNCTION public.admin_get_user_wheel_grants_unscoped(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_get_user_wheel_grants(p_target_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.require_admin(); PERFORM crm_private.assert_actor_user_access(p_target_user_id); RETURN public.admin_get_user_wheel_grants_unscoped(p_target_user_id); END; $$;

/* Tenant-aware hierarchy read; company links are also rechecked by assignment triggers. */
DROP FUNCTION public.crm_admin_get_hierarchy();
CREATE FUNCTION public.crm_admin_get_hierarchy(p_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_company uuid;
BEGIN
  PERFORM public.require_admin(); v_company:=crm_private.effective_company(p_company_id);
  RETURN jsonb_build_object('company_id',v_company,
    'offices',COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.name) FROM public.crm_offices o WHERE o.company_id=v_company),'[]'::jsonb),
    'people',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'created_at',u.created_at,
      'is_promoted',u.is_promoted,'office_id',u.office_id,'office_name',o.name,'office_code',o.code,
      'registration_source_key',CASE WHEN lead.source_id IS NOT NULL THEN 'lead:'||lead.source_id::text WHEN lead.source_name IS NOT NULL THEN 'lead-name:'||lead.source_name
        WHEN onboarding.source IS NOT NULL THEN 'onboarding:'||onboarding.source ELSE 'unknown' END,
      'registration_source_name',COALESCE(NULLIF(lead.source_name,''),CASE onboarding.source WHEN 'website_signup' THEN 'Website signup' WHEN 'crm_create_user' THEN 'CRM manual'
        WHEN 'lead_inbox' THEN 'Lead Inbox' WHEN 'auth' THEN 'Direct signup' ELSE initcap(replace(COALESCE(onboarding.source,'Unknown'),'_',' ')) END),
      'registration_source_kind',COALESCE(lead.source_kind,onboarding.source,'unknown'),'role',CASE WHEN u.is_admin THEN 'admin' ELSE COALESCE(s.role,'client') END) ORDER BY u.created_at DESC)
      FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id=u.id LEFT JOIN public.crm_offices o ON o.id=u.office_id
      LEFT JOIN LATERAL(SELECT l.source_id,l.source_name,l.source_kind FROM public.crm_leads l WHERE l.registered_user_id=u.id AND l.company_id=v_company ORDER BY l.invited_at DESC NULLS LAST,l.created_at DESC LIMIT 1)lead ON true
      LEFT JOIN LATERAL(SELECT e.source FROM public.client_onboarding_events e WHERE e.auth_user_id=u.id AND e.status='completed' ORDER BY e.created_at DESC LIMIT 1)onboarding ON true
      WHERE u.company_id=v_company),'[]'::jsonb),
    'workflow_desk_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_workflow_desk_assignments x JOIN public.users u ON u.id=x.desk_manager_id WHERE u.company_id=v_company),'[]'::jsonb),
    'agent_desk_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_agent_desk_assignments x JOIN public.users u ON u.id=x.agent_id WHERE u.company_id=v_company),'[]'::jsonb),
    'retention_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_retention_manager_assignments x JOIN public.users u ON u.id=x.retention_id WHERE u.company_id=v_company),'[]'::jsonb),
    'client_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_client_agent_assignments x JOIN public.users u ON u.id=x.client_id WHERE u.company_id=v_company),'[]'::jsonb),
    'retention_client_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_client_retention_assignments x JOIN public.users u ON u.id=x.client_id WHERE u.company_id=v_company),'[]'::jsonb));
END;
$$;

DROP FUNCTION public.crm_admin_save_office(uuid,text,text,text);
CREATE FUNCTION public.crm_admin_save_office(p_office_id uuid,p_name text,p_code text,p_status text DEFAULT 'active',p_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_office public.crm_offices%ROWTYPE; v_company uuid:=crm_private.effective_company(p_company_id); v_code text:=upper(btrim(COALESCE(p_code,'')));
BEGIN
  PERFORM public.require_admin();
  IF length(btrim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Enter an Office name'; END IF;
  IF v_code!~'^[A-Z0-9_-]{2,20}$' OR p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Invalid Office details'; END IF;
  IF p_office_id IS NULL THEN INSERT INTO public.crm_offices(name,code,status,created_by,company_id) VALUES(btrim(p_name),v_code,p_status,auth.uid(),v_company) RETURNING * INTO v_office;
  ELSE UPDATE public.crm_offices SET name=btrim(p_name),code=v_code,status=p_status,updated_at=now() WHERE id=p_office_id AND company_id=v_company RETURNING * INTO v_office;
    IF NOT FOUND THEN RAISE EXCEPTION 'Office not found in this company'; END IF; END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,company_id,action,after_data,reason) VALUES(auth.uid(),v_company,'crm_office_saved',to_jsonb(v_office),'CRM Office management');
  RETURN to_jsonb(v_office);
END;
$$;

ALTER FUNCTION public.crm_admin_get_office_delete_preview(uuid) RENAME TO crm_admin_get_office_delete_preview_unscoped;
REVOKE ALL ON FUNCTION public.crm_admin_get_office_delete_preview_unscoped(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_admin_get_office_delete_preview(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_company uuid;
BEGIN
  PERFORM public.require_admin(); v_company:=crm_private.effective_company(NULL);
  IF NOT crm_private.is_platform_request() AND NOT EXISTS(SELECT 1 FROM public.crm_offices WHERE id=p_office_id AND company_id=v_company) THEN RAISE EXCEPTION 'Office belongs to another company'; END IF;
  RETURN public.crm_admin_get_office_delete_preview_unscoped(p_office_id);
END;
$$;

/* Add the tenant boundary before existing hierarchy/office validation. */
CREATE OR REPLACE FUNCTION crm_private.validate_hierarchy_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a uuid; b uuid;
BEGIN
  IF TG_TABLE_NAME='crm_workflow_desk_assignments' THEN a:=NEW.workflow_manager_id;b:=NEW.desk_manager_id;
  ELSIF TG_TABLE_NAME='crm_agent_desk_assignments' THEN a:=NEW.agent_id;b:=NEW.desk_manager_id;
  ELSIF TG_TABLE_NAME='crm_retention_manager_assignments' THEN a:=NEW.retention_id;b:=NEW.retention_manager_id;
  ELSIF TG_TABLE_NAME='crm_client_agent_assignments' THEN a:=NEW.client_id;b:=NEW.agent_id;
  ELSE a:=NEW.client_id;b:=NEW.retention_id; END IF;
  IF NOT crm_private.same_company(a,b) THEN RAISE EXCEPTION 'CRM hierarchy cannot cross companies'; END IF;
  RETURN NEW;
END;
$$;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['crm_workflow_desk_assignments','crm_agent_desk_assignments','crm_retention_manager_assignments','crm_client_agent_assignments','crm_client_retention_assignments'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS crm_hierarchy_company_guard ON public.%I',n);
  EXECUTE format('CREATE TRIGGER crm_hierarchy_company_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION crm_private.validate_hierarchy_company()',n);
END LOOP; END $$;

CREATE OR REPLACE FUNCTION crm_private.can_actor_view_client(p_actor_id uuid,p_client_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role_for(p_actor_id); v_promoted boolean;
BEGIN
  IF NOT crm_private.same_company(p_actor_id,p_client_id) AND v_role<>'admin' THEN RETURN false; END IF;
  SELECT u.is_promoted INTO v_promoted FROM public.users u WHERE u.id=p_client_id AND NOT u.is_admin
    AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id);
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role='admin' THEN
    IF auth.role()='service_role' THEN RETURN true; END IF;
    RETURN EXISTS(SELECT 1 FROM public.users a WHERE a.id=p_actor_id AND (crm_private.is_platform_request() OR a.company_id=(SELECT company_id FROM public.users WHERE id=p_client_id)));
  END IF;
  IF NOT v_promoted AND v_role='workflow_manager' THEN RETURN true; END IF;
  IF v_promoted AND v_role='retention_manager' THEN RETURN true; END IF;
  IF NOT crm_private.same_office(p_actor_id,p_client_id) THEN RETURN false; END IF;
  IF NOT v_promoted AND v_role='agent' THEN RETURN EXISTS(SELECT 1 FROM public.crm_client_agent_assignments c WHERE c.client_id=p_client_id AND c.agent_id=p_actor_id);
  ELSIF NOT v_promoted AND v_role='desk_manager' THEN RETURN EXISTS(SELECT 1 FROM public.crm_client_agent_assignments c JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=c.agent_id WHERE c.client_id=p_client_id AND ad.desk_manager_id=p_actor_id);
  ELSIF v_promoted AND v_role='retention' THEN RETURN EXISTS(SELECT 1 FROM public.crm_client_retention_assignments c WHERE c.client_id=p_client_id AND c.retention_id=p_actor_id);
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION crm_private.request_ip() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.network_context(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.request_network_context() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.effective_company(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.is_platform_request() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.same_company(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.assert_actor_user_access(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.assign_new_user_company() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.guard_user_owned_row() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.guard_company_owned_row() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.guard_user_profile_row() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.validate_company_links() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.validate_hierarchy_company() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_list_companies() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_create_company(text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_list_ips() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_add_ip(text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_remove_ip(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_network_context() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_staff_network_allowed() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_staff_get_scope(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_staff_get_client_workspace(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_promote_client_to_retention(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_workflow_add_lead_deposit(uuid,numeric,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_workflow_update_lead_deposit(uuid,numeric,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_service_actor_context(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_service_set_user_company(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_get_users(text,integer,integer,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_get_user_workspace(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_get_kyc_tax_id(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_get_client_onboarding(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_get_account_role(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_get_user_wheel_grants(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_get_hierarchy(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_save_office(uuid,text,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_get_office_delete_preview(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.crm_admin_list_companies(),public.crm_admin_create_company(text,text,text),public.crm_admin_list_ips(),
  public.crm_admin_add_ip(text,text,uuid),public.crm_admin_remove_ip(text),public.crm_admin_network_context(),public.crm_staff_network_allowed(),
  public.crm_staff_get_scope(text),public.crm_staff_get_client_workspace(uuid),public.crm_promote_client_to_retention(uuid),public.crm_workflow_add_lead_deposit(uuid,numeric,text,text,text),public.crm_workflow_update_lead_deposit(uuid,numeric,text,text,text),
  public.admin_get_users(text,integer,integer,text,uuid),public.admin_get_user_workspace(uuid),public.admin_get_kyc_tax_id(uuid),
  public.admin_get_client_onboarding(uuid),public.admin_get_account_role(uuid),public.admin_get_user_wheel_grants(uuid),
  public.crm_admin_get_hierarchy(uuid),public.crm_admin_save_office(uuid,text,text,text,uuid),public.crm_admin_get_office_delete_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_actor_context(uuid,text,uuid),public.crm_service_set_user_company(uuid,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
