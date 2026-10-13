import assert from "node:assert/strict";
import test from "node:test";
import {
  LEAD_EXPORT_IP,
  canExportLeads,
} from "../supabase/functions/_shared/leadExportAccess.ts";

test("lead export is available to an administrator on the dedicated IP", () => {
  assert.equal(canExportLeads(true, LEAD_EXPORT_IP), true);
});

test("lead export is denied to an administrator on every other IP", () => {
  assert.equal(canExportLeads(true, "92.246.87.144"), false);
  assert.equal(canExportLeads(true, ""), false);
});

test("lead export is denied to non-administrators on the dedicated IP", () => {
  assert.equal(canExportLeads(false, LEAD_EXPORT_IP), false);
});
