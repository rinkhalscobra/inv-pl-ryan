import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.39.0";
import { normalizeLead } from "../../../src/lib/leadImport.ts";
import {
  classifyInternationalPhone,
  routePhoneToOffice,
} from "../_shared/leadPhoneRouting.ts";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

type AffiliateSource = { id: string; name: string; company_id: string };
type LeadState = {
  affiliate_tracking_id: string;
  external_id: string | null;
  status: "new" | "inviting" | "registered" | "existing";
  disposition_status:
    | "new"
    | "no_answer"
    | "call_back"
    | "low_potential"
    | "no_money"
    | "wrong_number"
    | "ftd";
  created_at: string;
  updated_at: string;
};

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

function affiliateState(row: Pick<LeadState, "status" | "disposition_status">) {
  if (row.disposition_status === "ftd")
    return { status: "converted", reason_code: null };
  if (row.status === "registered")
    return { status: "registered", reason_code: null };
  if (row.status === "existing")
    return { status: "registered", reason_code: "existing_client" };
  if (row.status === "inviting")
    return { status: "processing", reason_code: null };
  if (row.disposition_status === "wrong_number")
    return { status: "invalid", reason_code: "wrong_number" };
  if (row.disposition_status === "no_answer")
    return { status: "contact_attempted", reason_code: null };
  if (row.disposition_status === "call_back")
    return { status: "follow_up", reason_code: null };
  if (row.disposition_status === "low_potential")
    return { status: "not_qualified", reason_code: "low_potential" };
  if (row.disposition_status === "no_money")
    return { status: "not_qualified", reason_code: "no_money" };
  return { status: "received", reason_code: null };
}

