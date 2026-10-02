import type { SupabaseClient } from "npm:@supabase/supabase-js@2.39.0";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Lead registration failed";

type AutomaticRegistrationResult = {
  registered: number;
  existing: number;
  failed: number;
  skipped: number;
};

async function registerRoutedLead(
  admin: SupabaseClient,
  leadId: string,
  actorId: string,
  companyId: string,
) {
  const startedAt = new Date().toISOString();
  let step = "claim lead";
  const { data: lead, error: claimError } = await admin
    .from("crm_leads")
    .update({
      status: "inviting",
      registration_started_at: startedAt,
      last_registration_attempt_at: startedAt,
      registration_error: null,
    })
    .eq("id", leadId)
    .eq("company_id", companyId)
    .eq("status", "new")
    .eq("phone_routing_status", "routed")
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!lead) {
    return { outcome: "skipped" as const, user_id: null };
  }

  let createdUserId: string | null = null;
  try {
    step = "duplicate account check";
    const { data: existing, error: existingError } = await admin
      .from("users")
      .select("id")
      .eq("email", lead.email)
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      step = "existing client onboarding";
      const { data: onboarding, error: onboardingError } = await admin.rpc(
        "crm_ensure_client_onboarding",
        { p_user_id: existing.id },
      );
      if (onboardingError || onboarding?.success !== true) {
        throw new Error(
          onboardingError?.message ||
            onboarding?.error ||
            "Existing client setup is incomplete",
        );
      }
      const { error: officeSetError } = await admin.rpc(
        "crm_service_set_user_office",
        { p_user_id: existing.id, p_office_id: lead.office_id },
      );
      if (officeSetError) throw new Error(officeSetError.message);
      const { data: authUser } = await admin.auth.admin.getUserById(existing.id);
      const wasCreatedFromThisLead =
        authUser.user?.user_metadata?.crm_lead_id === leadId;
      const outcome = wasCreatedFromThisLead ? "registered" : "existing";
      const { error } = await admin
        .from("crm_leads")
        .update({
          status: outcome,
          registered_user_id: existing.id,
          registration_started_at: null,
          invited_at: wasCreatedFromThisLead ? new Date().toISOString() : null,
          registration_error: null,
        })
        .eq("id", leadId);
      if (error) throw error;
      return { outcome, user_id: existing.id };
    }

    step = "authentication account";
    const initialPassword =
      Deno.env.get("CRM_DEFAULT_CLIENT_PASSWORD") || "12345678";
    const { data: company, error: companyError } = await admin
      .from("crm_companies")
      .select("registration_key")
      .eq("id", companyId)
      .single();
    if (companyError || !company)
      throw new Error("Lead company is unavailable");
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: lead.email,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          first_name: lead.first_name,
          last_name: lead.last_name,
          phone_number: lead.phone,
          country: lead.country,
          crm_lead_id: leadId,
          onboarding_source: "automatic_lead_registration",
          crm_company_key: company.registration_key,
        },
      });
    if (createError || !created.user) {
      throw new Error(
        createError?.message || "Could not create the authentication account",
      );
    }
    createdUserId = created.user.id;

    step = "client profile, trade account and document folder";
    const { data: onboarding, error: onboardingError } = await admin.rpc(
      "crm_ensure_client_onboarding",
      { p_user_id: createdUserId },
    );
    if (onboardingError || onboarding?.success !== true) {
      throw new Error(
        onboardingError?.message ||
          onboarding?.error ||
          "Client onboarding did not complete",
      );
    }
    const { error: companyAssignmentError } = await admin.rpc(
      "crm_service_set_user_company",
      { p_user_id: createdUserId, p_company_id: companyId },
    );
    if (companyAssignmentError)
      throw new Error(companyAssignmentError.message);
    const { error: officeSetError } = await admin.rpc(
      "crm_service_set_user_office",
      { p_user_id: createdUserId, p_office_id: lead.office_id },
    );
    if (officeSetError) throw new Error(officeSetError.message);

    step = "CRM client role and desk access";
    const { error: finalizeError } = await admin.rpc(
      "crm_finalize_created_user",
      {
        p_user_id: createdUserId,
        p_actor_id: actorId,
        p_role: "client",
        p_owner_role: null,
        p_owner_id: null,
      },
    );
    if (finalizeError) throw new Error(finalizeError.message);

    step = "lead linkage";
    const { error: markError } = await admin
      .from("crm_leads")
      .update({
        status: "registered",
        registered_user_id: createdUserId,
        registration_started_at: null,
        invited_at: new Date().toISOString(),
        registration_error: null,
      })
      .eq("id", leadId);
    if (markError) {
      throw new Error(
        `Account created, but lead status needs review: ${markError.message}`,
      );
    }
    await admin.from("admin_action_logs").insert({
      admin_user_id: actorId,
      target_user_id: createdUserId,
      action: "crm_lead_registered",
      after_data: {
        lead_id: leadId,
        source: lead.source_name,
        office_id: lead.office_id,
        phone_country_code: lead.phone_country_code,
        automatic: true,
      },
      reason: "Automatically registered phone-routed lead",
    });
    return { outcome: "registered" as const, user_id: createdUserId };
  } catch (error) {
    const detail = `${step}: ${message(error)}`.slice(0, 1000);
    await admin.from("client_onboarding_events").insert({
      auth_user_id: createdUserId || leadId,
      email: lead.email,
      source: "automatic_lead_registration",
      status: "failed",
      failed_step: step,
      message: detail,
    });
    if (createdUserId) {
      const { error: rollbackError } =
        await admin.auth.admin.deleteUser(createdUserId, false);
      if (rollbackError) {
        await admin
          .from("crm_leads")
          .update({
            registration_error: `${detail}. Cleanup requires review for user ${createdUserId}`,
          })
          .eq("id", leadId);
        throw new Error(
          `${detail}. Account cleanup requires administrator review.`,
        );
      }
      await admin.from("users").delete().eq("id", createdUserId);
    }
    await admin
      .from("crm_leads")
      .update({
        status: "new",
        registration_started_at: null,
        registration_error: detail,
      })
      .eq("id", leadId)
      .eq("status", "inviting");
    throw new Error(detail);
  }
}

