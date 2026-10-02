export type LeadBulkAction =
  | "status"
  | "assign"
  | "delete"
  | "promote"
  | "demote";

export interface BulkLeadTarget {
  id: string;
  registered_user_id: string | null;
  registered_is_promoted: boolean | null;
}

interface BulkActionDependencies {
  invokeLeadAction: (
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ error: unknown | null }>;
}

interface BulkActionOptions {
  disposition?: string;
  owner?: string;
}

const linkedClientId = (lead: BulkLeadTarget) => {
  if (!lead.registered_user_id)
    throw new Error("The lead does not have a linked client account");
  return lead.registered_user_id;
};

export async function performLeadBulkAction(
  action: Exclude<LeadBulkAction, "delete">,
  lead: BulkLeadTarget,
  options: BulkActionOptions,
  dependencies: BulkActionDependencies,
) {
  if (action === "status") {
    if (!options.disposition) throw new Error("Choose a lead status");
    await dependencies.invokeLeadAction({
      action: "set_lead_disposition",
      lead_id: lead.id,
      disposition: options.disposition,
    });
    return;
  }

  const clientId = linkedClientId(lead);
  if (action === "assign") {
    const [ownerRole, ownerId, extra] = (options.owner || "").split(":");
    if (!ownerId || extra || !["agent", "retention"].includes(ownerRole))
      throw new Error("Choose a valid Agent or Retention user");
    const { error } = await dependencies.rpc("crm_admin_set_client_owner", {
      p_client_id: clientId,
      p_owner_role: ownerRole,
      p_owner_id: ownerId,
    });
    if (error) throw error;
    return;
  }

  if (action === "promote") {
    if (lead.registered_is_promoted === true)
      throw new Error("The linked client is already promoted");
    const { error } = await dependencies.rpc(
      "crm_promote_client_to_retention",
      { p_client_id: clientId },
    );
    if (error) throw error;
    return;
  }

  if (lead.registered_is_promoted !== true)
    throw new Error("The linked client is already in Sales");
  const { error } = await dependencies.rpc(
    "crm_admin_demote_client_to_sales",
    { p_client_id: clientId },
  );
  if (error) throw error;
}

export async function performLeadBulkDelete(
  leadIds: string[],
  invokeLeadAction: BulkActionDependencies["invokeLeadAction"],
) {
  return invokeLeadAction({
    action: "bulk_delete_leads",
    lead_ids: leadIds,
  });
}
