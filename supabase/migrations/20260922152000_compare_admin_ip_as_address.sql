-- Compare inet values so equivalent IPv6 text representations identify the
-- same current network.
CREATE OR REPLACE FUNCTION public.crm_admin_list_ips()
RETURNS TABLE (ip_address text, label text, created_at timestamptz, created_by uuid, is_current boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_current_ip inet;
BEGIN
  PERFORM public.require_admin();
  v_current_ip := (nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip')::inet;
  RETURN QUERY
    SELECT host(a.address), a.label, a.created_at, a.created_by, a.address = v_current_ip
    FROM crm_private.admin_ip_allowlist a ORDER BY a.created_at, a.address;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_remove_ip(p_ip text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_address inet; v_current_ip inet; v_label text;
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
  v_current_ip := (nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip')::inet;
  IF v_address = v_current_ip THEN
    RAISE EXCEPTION 'Use another approved network to remove your current IP';
  END IF;
  LOCK TABLE crm_private.admin_ip_allowlist IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT count(*) FROM crm_private.admin_ip_allowlist) <= 1 THEN
    RAISE EXCEPTION 'At least one approved IP address is required';
  END IF;
  DELETE FROM crm_private.admin_ip_allowlist WHERE address = v_address RETURNING label INTO v_label;
  IF NOT FOUND THEN RAISE EXCEPTION 'IP address is not on the allowlist'; END IF;
  INSERT INTO public.admin_action_logs(admin_user_id, action, before_data, reason)
  VALUES (auth.uid(), 'admin_ip_removed', jsonb_build_object('ip', host(v_address), 'label', v_label), 'CRM network access');
END;
$$;