export async function automaticallyRegisterRoutedLeads(
  admin: SupabaseClient,
  companyId: string,
  leadIds: Iterable<string>,
  suppliedManagersByOffice?: Map<string, string>,
): Promise<AutomaticRegistrationResult> {
  const ids = Array.from(new Set(Array.from(leadIds, String))).filter(Boolean);
  const result: AutomaticRegistrationResult = {
    registered: 0,
    existing: 0,
    failed: 0,
    skipped: 0,
  };
  if (!ids.length) return result;

  const { data: candidates, error: candidateError } = await admin
    .from("crm_leads")
    .select("id,office_id")
    .eq("company_id", companyId)
    .eq("status", "new")
    .eq("phone_validation_status", "valid")
    .eq("phone_routing_status", "routed")
    .in("id", ids);
  if (candidateError)
    throw new Error(
      `Could not load automatic registrations: ${candidateError.message}`,
    );

  let managersByOffice = suppliedManagersByOffice;
  if (!managersByOffice) {
    const { data: managers, error: managerError } = await admin
      .from("crm_staff_roles")
      .select("user_id,users!inner(office_id,company_id)")
      .eq("role", "desk_manager")
      .eq("users.company_id", companyId)
      .order("user_id", { ascending: true });
    if (managerError)
      throw new Error(`Could not load Desk Managers: ${managerError.message}`);
    managersByOffice = new Map<string, string>();
    for (const row of managers || []) {
      const users = Array.isArray(row.users) ? row.users[0] : row.users;
      const officeId = (users as { office_id?: string | null } | null)
        ?.office_id;
      if (officeId && !managersByOffice.has(String(officeId))) {
        managersByOffice.set(String(officeId), String(row.user_id));
      }
    }
  }

  const queue = ((candidates || []) as Array<{
    id: string;
    office_id: string | null;
  }>).map((candidate) => ({
    ...candidate,
    actorId: candidate.office_id
      ? managersByOffice!.get(String(candidate.office_id)) || null
      : null,
  }));
  let cursor = 0;
  const workerCount = Math.min(8, queue.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= queue.length) return;
        const candidate = queue[index];
        if (!candidate.actorId) {
          result.skipped++;
          continue;
        }
        try {
          const registration = await registerRoutedLead(
            admin,
            String(candidate.id),
            candidate.actorId,
            companyId,
          );
          if (registration.outcome === "registered") result.registered++;
          else if (registration.outcome === "existing") result.existing++;
          else result.skipped++;
        } catch (error) {
          result.failed++;
          console.error(
            "Automatic lead registration failed",
            String(candidate.id),
            message(error),
          );
        }
      }
    }),
  );
  result.skipped += ids.length - queue.length;
  return result;
}
