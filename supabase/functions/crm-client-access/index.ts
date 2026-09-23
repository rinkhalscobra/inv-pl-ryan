import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store, private" },
});
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required" }, 401);
    const { data: actorAuth, error: actorAuthError } = await admin.auth.getUser(token);
    if (actorAuthError || !actorAuth.user) return json({ error: "Your CRM session is invalid or expired" }, 401);
    const actorId = actorAuth.user.id;

    const body = await request.json().catch(() => ({})) as { target_user_id?: unknown };
    if (!uuid(body.target_user_id)) return json({ error: "Select a valid client account" }, 400);
    const targetId = body.target_user_id;
    if (targetId === actorId) return json({ error: "Select an assigned client account" }, 400);

    const [{ data: actor, error: actorError }, { data: staffRole, error: staffError }] = await Promise.all([
      admin.from("users").select("id,is_admin").eq("id", actorId).maybeSingle(),
      admin.from("crm_staff_roles").select("role").eq("user_id", actorId).maybeSingle(),
    ]);
    if (actorError || staffError || !actor) return json({ error: "CRM access could not be verified" }, 403);
    const actorRole = actor.is_admin === true ? "admin" : String(staffRole?.role || "client");
    if (!["admin", "agent", "retention"].includes(actorRole)) return json({ error: "CRM staff access required" }, 403);

    if (actorRole === "admin") {
      const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
      if (!clientIp) return json({ error: "Administrator network access required" }, 403);
      const { data: allowed, error } = await admin.rpc("crm_is_ip_allowlisted", { p_ip: clientIp });
      if (error || allowed !== true) return json({ error: "Administrator network access required" }, 403);
    }

    const [{ data: target, error: targetError }, { data: targetStaff, error: targetStaffError }] = await Promise.all([
      admin.from("users").select("id,email,is_admin").eq("id", targetId).maybeSingle(),
      admin.from("crm_staff_roles").select("role").eq("user_id", targetId).maybeSingle(),
    ]);
    if (targetError || targetStaffError || !target || target.is_admin === true || targetStaff) {
      return json({ error: "The selected account is not a client" }, 403);
    }

    let allowed = actorRole === "admin";
    let assignmentType = actorRole === "admin" ? "administrator" : "";
    if (actorRole === "agent") {
      const { data, error } = await admin.from("crm_client_agent_assignments")
        .select("client_id").eq("client_id", targetId).eq("agent_id", actorId).maybeSingle();
      if (error) return json({ error: "Client assignment could not be verified" }, 500);
      allowed = !!data;
      assignmentType = "agent";
    }
    if (actorRole === "retention") {
      const { data: direct, error: directError } = await admin.from("crm_client_retention_assignments")
        .select("client_id").eq("client_id", targetId).eq("retention_id", actorId).maybeSingle();
      if (directError) return json({ error: "Client assignment could not be verified" }, 500);
      if (direct) {
        allowed = true;
        assignmentType = "direct_retention";
      } else {
        const { data: clientAgent, error: clientAgentError } = await admin.from("crm_client_agent_assignments")
          .select("agent_id").eq("client_id", targetId).maybeSingle();
        if (clientAgentError) return json({ error: "Client assignment could not be verified" }, 500);
        if (clientAgent?.agent_id) {
          const { data: managedAgent, error: managedError } = await admin.from("crm_agent_retention_assignments")
            .select("agent_id").eq("agent_id", clientAgent.agent_id).eq("retention_id", actorId).maybeSingle();
          if (managedError) return json({ error: "Client assignment could not be verified" }, 500);
          allowed = !!managedAgent;
          assignmentType = "retention_agent";
        }
      }
    }
    if (!allowed) return json({ error: "This client is not assigned to your CRM scope" }, 403);

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count, error: rateError } = await admin.from("admin_action_logs")
      .select("id", { count: "exact", head: true })
      .eq("admin_user_id", actorId).eq("action", "crm_client_session_issued").gte("created_at", oneMinuteAgo);
    if (rateError) return json({ error: "Client access audit could not be verified" }, 500);
    if ((count || 0) >= 10) return json({ error: "Too many client sessions were opened. Wait one minute and try again." }, 429);

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: String(target.email),
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) return json({ error: linkError?.message || "Client session could not be created" }, 500);

    const { error: auditError } = await admin.from("admin_action_logs").insert({
      admin_user_id: actorId,
      target_user_id: targetId,
      action: "crm_client_session_issued",
      after_data: { actor_role: actorRole, assignment_type: assignmentType },
      reason: "Authorized CRM staff opened an assigned client dashboard",
    });
    if (auditError) return json({ error: "Client session was not opened because the audit record could not be saved" }, 500);

    return json({ token_hash: tokenHash });
  } catch (error) {
    console.error("CRM client access error", error);
    return json({ error: error instanceof Error ? error.message : "Client access failed" }, 500);
  }
});
