-- The former catalog cooldown was 30 minutes; let the new four-minute job start immediately.
UPDATE public.cfd_quote_refresh_state
SET next_refresh_at = now()
WHERE cache_key = 'catalog' AND lease_until <= now();
