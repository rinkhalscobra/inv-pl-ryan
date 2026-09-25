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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration is incomplete" }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const clientIp = request.headers.get("cf-connecting-ip") || "";
    if (!clientIp) return json({ error: "Administrator network access required" }, 403);
    const { data: ipAllowed, error: ipError } = await admin.rpc("crm_is_ip_allowlisted", { p_ip: clientIp });
    if (ipError || ipAllowed !== true) return json({ error: "Administrator network access required" }, 403);

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
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
      email?: string;
      first_name?: string;
      last_name?: string;
      country?: string;
      role?: string;
      owner_role?: string | null;
      owner_id?: string | null;
      office_id?: string | null;
      confirmation_code?: string;
      password?: string;
      confirmation_email?: string;
      confirmation_company_name?: string;
      reason?: string;
      company_id?: string | null;
    };
    const requestedCompanyId = body.company_id || null;
    const { data: actorContext, error: contextError } = await admin.rpc("crm_service_actor_context", {
      p_actor_id: actorId,
      p_ip: clientIp,
      p_requested_company_id: requestedCompanyId,
    });
    const companyId = String(actorContext?.company_id || "");
    if (contextError || !companyId) return json({ error: contextError?.message || "CRM company access could not be resolved" }, 403);

    if (body.action === "delete_company") {
      if (actorContext?.access_scope !== "platform") return json({ error: "Platform network required to delete a company" }, 403);
      const { data: company, error: companyError } = await admin.from("crm_companies")
        .select("id,name,code,is_default_registration").eq("id", companyId).maybeSingle();
      if (companyError || !company) return json({ error: "Company not found" }, 404);
      if (company.is_default_registration === true) return json({ error: "Primary Company cannot be deleted" }, 400);
      if ((body.confirmation_company_name || "").trim() !== String(company.name)) {
        return json({ error: `Enter ${company.name} exactly to confirm company deletion` }, 400);
      }

      const companyUsers: Array<{ id: string; email: string; is_admin: boolean }> = [];
      for (let from = 0; ; from += 500) {
        const { data: page, error: usersError } = await admin.from("users")
          .select("id,email,is_admin").eq("company_id", companyId).order("id").range(from, from + 499);
        if (usersError) return json({ error: `Company accounts could not be verified: ${usersError.message}` }, 500);
        companyUsers.push(...(page || []));
        if (!page || page.length < 500) break;
      }
      if (companyUsers.some(user => user.id === actorId || user.is_admin === true)) {
        return json({ error: "Move platform administrators out of this company before deletion" }, 400);
      }

      for (let index = 0; index < companyUsers.length; index += 100) {
        const ids = companyUsers.slice(index, index + 100).map(user => user.id);
        const { error: eventError } = await admin.from("events").update({ user_id: null }).in("user_id", ids);
        if (eventError) return json({ error: `Shared records could not be prepared for deletion: ${eventError.message}` }, 500);
      }

      for (const user of companyUsers) {
        const { data: authAccount, error: lookupError } = await admin.auth.admin.getUserById(user.id);
        if (lookupError && !/not found/i.test(lookupError.message)) {
          return json({ error: `Deletion stopped while checking ${user.email}. Retry after reviewing this account.` }, 500);
        }
        if (authAccount?.user) {
          const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
          if (deleteError) return json({ error: `Deletion stopped at ${user.email}: ${deleteError.message}` }, 500);
        }
      }

      const { data: deletion, error: cleanupError } = await admin.rpc("crm_service_delete_company_data", {
        p_actor_id: actorId,
        p_company_id: companyId,
      });
      if (cleanupError) return json({ error: `Authentication accounts were processed, but company cleanup failed: ${cleanupError.message}` }, 500);
      return json({ success: true, deletion, auth_users_deleted: companyUsers.length, message: `${company.name} was permanently deleted` });
    }

    if (body.action === "create_user") {
      const email = body.email?.trim().toLowerCase() || "";
      const firstName = body.first_name?.trim() || "";
      const lastName = body.last_name?.trim() || "";
      const country = body.country?.trim() || "";
      const password = body.password || "";
      const role = body.role || "client";
      const ownerRole = body.owner_role || null;
      const ownerId = body.owner_id || null;
      const officeId = body.office_id || null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return json({ error: "Enter a valid email address" }, 400);
      }
      if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
        return json({ error: "Enter a first and last name (up to 100 characters each)" }, 400);
      }
      if (officeId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(officeId)) {
        return json({ error: "Select a valid Office" }, 400);
      }
      if (country.length > 100) return json({ error: "Country is too long" }, 400);
      if (password.length < 8 || password.length > 128) {
        return json({ error: "Password must contain 8 to 128 characters" }, 400);
      }
      if (!["client", "workflow_manager", "desk_manager", "agent", "retention_manager", "retention", "admin"].includes(role)) {
        return json({ error: "Select a valid account role" }, 400);
      }
      const expectedOwnerRole: Record<string, string | null> = {
        client: ownerRole === "retention" ? "retention" : "agent",
        workflow_manager: null,
        desk_manager: "workflow_manager",
        agent: "desk_manager",
        retention_manager: null,
        retention: "retention_manager",
        admin: null,
      };
      if ((ownerRole === null) !== (ownerId === null) ||
        (ownerRole !== null && !["workflow_manager", "desk_manager", "agent", "retention_manager", "retention"].includes(ownerRole)) ||
        (ownerId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) ||
        (ownerRole !== null && expectedOwnerRole[role] !== ownerRole) ||
        (expectedOwnerRole[role] === null && ownerRole !== null)) {
        return json({ error: "Select a valid manager or client owner" }, 400);
      }

      const [{ data: company, error: companyError }, { data: office }, { data: owner }] = await Promise.all([
        admin.from("crm_companies").select("id,registration_key").eq("id", companyId).eq("status", "active").maybeSingle(),
        officeId ? admin.from("crm_offices").select("id").eq("id", officeId).eq("company_id", companyId).maybeSingle() : Promise.resolve({ data: null }),
        ownerId ? admin.from("users").select("id").eq("id", ownerId).eq("company_id", companyId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (companyError || !company) return json({ error: "Selected company is unavailable" }, 400);
      if (officeId && !office) return json({ error: "The selected Office belongs to another company" }, 400);
      if (ownerId && !owner) return json({ error: "The selected owner belongs to another company" }, 400);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName, country, onboarding_source: "crm_create_user", crm_company_key: company.registration_key },
      });
      if (createError || !created.user) {
        return json({ error: createError?.message || "Account creation failed" }, 400);
      }

      const newUserId = created.user.id;
      const { data: onboarding, error: onboardingError } = await admin.rpc("crm_ensure_client_onboarding", {
        p_user_id: newUserId,
      });
      if (onboardingError || onboarding?.success !== true) {
        console.error("Client onboarding failed", { user_id: newUserId, error: onboardingError?.message || onboarding?.error });
        const { error: rollbackError } = await admin.auth.admin.deleteUser(newUserId, false);
        if (rollbackError) return json({ error: `Client onboarding failed and cleanup needs administrator attention. User ID: ${newUserId}` }, 500);
        await admin.from("users").delete().eq("id", newUserId);
        return json({ error: `Account was not created: ${onboardingError?.message || onboarding?.error || "Client onboarding did not complete"}` }, 400);
      }
      const { error: companyAssignmentError } = await admin.rpc("crm_service_set_user_company", {
        p_user_id: newUserId,
        p_company_id: companyId,
      });
      if (companyAssignmentError) {
        await admin.auth.admin.deleteUser(newUserId, false);
        await admin.from("users").delete().eq("id", newUserId);
        return json({ error: `Account was not created: ${companyAssignmentError.message}` }, 400);
      }
      const { error: officeError } = await admin.rpc("crm_service_set_user_office", {
        p_user_id: newUserId,
        p_office_id: officeId,
      });
      if (officeError) {
        await admin.auth.admin.deleteUser(newUserId, false);
        await admin.from("users").delete().eq("id", newUserId);
        return json({ error: `Account was not created: ${officeError.message}` }, 400);
      }
      const { error: finalizeError } = await admin.rpc("crm_finalize_created_user", {
        p_user_id: newUserId,
        p_actor_id: actorId,
        p_role: role,
        p_owner_role: ownerRole,
        p_owner_id: ownerId,
      });
      if (finalizeError) {
        console.error("Account setup failed", { user_id: newUserId, error: finalizeError });
        const { error: rollbackError } = await admin.auth.admin.deleteUser(newUserId, false);
        if (rollbackError) {
          console.error("Account cleanup failed", { user_id: newUserId, error: rollbackError });
          return json({ error: `Account setup failed and cleanup needs administrator attention. User ID: ${newUserId}` }, 500);
        }
        const { error: profileCleanupError } = await admin.from("users").delete().eq("id", newUserId);
        if (profileCleanupError) {
          console.error("Profile cleanup failed", { user_id: newUserId, error: profileCleanupError });
          return json({ error: `Account setup failed and profile cleanup needs administrator attention. User ID: ${newUserId}` }, 500);
        }
        return json({ error: `Account was not created: ${finalizeError.message}` }, 400);
      }
      return json({ success: true, user_id: newUserId, message: "Account created" });
    }

    if (body.action === "delete_office") {
      const officeId = body.office_id?.trim() || "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(officeId)) {
        return json({ error: "Select a valid Office" }, 400);
      }
      const { data: office, error: officeError } = await admin.from("crm_offices").select("id,name,code").eq("id", officeId).eq("company_id", companyId).maybeSingle();
      if (officeError || !office) return json({ error: "Office not found" }, 404);
      if ((body.confirmation_code || "").trim().toUpperCase() !== String(office.code).toUpperCase()) {
        return json({ error: `Enter ${office.code} to confirm Office deletion` }, 400);
      }
      const { data: officeUsers, error: usersError } = await admin.from("users").select("id,email,is_admin").eq("office_id", officeId).eq("company_id", companyId);
      if (usersError) return json({ error: "Office users could not be verified" }, 500);
      if ((officeUsers || []).some(user => user.id === actorId || user.is_admin === true)) {
        return json({ error: "Move global Administrators out of this Office before deleting it" }, 400);
      }
      for (const user of officeUsers || []) {
        const { data: authAccount, error: lookupError } = await admin.auth.admin.getUserById(user.id);
        if (lookupError && !/not found/i.test(lookupError.message)) {
          return json({ error: `Deletion stopped while checking ${user.email}. Retry after reviewing this account.` }, 500);
        }
        if (authAccount?.user) {
          const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
          if (deleteError) return json({ error: `Deletion stopped at ${user.email}: ${deleteError.message}` }, 500);
        }
      }
      const { data: deleted, error: deleteDataError } = await admin.rpc("crm_service_delete_office_data", {
        p_actor_id: actorId,
        p_office_id: officeId,
      });
      if (deleteDataError) return json({ error: `Authentication accounts were processed, but Office cleanup failed: ${deleteDataError.message}` }, 500);
      return json({ success: true, deletion: deleted, auth_users_deleted: officeUsers?.length || 0, message: `${office.name} and all of its users and leads were deleted` });
    }

    const targetUserId = body.target_user_id?.trim();
    const reason = body.reason?.trim();
    if (!targetUserId) return json({ error: "Target user is required" }, 400);
    if (!reason) return json({ error: "An audit reason is required" }, 400);

    const { data: targetProfile, error: targetError } = await admin
      .from("users")
      .select("*")
      .eq("id", targetUserId)
      .eq("company_id", companyId)
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
