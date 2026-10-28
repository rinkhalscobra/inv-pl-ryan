# Venice AI integration

The Venice credential is server-side only. Browser code calls the authenticated
`venice-chat` Supabase Edge Function through `createVeniceChatCompletion` in
`src/lib/venice.ts`; the Edge Function calls Venice with the OpenAI SDK.

## Local connection test

Store `VENICE_API_KEY`, `VENICE_BASE_URL`, and `VENICE_MODEL` in the ignored
`.env` file, then run:

```powershell
npm run test:venice
```

## Deploy the Edge Function

Upload the server-side environment variables as Supabase secrets, then deploy:

```powershell
supabase secrets set --env-file .env
supabase functions deploy venice-chat
```

Do not rename the key to start with `VITE_`. Vite exposes all `VITE_*` variables
to browser bundles.