function publicLeadState(row: LeadState) {
  const state = affiliateState(row);
  return {
    tracking_id: row.affiliate_tracking_id,
    external_id: row.external_id,
    status: state.status,
    reason_code: state.reason_code,
    account_status: row.status,
    received_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function requestedLimit(url: URL) {
  const parsed = Number(url.searchParams.get("limit") || "100");
  if (!Number.isInteger(parsed)) return 100;
  return Math.min(Math.max(parsed, 1), 100);
}

async function authenticate(
  request: Request,
  admin: SupabaseClient,
): Promise<AffiliateSource | Response> {
  const apiKey = request.headers.get("x-affiliate-key") || "";
  if (!/^aff_live_[0-9a-f]{64}$/.test(apiKey))
    return json({ error: "Invalid affiliate key" }, 401);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(apiKey),
  );
  const keyHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const { data, error } = await admin
    .from("crm_lead_sources")
    .select("id,name,company_id")
    .eq("kind", "affiliate_api")
    .eq("api_key_hash", keyHash)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    return json({ error: "Affiliate key is inactive or unknown" }, 401);
  return data as AffiliateSource;
}

async function currentStatuses(
  url: URL,
  admin: SupabaseClient,
  source: AffiliateSource,
) {
  const trackingId = (url.searchParams.get("tracking_id") || "").trim();
  const externalId = (url.searchParams.get("external_id") || "").trim();
  const updatedAfter = (url.searchParams.get("updated_after") || "").trim();
  if (trackingId && !uuid(trackingId))
    return json({ error: "tracking_id must be a UUID" }, 400);
  if (externalId.length > 120)
    return json({ error: "external_id is too long" }, 400);
  if (updatedAfter && Number.isNaN(Date.parse(updatedAfter)))
    return json({ error: "updated_after must be an ISO-8601 timestamp" }, 400);

  const limit = requestedLimit(url);
  let query = admin
    .from("crm_leads")
    .select(
      "affiliate_tracking_id,external_id,status,disposition_status,created_at,updated_at",
    )
    .eq("source_id", source.id)
    .order("updated_at", { ascending: true })
    .order("affiliate_tracking_id", { ascending: true })
    .limit(limit + 1);
  if (trackingId) query = query.eq("affiliate_tracking_id", trackingId);
  if (externalId) query = query.eq("external_id", externalId);
  if (updatedAfter)
    query = query.gte("updated_at", new Date(updatedAfter).toISOString());

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as LeadState[];
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  return json({
    leads: visible.map(publicLeadState),
    count: visible.length,
    has_more: hasMore,
    server_time: new Date().toISOString(),
  });
}

async function statusEvents(
  url: URL,
  admin: SupabaseClient,
  source: AffiliateSource,
) {
  const afterText = (url.searchParams.get("after") || "0").trim();
  const after = Number(afterText);
  if (!Number.isSafeInteger(after) || after < 0)
    return json({ error: "after must be a non-negative event cursor" }, 400);

  const limit = requestedLimit(url);
  const { data, error } = await admin
    .from("crm_affiliate_lead_events")
    .select(
      "id,tracking_id,external_id,event_type,affiliate_status,reason_code,account_status,occurred_at",
    )
    .eq("source_id", source.id)
    .gt("id", after)
    .order("id", { ascending: true })
    .limit(limit + 1);
  if (error) throw error;

  const rows = data || [];
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  return json({
    events: visible.map((event) => ({
      cursor: event.id,
      type: event.event_type,
      tracking_id: event.tracking_id,
      external_id: event.external_id,
      status: event.affiliate_status,
      reason_code: event.reason_code,
      account_status: event.account_status,
      occurred_at: event.occurred_at,
    })),
    next_cursor: visible.length > 0 ? visible[visible.length - 1].id : after,
    has_more: hasMore,
    server_time: new Date().toISOString(),
  });
}

async function submitLeads(
  request: Request,
  admin: SupabaseClient,
  source: AffiliateSource,
) {
  const [
    { data: offices, error: officeError },
    { data: managers, error: managerError },
  ] = await Promise.all([
    admin
      .from("crm_offices")
      .select("id,name,code")
      .eq("status", "active")
      .eq("company_id", source.company_id),
    admin
      .from("crm_staff_roles")
      .select("user_id,users!inner(office_id,company_id)")
      .eq("role", "desk_manager")
      .eq("users.company_id", source.company_id),
  ]);
  if (officeError || managerError) throw officeError || managerError;

  const officesByCountry = new Map<string, string>();
  for (const office of offices || []) {
    const code = String(office.code || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) officesByCountry.set(code, String(office.id));
  }
  const deskManagerOfficeIds = new Set<string>();
  for (const row of managers || []) {
    const users = Array.isArray(row.users) ? row.users[0] : row.users;
    const officeId = (users as { office_id?: string | null } | null)?.office_id;
    if (officeId) deskManagerOfficeIds.add(String(officeId));
  }

  const raw = await request.text();
  if (raw.length > 500_000) return json({ error: "Request is too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Send a JSON lead or a leads array" }, 400);
  }
  const inputs = Array.isArray((body as { leads?: unknown[] })?.leads)
    ? (body as { leads: unknown[] }).leads
    : [body];
  if (inputs.length === 0 || inputs.length > 100)
    return json({ error: "Send 1 to 100 leads per request" }, 400);

  const leads = new Map<string, Record<string, unknown>>();
  let invalid = 0;
  for (const input of inputs) {
    const lead =
      input && typeof input === "object" && !Array.isArray(input)
        ? normalizeLead(input as Record<string, unknown>)
        : null;
    if (!lead) {
      invalid++;
      continue;
    }
    const { office, ...record } = lead;
    const incomingOffice = office || lead.country;
    const phone = classifyInternationalPhone(lead.phone);
    const route = routePhoneToOffice(
      phone,
      officesByCountry,
      deskManagerOfficeIds,
    );
    leads.set(lead.email, {
      ...record,
      ...phone,
      ...route,
      phone_routed_at: new Date().toISOString(),
      company_id: source.company_id,
      source_metadata: { incoming_office: incomingOffice || null },
      source_id: source.id,
      source_kind: "affiliate_api",
      source_name: source.name,
    });
  }

  let added = 0;
  const insertedIds = new Set<string>();
  if (leads.size > 0) {
    const { data, error } = await admin
      .from("crm_leads")
      .upsert(Array.from(leads.values()), {
        onConflict: "company_id,email",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw error;
    for (const row of data || []) insertedIds.add(String(row.id));
    added = insertedIds.size;
  }

  let results: Array<Record<string, unknown>> = [];
  if (leads.size > 0) {
    const { data, error } = await admin
      .from("crm_leads")
      .select(
        "id,email,affiliate_tracking_id,external_id,status,disposition_status,created_at,updated_at",
      )
      .eq("source_id", source.id)
      .in("email", Array.from(leads.keys()));
    if (error) throw error;
    results = (data || []).map((row) => ({
      outcome: insertedIds.has(String(row.id)) ? "accepted" : "duplicate",
      ...publicLeadState(row as LeadState),
    }));
  }

  return json({
    accepted: added,
    duplicates: inputs.length - invalid - added,
    invalid,
    results,
  });
}

Deno.serve(async (request) => {
  const serviceUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceUrl || !serviceKey)
    return json({ error: "Server configuration is incomplete" }, 500);
  const admin = createClient(serviceUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const source = await authenticate(request, admin);
    if (source instanceof Response) return source;
    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, "").split("/").pop();

    if (request.method === "POST" && route === "affiliate-leads")
      return await submitLeads(request, admin, source);
    if (request.method === "GET" && route === "status")
      return await currentStatuses(url, admin, source);
    if (request.method === "GET" && route === "events")
      return await statusEvents(url, admin, source);
    return json(
      {
        error:
          "Use POST /affiliate-leads, GET /affiliate-leads/status, or GET /affiliate-leads/events",
      },
      405,
    );
  } catch (error) {
    console.error(
      "Affiliate lead API failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json({ error: "Could not process affiliate lead request" }, 500);
  }
});
