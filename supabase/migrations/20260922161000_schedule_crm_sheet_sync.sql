-- Import connected Google Sheets every ten minutes. The token is stored in
-- Vault and only authorizes the sync_all_sheets action in the Edge Function.
SELECT cron.schedule('sync-crm-google-sheet-leads', '*/10 * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cfd_sync_url')
      || '/functions/v1/admin-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lead-sync-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lead_sync_token')
    ),
    body := '{"action":"sync_all_sheets"}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);
