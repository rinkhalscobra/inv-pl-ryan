-- The database is the source of truth for administrator network access.
-- Neither anon nor authenticated clients can read or modify this table directly.
CREATE TABLE crm_private.admin_ip_allowlist (
  address inet PRIMARY KEY,
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 80),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_ip_host_only CHECK (
    masklen(address) = CASE family(address) WHEN 4 THEN 32 ELSE 128 END
  )
);
REVOKE ALL ON crm_private.admin_ip_allowlist FROM PUBLIC, anon, authenticated;
ALTER TABLE crm_private.admin_ip_allowlist ENABLE ROW LEVEL SECURITY;

INSERT INTO crm_private.admin_ip_allowlist (address, label) VALUES
  ('46.166.172.116', 'Initial approved network'),
  ('92.246.87.144', 'Initial approved network');

-- A read-only boolean check is exposed for Vercel Routing Middleware and the
-- two Supabase Edge Functions. The caller's IP must come from each gateway's
-- trusted client-IP header; this function cannot grant access or edit the list.
CREATE FUNCTION crm_private.is_admin_ip_allowlisted(p_ip text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_address inet;
BEGIN
  IF p_ip IS NULL OR length(p_ip) > 45 OR position('/' IN p_ip) > 0 THEN
    RETURN false;
  END IF;
  BEGIN
    v_address := p_ip::inet;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM crm_private.admin_ip_allowlist a WHERE a.address = v_address
  );
END;
$$;
REVOKE ALL ON FUNCTION crm_private.is_admin_ip_allowlisted(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.crm_is_ip_allowlisted(p_ip text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT crm_private.is_admin_ip_allowlisted(p_ip);
$$;
REVOKE ALL ON FUNCTION public.crm_is_ip_allowlisted(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_is_ip_allowlisted(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION crm_private.admin_ip_allowed()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT crm_private.is_admin_ip_allowlisted(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip'
  );
$$;

CREATE FUNCTION public.crm_admin_list_ips()
RETURNS TABLE (ip_address text, label text, created_at timestamptz, created_by uuid, is_current boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_current_ip text;
BEGIN
  PERFORM public.require_admin();
  v_current_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip';
  RETURN QUERY
    SELECT a.address::text, a.label, a.created_at, a.created_by, a.address::text = v_current_ip
    FROM crm_private.admin_ip_allowlist a ORDER BY a.created_at, a.address;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_admin_list_ips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_list_ips() TO authenticated;

CREATE FUNCTION public.crm_admin_add_ip(p_ip text, p_label text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_address inet; v_label text := btrim(coalesce(p_label, ''));
BEGIN
  PERFORM public.require_admin();
  IF p_ip IS NULL OR length(p_ip) > 45 OR position('/' IN p_ip) > 0 THEN
    RAISE EXCEPTION 'Enter a single valid IP address';
  END IF;
  BEGIN
    v_address := btrim(p_ip)::inet;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Enter a single valid IP address';
  END;
  IF length(v_label) > 80 THEN RAISE EXCEPTION 'The label is too long'; END IF;
  INSERT INTO crm_private.admin_ip_allowlist(address, label, created_by)
  VALUES (v_address, v_label, auth.uid());
  INSERT INTO public.admin_action_logs(admin_user_id, action, after_data, reason)
  VALUES (auth.uid(), 'admin_ip_added', jsonb_build_object('ip', v_address::text, 'label', v_label), 'CRM network access');
END;
$$;
REVOKE ALL ON FUNCTION public.crm_admin_add_ip(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_add_ip(text, text) TO authenticated;

CREATE FUNCTION public.crm_admin_remove_ip(p_ip text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_address inet; v_current_ip text; v_label text;
BEGIN
  PERFORM public.require_admin();
  IF p_ip IS NULL OR length(p_ip) > 45 OR position('/' IN p_ip) > 0 THEN
    RAISE EXCEPTION 'Enter a single valid IP address';
  END IF;
  BEGIN
    v_address := p_ip::inet;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Enter a single valid IP address';
  END;
  v_current_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip';
  IF v_address::text = v_current_ip THEN
    RAISE EXCEPTION 'Use another approved network to remove your current IP';
  END IF;
  LOCK TABLE crm_private.admin_ip_allowlist IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT count(*) FROM crm_private.admin_ip_allowlist) <= 1 THEN
    RAISE EXCEPTION 'At least one approved IP address is required';
  END IF;
  DELETE FROM crm_private.admin_ip_allowlist WHERE address = v_address RETURNING label INTO v_label;
  IF NOT FOUND THEN RAISE EXCEPTION 'IP address is not on the allowlist'; END IF;
  INSERT INTO public.admin_action_logs(admin_user_id, action, before_data, reason)
  VALUES (auth.uid(), 'admin_ip_removed', jsonb_build_object('ip', v_address::text, 'label', v_label), 'CRM network access');
END;
$$;
REVOKE ALL ON FUNCTION public.crm_admin_remove_ip(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_remove_ip(text) TO authenticated;
