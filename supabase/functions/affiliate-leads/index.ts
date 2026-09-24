import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { normalizeLead } from "../../../src/lib/leadImport.ts";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async request => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const apiKey = request.headers.get("x-affiliate-key") || "";
  if (!/^aff_live_[0-9a-f]{64}$/.test(apiKey)) return json({ error: "Invalid affiliate key" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);

  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    const keyHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: offices, error: officeError } = await admin.from("crm_offices").select("id,name,code").eq("status", "active");
    if (officeError) throw officeError;
    const officeMap = new Map<string, string>();
    for (const office of offices || []) {
      officeMap.set(String(office.code).trim().toLowerCase(), String(office.id));
      officeMap.set(String(office.name).trim().toLowerCase(), String(office.id));
    }
    const { data: source, error: sourceError } = await admin.from("crm_lead_sources")
      .select("id,name").eq("kind", "affiliate_api").eq("api_key_hash", keyHash).eq("active", true).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return json({ error: "Affiliate key is inactive or unknown" }, 401);

    const raw = await request.text();
    if (raw.length > 500_000) return json({ error: "Request is too large" }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "Send a JSON lead or a leads array" }, 400); }
    const inputs = Array.isArray((body as { leads?: unknown[] })?.leads)
      ? (body as { leads: unknown[] }).leads : [body];
    if (inputs.length === 0 || inputs.length > 100) return json({ error: "Send 1 to 100 leads per request" }, 400);
    const leads = new Map<string, Record<string, unknown>>();
    let invalid = 0;
    for (const input of inputs) {
      const lead = input && typeof input === "object" && !Array.isArray(input)
        ? normalizeLead(input as Record<string, unknown>) : null;
      if (lead) {
        const { office, ...record } = lead;
        const incomingOffice = office || lead.country;
        leads.set(lead.email, { ...record, office_id: officeMap.get(incomingOffice.trim().toLowerCase()) || null,
          source_metadata: { incoming_office: incomingOffice || null }, source_id: source.id, source_kind: "affiliate_api", source_name: source.name });
      }
      else invalid++;
    }
    let added = 0;
    if (leads.size > 0) {
      const { data, error } = await admin.from("crm_leads")
        .upsert(Array.from(leads.values()), { onConflict: "email", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      added = data?.length || 0;
    }
    return json({ accepted: added, duplicates: inputs.length - invalid - added, invalid });
  } catch (error) {
    console.error("Affiliate lead intake failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Could not save leads" }, 500);
  }
});
