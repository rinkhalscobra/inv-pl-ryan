CREATE TABLE public.crm_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  kind text NOT NULL CHECK (kind IN ('affiliate_api', 'google_sheet')),
  api_key_hash text UNIQUE,
  sheet_url text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_sync_error text,
  CONSTRAINT crm_lead_source_configuration CHECK (
    (kind = 'affiliate_api' AND api_key_hash IS NOT NULL AND sheet_url IS NULL)
    OR (kind = 'google_sheet' AND sheet_url IS NOT NULL AND api_key_hash IS NULL)
  )
);

CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.crm_lead_sources(id) ON DELETE SET NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('affiliate_api', 'google_sheet', 'file')),
  source_name text NOT NULL DEFAULT '',
  external_id text,
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  campaign text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'inviting', 'registered', 'existing')),
  registered_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  registration_started_at timestamptz,
  invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_lead_registered_state CHECK (
    (status IN ('new', 'inviting') AND registered_user_id IS NULL)
    OR (status IN ('registered', 'existing') AND registered_user_id IS NOT NULL)
  )
);

CREATE INDEX crm_leads_status_created_idx ON public.crm_leads(status, created_at DESC);
CREATE INDEX crm_leads_source_created_idx ON public.crm_leads(source_id, created_at DESC);

ALTER TABLE public.crm_lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_lead_sources, public.crm_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crm_lead_sources, public.crm_leads TO service_role;
