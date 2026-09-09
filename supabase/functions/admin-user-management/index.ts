import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration is incomplete" }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const accessToken = authorization.slice("Bearer ".length);
    const { data: actorResult, error: actorError } = await admin.auth.getUser(accessToken);
    if (actorError || !actorResult.user) return json({ error: "Invalid or expired administrator session" }, 401);

    const actorId = actorResult.user.id;
    const { data: actorProfile, error: actorProfileError } = await admin
      .from("users")
      .select("id, is_admin")
      .eq("id", actorId)
      .single();
    if (actorProfileError || actorProfile?.is_admin !== true) return json({ error: "Administrator access required" }, 403);

    const body = await request.json().catch(() => ({})) as {
      action?: string;
      target_user_id?: string;
      password?: string;
      confirmation_email?: string;
      reason?: string;
    };
    const targetUserId = body.target_user_id?.trim();
    const reason = body.reason?.trim();
    if (!targetUserId) return json({ error: "Target user is required" }, 400);
    if (!reason) return json({ error: "An audit reason is required" }, 400);

    const { data: targetProfile, error: targetError } = await admin
      .from("users")
      .select("*")
      .eq("id", targetUserId)
      .single();
    if (targetError || !targetProfile) return json({ error: "Target user was not found" }, 404);

    if (body.action === "set_password") {
      const password = body.password || "";
      if (password.length < 8) return json({ error: "Password must contain at least 8 characters" }, 400);

      const { error } = await admin.auth.admin.updateUserById(targetUserId, { password });
      if (error) return json({ error: error.message }, 400);

      const { error: auditError } = await admin.from("admin_action_logs").insert({
        admin_user_id: actorId,
        target_user_id: targetUserId,
        action: "auth_password_reset",
        before_data: { email: targetProfile.email, user_id: targetUserId },
        after_data: { password_changed: true },
        reason,
      });
      if (auditError) console.error("Password reset audit error", auditError);
      return json({ success: true, message: "Password changed" });
    }

    if (body.action === "delete_user") {
      if (targetUserId === actorId) return json({ error: "You cannot delete your own administrator account" }, 400);
      if (body.confirmation_email?.trim().toLowerCase() !== String(targetProfile.email).toLowerCase()) {
        return json({ error: "Enter the customer's exact email address to confirm deletion" }, 400);
      }

      // Keep shared market events intact so deleting their original creator cannot
      // cascade-delete bets belonging to other customers.
      const { data: detachedEvents, error: eventDetachError } = await admin
        .from("events")
        .update({ user_id: null })
        .eq("user_id", targetUserId)
        .select("id");
      if (eventDetachError) return json({ error: `Could not prepare shared records for deletion: ${eventDetachError.message}` }, 500);

      const { error } = await admin.auth.admin.deleteUser(targetUserId, false);
      if (error) {
        const detachedEventIds = (detachedEvents || []).map((event: { id: string }) => event.id);
        if (detachedEventIds.length > 0) {
          await admin.from("events").update({ user_id: targetUserId }).in("id", detachedEventIds);
        }
        return json({ error: error.message }, 400);
      }

      // Older installations created public.users before its auth.users foreign key,
      // so explicitly remove the public profile as well. Its cascading foreign keys
      // clean balances, orders, positions, robot data, support records and the rest.
      const { error: profileDeleteError } = await admin.from("users").delete().eq("id", targetUserId);
      if (profileDeleteError) {
        console.error("Public profile cleanup error", profileDeleteError);
        return json({ error: `Auth user was deleted, but database cleanup failed: ${profileDeleteError.message}` }, 500);
      }

      const { error: auditError } = await admin.from("admin_action_logs").insert({
        admin_user_id: actorId,
        target_user_id: null,
        action: "auth_user_deleted",
        before_data: targetProfile,
        after_data: { deleted_user_id: targetUserId, database_cleanup: "cascade" },
        reason,
      });
      if (auditError) console.error("User deletion audit error", auditError);
      return json({ success: true, message: "User and related account data deleted" });
    }

    return json({ error: "Unsupported administrator action" }, 400);
  } catch (error) {
    console.error("Admin user management error", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
