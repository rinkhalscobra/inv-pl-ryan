import assert from "node:assert/strict";
import test from "node:test";
import {
  performLeadBulkAction,
  performLeadBulkDelete,
  type BulkLeadTarget,
} from "../src/lib/bulkLeadActions.ts";

const salesLead: BulkLeadTarget = {
  id: "lead-1",
  registered_user_id: "client-1",
  registered_is_promoted: false,
};

const retentionLead: BulkLeadTarget = {
  ...salesLead,
  registered_is_promoted: true,
};

const recorder = () => {
  const calls: Array<{ name: string; payload: Record<string, unknown> }> = [];
  return {
    calls,
    dependencies: {
      invokeLeadAction: async (payload: Record<string, unknown>) => {
        calls.push({ name: "edge", payload });
        return {};
      },
      rpc: async (name: string, payload: Record<string, unknown>) => {
        calls.push({ name, payload });
        return { error: null };
      },
    },
  };
};

test("Change Status uses the existing lead-disposition action", async () => {
  const { calls, dependencies } = recorder();
  await performLeadBulkAction(
    "status",
    salesLead,
    { disposition: "call_back" },
    dependencies,
  );
  assert.deepEqual(calls, [
    {
      name: "edge",
      payload: {
        action: "set_lead_disposition",
        lead_id: "lead-1",
        disposition: "call_back",
      },
    },
  ]);
});

test("Assign uses the shared, permission-checked lead-owner action", async () => {
  const { calls, dependencies } = recorder();
  await performLeadBulkAction(
    "assign",
    salesLead,
    { owner: "agent:agent-1" },
    dependencies,
  );
  assert.deepEqual(calls[0], {
    name: "edge",
    payload: {
      action: "set_lead_owner",
      lead_id: "lead-1",
      owner_role: "agent",
      owner_id: "agent-1",
    },
  });
});

test("Unassign uses the same permission-checked lead-owner action", async () => {
  const { calls, dependencies } = recorder();
  await performLeadBulkAction("unassign", salesLead, {}, dependencies);
  assert.deepEqual(calls[0], {
    name: "edge",
    payload: {
      action: "set_lead_owner",
      lead_id: "lead-1",
      owner_role: "unassigned",
      owner_id: null,
    },
  });
});

test("Delete sends only the selected lead IDs to the guarded bulk endpoint", async () => {
  const { calls, dependencies } = recorder();
  await performLeadBulkDelete(["lead-1", "lead-2"], dependencies.invokeLeadAction);
  assert.deepEqual(calls[0], {
    name: "edge",
    payload: {
      action: "bulk_delete_leads",
      lead_ids: ["lead-1", "lead-2"],
    },
  });
});

test("Promote uses the existing retention-promotion RPC", async () => {
  const { calls, dependencies } = recorder();
  await performLeadBulkAction("promote", salesLead, {}, dependencies);
  assert.deepEqual(calls[0], {
    name: "crm_promote_client_to_retention",
    payload: { p_client_id: "client-1" },
  });
});

test("Demote uses the guarded client-demotion workflow", async () => {
  const { calls, dependencies } = recorder();
  await performLeadBulkAction("demote", retentionLead, {}, dependencies);
  assert.deepEqual(calls[0], {
    name: "crm_admin_demote_client_to_sales",
    payload: { p_client_id: "client-1" },
  });
});

test("account actions report unlinked leads instead of submitting", async () => {
  const { calls, dependencies } = recorder();
  await assert.rejects(
    performLeadBulkAction(
      "promote",
      { ...salesLead, registered_user_id: null },
      {},
      dependencies,
    ),
    /does not have a linked client account/,
  );
  assert.equal(calls.length, 0);
});
