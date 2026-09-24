import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.39.0";
import { normalizeLead, parseCsv, rowsToLeads, type LeadInput } from "../../../src/lib/leadImport.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const message = (error: unknown) => error instanceof Error ? error.message : "Lead operation failed";
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function keyHash(key: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function newAffiliateKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `aff_live_${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function sheetCsvUrl(input: string) {
  if (input.length > 2048) throw new Error("The Google Sheet URL is too long");
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Enter a valid Google Sheet URL"); }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || url.username || url.password || url.port) {
    throw new Error("Use an HTTPS Google Sheets URL from docs.google.com");
  }
  const published = /^\/spreadsheets\/d\/e\/[A-Za-z0-9_-]+\/pub$/.test(url.pathname);
  const sheet = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/.*)?$/);
  if (published) {
    url.searchParams.set("output", "csv");
  } else if (sheet) {
    const gid = url.searchParams.get("gid") || new URLSearchParams(url.hash.slice(1)).get("gid");
    url.pathname = `/spreadsheets/d/${sheet[1]}/export`;
    url.search = "?format=csv";
    if (gid && /^\d+$/.test(gid)) url.searchParams.set("gid", gid);
    url.hash = "";
  } else throw new Error("Use a Google Sheets document or published CSV link");
  return url.toString();
}

async function insertLeads(
  admin: SupabaseClient,
  inputs: unknown[],
  source: { id: string | null; kind: "affiliate_api" | "google_sheet" | "file"; name: string },
) {
  const leads = new Map<string, LeadInput>();
  let invalid = 0;
  for (const input of inputs) {
    const lead = input && typeof input === "object" && !Array.isArray(input)
      ? normalizeLead(input as Record<string, unknown>) : null;
    if (lead) leads.set(lead.email, lead);
    else invalid++;
  }
  let added = 0;
  for (const batch of Array.from(leads.values()).reduce<LeadInput[][]>((all, lead, index) => {
    if (index % 200 === 0) all.push([]);
    all[all.length - 1].push(lead);
    return all;
  }, [])) {
    const { data, error } = await admin.from("crm_leads").upsert(batch.map(lead => ({
      ...lead, source_id: source.id, source_kind: source.kind, source_name: source.name,
    })), { onConflict: "email", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`Could not save leads: ${error.message}`);
    added += data?.length || 0;
  }
  return { added, duplicates: inputs.length - invalid - added, invalid };
}

async function syncSheet(admin: SupabaseClient, source: { id: string; name: string; sheet_url: string }) {
  try {
    const response = await fetch(sheetCsvUrl(source.sheet_url), {
      headers: { Accept: "text/csv,text/plain" }, signal: AbortSignal.timeout(12000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length") || 0) > 3_000_000) throw new Error("The sheet is larger than 3 MB");
    const csv = await response.text();
    if (csv.length > 3_000_000 || /^\s*</.test(csv)) throw new Error("Publish or share the sheet as CSV so the server can read it");
    const rows = parseCsv(csv);
    if (rows.length > 5001) throw new Error("The sheet exceeds 5,000 lead rows");
    const parsed = rowsToLeads(rows);
    const result = await insertLeads(admin, parsed.leads, { id: source.id, kind: "google_sheet", name: source.name });
    result.invalid += parsed.invalid;
    const { error } = await admin.from("crm_lead_sources").update({ last_synced_at: new Date().toISOString(), last_sync_error: null }).eq("id", source.id);
    if (error) throw error;
    return result;
  } catch (error) {
    const detail = message(error).slice(0, 500);
    await admin.from("crm_lead_sources").update({ last_sync_error: detail }).eq("id", source.id);
    throw new Error(detail);
  }
}

async function registerLead(admin: SupabaseClient, leadId: string, actorId: string, ownerRole: string | null, ownerId: string | null) {
  if ((ownerRole === null) !== (ownerId === null) || (ownerRole !== null && ownerRole !== "agent") || (ownerId !== null && !uuid(ownerId))) {
    throw new Error("Select a valid sales agent");
  }
  const startedAt = new Date().toISOString();
  let step = "claim lead";
  let { data: lead, error: claimError } = await admin.from("crm_leads")
    .update({ status: "inviting", registration_started_at: startedAt, last_registration_attempt_at: startedAt, registration_error: null })
    .eq("id", leadId).eq("status", "new").select("*").maybeSingle();
  if (claimError) throw claimError;
  if (!lead) {
    const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
    const result = await admin.from("crm_leads")
      .update({ status: "inviting", registration_started_at: startedAt })
      .eq("id", leadId).eq("status", "inviting").lt("registration_started_at", staleBefore).select("*").maybeSingle();
    lead = result.data;
    claimError = result.error;
    if (claimError) throw claimError;
  }
  if (!lead) throw new Error("This lead is already registered or is being processed. Refresh the inbox.");

  let createdUserId: string | null = null;
  try {
    step = "duplicate account check";
    const { data: existing, error: existingError } = await admin.from("users").select("id").eq("email", lead.email).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      step = "existing client onboarding";
      const { data: onboarding, error: onboardingError } = await admin.rpc("crm_ensure_client_onboarding", { p_user_id: existing.id });
      if (onboardingError || onboarding?.success !== true) throw new Error(onboardingError?.message || onboarding?.error || "Existing client setup is incomplete");
      const { data: authUser } = await admin.auth.admin.getUserById(existing.id);
      const wasInvitedFromThisLead = authUser.user?.user_metadata?.crm_lead_id === leadId;
      const outcome = wasInvitedFromThisLead ? "registered" : "existing";
      const { error } = await admin.from("crm_leads").update({
        status: outcome, registered_user_id: existing.id, registration_started_at: null,
        invited_at: wasInvitedFromThisLead ? new Date().toISOString() : null, registration_error: null,
      }).eq("id", leadId);
      if (error) throw error;
      return { outcome, user_id: existing.id };
    }

    step = "authentication account";
    const initialPassword = Deno.env.get("CRM_DEFAULT_CLIENT_PASSWORD") || "12345678";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: lead.email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        first_name: lead.first_name,
        last_name: lead.last_name,
        phone_number: lead.phone,
        country: lead.country,
        crm_lead_id: leadId,
        onboarding_source: "lead_inbox",
      },
    });
    if (createError || !created.user) throw new Error(createError?.message || "Could not create the authentication account");
    createdUserId = created.user.id;

    step = "client profile, trade account and document folder";
    const { data: onboarding, error: onboardingError } = await admin.rpc("crm_ensure_client_onboarding", { p_user_id: createdUserId });
    if (onboardingError || onboarding?.success !== true) {
      throw new Error(onboardingError?.message || onboarding?.error || "Client onboarding did not complete");
    }

    step = "CRM client role and ownership";
    const { error: finalizeError } = await admin.rpc("crm_finalize_created_user", {
      p_user_id: createdUserId, p_actor_id: actorId, p_role: "client", p_owner_role: ownerRole, p_owner_id: ownerId,
    });
    if (finalizeError) {
      throw new Error(finalizeError.message);
    }
    step = "lead linkage";
    const { error: markError } = await admin.from("crm_leads").update({
      status: "registered", registered_user_id: createdUserId,
      registration_started_at: null, invited_at: new Date().toISOString(), registration_error: null,
    }).eq("id", leadId);
    if (markError) throw new Error(`Account created, but lead status needs review: ${markError.message}`);
    await admin.from("admin_action_logs").insert({
      admin_user_id: actorId, target_user_id: createdUserId,
      action: "crm_lead_registered", after_data: { lead_id: leadId, source: lead.source_name, owner_role: ownerRole, owner_id: ownerId },
      reason: "Administrator registered imported lead",
    });
    return { outcome: "registered", user_id: createdUserId };
  } catch (error) {
    const detail = `${step}: ${message(error)}`.slice(0, 1000);
    await admin.from("client_onboarding_events").insert({
      auth_user_id: createdUserId || leadId,
      email: lead.email,
      source: "lead_inbox",
      status: "failed",
      failed_step: step,
      message: detail,
    });
    if (createdUserId) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(createdUserId, false);
      if (rollbackError) {
        await admin.from("crm_leads").update({ registration_error: `${detail}. Cleanup requires review for user ${createdUserId}` }).eq("id", leadId);
        throw new Error(`${detail}. Account cleanup requires administrator review.`);
      }
      await admin.from("users").delete().eq("id", createdUserId);
    }
    await admin.from("crm_leads").update({
      status: "new", registration_started_at: null, registration_error: detail,
    }).eq("id", leadId).eq("status", "inviting");
    throw new Error(detail);
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) return json({ error: "Request is too large" }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw) as Record<string, unknown>; }
    catch { return json({ error: "Send a valid JSON request" }, 400); }
    const action = String(body.action || "");
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Server configuration is incomplete" }, 500);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const cronToken = request.headers.get("x-lead-sync-token");
    if (action === "sync_all_sheets" && cronToken && cronToken === Deno.env.get("LEADS_SYNC_TOKEN")) {
      const { data: sources, error } = await admin.from("crm_lead_sources")
        .select("id,name,sheet_url").eq("kind", "google_sheet").eq("active", true).limit(10);
      if (error) throw error;
      let index = 0;
      const results: unknown[] = [];
      await Promise.all(Array.from({ length: Math.min(3, sources?.length || 0) }, async () => {
        while (index < (sources?.length || 0)) {
          const source = sources![index++];
          try { results.push({ id: source.id, ...(await syncSheet(admin, source)) }); }
          catch (cause) { results.push({ id: source.id, error: message(cause) }); }
        }
      }));
      return json({ sources: results });
    }

    const clientIp = request.headers.get("cf-connecting-ip") || "";
    if (!clientIp) return json({ error: "Administrator network access required" }, 403);
    const { data: ipAllowed, error: ipError } = await admin.rpc("crm_is_ip_allowlisted", { p_ip: clientIp });
    if (ipError || ipAllowed !== true) return json({ error: "Administrator network access required" }, 403);
    const token = request.headers.get("Authorization")?.replace(/^Bearer /i, "");
    if (!token) return json({ error: "Authentication required" }, 401);
    const { data: actor, error: authError } = await admin.auth.getUser(token);
    if (authError || !actor.user) return json({ error: "Invalid administrator session" }, 401);
    const { data: profile, error: profileError } = await admin.from("users").select("is_admin").eq("id", actor.user.id).single();
    if (profileError || profile?.is_admin !== true) return json({ error: "Administrator access required" }, 403);
    const actorId = actor.user.id;

    if (action === "dashboard") {
      const page = Math.max(0, Math.min(1000, Number(body.page) || 0));
      const status = ["new", "inviting", "registered", "existing"].includes(String(body.status)) ? String(body.status) : null;
      const search = String(body.search || "").trim().slice(0, 100);
      let query = admin.from("crm_leads").select("id,email,first_name,last_name,phone,country,campaign,notes,source_kind,source_name,status,registered_user_id,registration_error,last_registration_attempt_at,created_at,invited_at", { count: "exact" })
        .order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
      if (status) query = query.eq("status", status);
      if (search) query = query.ilike("email", `%${search}%`);
      const [leadResult, sourceResult, ownerResult] = await Promise.all([
        query,
        admin.from("crm_lead_sources").select("id,name,kind,sheet_url,active,last_synced_at,last_sync_error,created_at").order("created_at", { ascending: false }).limit(100),
        admin.from("crm_staff_roles").select("user_id,role,users!inner(email,first_name,last_name)").eq("role", "agent"),
      ]);
      if (leadResult.error || sourceResult.error || ownerResult.error) throw new Error(leadResult.error?.message || sourceResult.error?.message || ownerResult.error?.message);
      return json({ leads: leadResult.data || [], total: leadResult.count || 0, sources: sourceResult.data || [], owners: ownerResult.data || [] });
    }

    if (action === "create_affiliate") {
      const name = String(body.name || "").trim().slice(0, 100);
      if (!name) return json({ error: "Enter an affiliate name" }, 400);
      const apiKey = newAffiliateKey();
      const { data, error } = await admin.from("crm_lead_sources").insert({ name, kind: "affiliate_api", api_key_hash: await keyHash(apiKey), created_by: actorId }).select("id,name").single();
      if (error) throw error;
      await admin.from("admin_action_logs").insert({ admin_user_id: actorId, action: "crm_affiliate_created", after_data: { source_id: data.id, name }, reason: "Created affiliate lead connection" });
      return json({ source: data, api_key: apiKey });
    }

    if (action === "create_sheet") {
      const name = String(body.name || "").trim().slice(0, 100);
      if (!name) return json({ error: "Enter a sheet name" }, 400);
      const sheetUrl = sheetCsvUrl(String(body.url || "").trim());
      const { data, error } = await admin.from("crm_lead_sources").insert({ name, kind: "google_sheet", sheet_url: sheetUrl, created_by: actorId }).select("id,name,sheet_url").single();
      if (error) throw error;
      return json({ source: data });
    }

    if (["sync_sheet", "set_source_active", "rotate_key"].includes(action)) {
      if (!uuid(body.source_id)) return json({ error: "Select a valid source" }, 400);
      const { data: source, error } = await admin.from("crm_lead_sources").select("*").eq("id", body.source_id).single();
      if (error || !source) return json({ error: "Source not found" }, 404);
      if (action === "sync_sheet") {
        if (source.kind !== "google_sheet" || !source.active) return json({ error: "Activate a Google Sheet to sync it" }, 400);
        return json({ result: await syncSheet(admin, source) });
      }
      if (action === "set_source_active") {
        const active = body.active === true;
        const { error: updateError } = await admin.from("crm_lead_sources").update({ active }).eq("id", source.id);
        if (updateError) throw updateError;
        await admin.from("admin_action_logs").insert({ admin_user_id: actorId, action: "crm_lead_source_status", after_data: { source_id: source.id, active }, reason: "Changed lead source access" });
        return json({ active });
      }
      if (source.kind !== "affiliate_api") return json({ error: "Only affiliate keys can be rotated" }, 400);
      const apiKey = newAffiliateKey();
      const { error: updateError } = await admin.from("crm_lead_sources").update({ api_key_hash: await keyHash(apiKey) }).eq("id", source.id);
      if (updateError) throw updateError;
      await admin.from("admin_action_logs").insert({ admin_user_id: actorId, action: "crm_affiliate_key_rotated", after_data: { source_id: source.id }, reason: "Rotated affiliate lead key" });
      return json({ api_key: apiKey });
    }

    if (action === "import_rows") {
      if (!Array.isArray(body.rows) || body.rows.length > 200) return json({ error: "Upload up to 200 rows per batch" }, 400);
      const name = String(body.filename || "Imported file").trim().slice(0, 100);
      return json({ result: await insertLeads(admin, body.rows, { id: null, kind: "file", name }) });
    }

    if (action === "register_lead") {
      if (!uuid(body.lead_id)) return json({ error: "Select a valid lead" }, 400);
      const ownerRole = body.owner_role ? String(body.owner_role) : null;
      const ownerId = body.owner_id ? String(body.owner_id) : null;
      return json(await registerLead(admin, String(body.lead_id), actorId, ownerRole, ownerId));
    }

    return json({ error: "Unsupported lead action" }, 400);
  } catch (error) {
    console.error("Admin leads error", message(error));
    return json({ error: message(error) }, 500);
  }
});
