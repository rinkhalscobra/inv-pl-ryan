import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  Clipboard,
  Copy,
  Download,
  Upload,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import AppSelect from "./AppSelect";
import { supabase } from "../lib/supabaseClient";
import { parseCsv, rowsToLeads, type LeadInput } from "../lib/leadImport";
import {
  performLeadBulkAction,
  performLeadBulkDelete,
  type LeadBulkAction,
} from "../lib/bulkLeadActions";
import {
  getSelectedCrmCompanyId,
  setSelectedCrmCompanyId,
  type CrmCompany,
} from "../lib/crmCompany";

type LeadStatus = "new" | "inviting" | "registered" | "existing";
type LeadDisposition =
  | "new"
  | "no_answer"
  | "call_back"
  | "low_potential"
  | "no_money"
  | "wrong_number"
  | "ftd";
type SourceKind = "affiliate_api" | "google_sheet";
interface Lead {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  country: string;
  campaign: string;
  notes: string;
  source_kind: string;
  source_name: string;
  status: LeadStatus;
  registered_user_id: string | null;
  registered_is_promoted: boolean | null;
  disposition_status: LeadDisposition;
  disposition_changed_at: string;
  disposition_changed_by: string | null;
  registration_error: string | null;
  last_registration_attempt_at: string | null;
  created_at: string;
  invited_at: string | null;
  office_id: string | null;
  source_metadata: { incoming_office?: string | null };
  phone_e164: string | null;
  phone_country_code: string | null;
  phone_calling_code: string | null;
  phone_validation_status:
    "pending" | "valid" | "invalid" | "unsupported" | "missing";
  phone_validation_reason: string;
  phone_routing_status:
    | "pending"
    | "routed"
    | "no_office"
    | "no_desk_manager"
    | "invalid"
    | "manual";
  phone_routed_at: string | null;
  assignee: {
    user_id: string;
    name: string;
    role: string;
  } | null;
}
interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  sheet_url: string | null;
  active: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
}
interface Owner {
  user_id: string;
  role: "agent" | "retention";
  users: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    office_id: string | null;
  };
}
interface DeskManager {
  user_id: string;
  role: "desk_manager";
  users: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    office_id: string | null;
  };
}
interface Office {
  id: string;
  name: string;
  code: string;
  status: "active" | "inactive";
}
interface Dashboard {
  leads: Lead[];
  total: number;
  sources: Source[];
  owners: Owner[];
  offices: Office[];
  desk_managers: DeskManager[];
  incorrect_phone_count: number;
  routing_review_count: number;
  actor_role: "admin" | "workflow_manager" | "desk_manager";
}
interface ImportResult {
  added: number;
  duplicates: number;
  invalid: number;
  automatic_registration?: {
    registered: number;
    existing: number;
    failed: number;
    skipped: number;
  };
}

type BulkAction = "" | LeadBulkAction;
interface BulkFailure {
  leadId: string;
  label: string;
  error: string;
}

const automaticRegistrationSummary = (result: ImportResult) => {
  const automatic = result.automatic_registration;
  if (!automatic) return "";
  const completed = automatic.registered + automatic.existing;
  return ` ${completed} account${completed === 1 ? "" : "s"} registered automatically${automatic.failed ? `; ${automatic.failed} failed and remain available for retry` : ""}.`;
};

const panel = "rounded-xl border border-white/10 bg-[#151b26]";
const input =
  "w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400";
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50";
const emptyDashboard: Dashboard = {
  leads: [],
  total: 0,
  sources: [],
  owners: [],
  offices: [],
  desk_managers: [],
  incorrect_phone_count: 0,
  routing_review_count: 0,
  actor_role: "admin",
};
const dispositionLabels: Record<LeadDisposition, string> = {
  new: "NEW",
  no_answer: "No Answer",
  call_back: "Call Back",
  low_potential: "Low Potential",
  no_money: "No Money",
  wrong_number: "Wrong Number",
  ftd: "FTD",
};
const dispositionStyles: Record<LeadDisposition, string> = {
  new: "border-violet-400/30 text-violet-200",
  no_answer: "border-slate-400/30 text-slate-200",
  call_back: "border-cyan-400/30 text-cyan-200",
  low_potential: "border-amber-400/30 text-amber-200",
  no_money: "border-orange-400/30 text-orange-200",
  wrong_number: "border-red-400/30 text-red-200",
  ftd: "border-emerald-400/30 text-emerald-200",
};

const affiliateDocumentation = (
  apiUrl: string,
) => `AFFILIATE LEAD API - INTEGRATION GUIDE

Purpose
This is a server-to-server API for sending prospective client details and following their partner-facing statuses. It never gives the affiliate CRM access and never creates a deposit or trade. A valid international phone number automatically creates or links the client account when its detected country has an active Office and Desk Manager. Otherwise the lead remains in the appropriate review queue.

Lead submission endpoint
POST ${apiUrl}

Current-status endpoint
GET ${apiUrl}/status?tracking_id=TRACKING_UUID

Ordered live-event endpoint
GET ${apiUrl}/events?after=0&limit=100

Required headers
Content-Type: application/json
x-affiliate-key: YOUR_AFFILIATE_KEY

Single-lead request
{
  "email": "jane@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "phone": "+49 30 901820",
  "country": "US",
  "campaign": "Spring campaign",
  "notes": "Requested a callback",
  "external_id": "partner-123"
}

Batch request (1 to 100 leads)
{
  "leads": [
    {
      "email": "jane@example.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "external_id": "partner-123"
    }
  ]
}

cURL example
curl --request POST '${apiUrl}' \\
  --header 'Content-Type: application/json' \\
  --header 'x-affiliate-key: YOUR_AFFILIATE_KEY' \\
  --data '{"email":"jane@example.com","first_name":"Jane","last_name":"Doe","phone":"+49 30 901820","country":"DE","campaign":"Spring campaign","external_id":"partner-123"}'

JavaScript / Node.js example
const response = await fetch('${apiUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-affiliate-key': process.env.AFFILIATE_API_KEY
  },
  body: JSON.stringify({
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+49 30 901820',
    country: 'DE',
    campaign: 'Spring campaign',
    external_id: 'partner-123'
  })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Lead submission failed');

Success response
HTTP 200
{
  "accepted": 1,
  "duplicates": 0,
  "invalid": 0,
  "automatic_registration": {
    "registered": 1,
    "existing": 0,
    "failed": 0,
    "skipped": 0
  },
  "results": [
    {
      "outcome": "accepted",
      "tracking_id": "8a3f63f4-87f5-4dad-b16f-91af0c8d8c14",
      "external_id": "partner-123",
      "status": "registered",
      "reason_code": null,
      "account_status": "registered",
      "ftd_status": false,
      "ftd_date": null,
      "ftd_source": null,
      "received_at": "2026-09-29T10:42:18.000Z",
      "updated_at": "2026-09-29T10:42:18.000Z"
    }
  ]
}

Response counters
- accepted: new leads saved to the CRM
- duplicates: valid leads already present for this company, or repeated emails in the request
- invalid: records missing a valid email address
- automatic_registration: accounts registered, linked, failed, or skipped because routing is incomplete
- results: trackable records belonging to this affiliate connection

If this affiliate resends its own unregistered lead with a corrected, non-empty phone number, the phone is revalidated, Office routing is refreshed, and a newly staffed route is registered automatically. Another source's duplicate and a manually classified Office are never overwritten.

REAL-TIME LEAD STATUS

The status API uses the same x-affiliate-key header and is restricted to leads sent by this affiliate connection. It never returns CRM notes, assigned staff, balances, deposit amounts, or other affiliates' records.

Current snapshot by tracking ID
curl --request GET '${apiUrl}/status?tracking_id=8a3f63f4-87f5-4dad-b16f-91af0c8d8c14' \
  --header 'x-affiliate-key: YOUR_AFFILIATE_KEY'

Current snapshot by affiliate reference
curl --request GET '${apiUrl}/status?external_id=partner-123' \
  --header 'x-affiliate-key: YOUR_AFFILIATE_KEY'

Ordered event feed
curl --request GET '${apiUrl}/events?after=0&limit=100' \
  --header 'x-affiliate-key: YOUR_AFFILIATE_KEY'

Event date range (occurred_at)
curl --request GET '${apiUrl}/events?from=2026-09-01&to=2026-09-29&after=0&limit=100' \
  --header 'x-affiliate-key: YOUR_AFFILIATE_KEY'

FTD date range
curl --request GET '${apiUrl}/events?date_field=ftd&from=2026-09-01&to=2026-09-29&after=0&limit=100' \
  --header 'x-affiliate-key: YOUR_AFFILIATE_KEY'

Event response
{
  "events": [
    {
      "cursor": 42,
      "type": "lead.status_changed",
      "tracking_id": "8a3f63f4-87f5-4dad-b16f-91af0c8d8c14",
      "external_id": "partner-123",
      "status": "follow_up",
      "reason_code": null,
      "account_status": "new",
      "ftd_status": false,
      "ftd_date": null,
      "ftd_source": null,
      "lead_received_at": "2026-09-28T09:20:00.000Z",
      "occurred_at": "2026-09-29T11:18:04.000Z"
    }
  ],
  "next_cursor": 42,
  "has_more": false
}

Working Node.js live monitor
const endpoint = '${apiUrl}';
const headers = { 'x-affiliate-key': process.env.AFFILIATE_API_KEY };
let cursor = Number(process.env.LAST_AFFILIATE_CURSOR || 0);

for (;;) {
  const response = await fetch(
    endpoint + '/events?after=' + cursor + '&limit=100',
    { headers }
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Status feed failed');

  for (const event of payload.events) {
    console.log(event.external_id, event.status, event.ftd_status, event.ftd_date, event.occurred_at);
    // Save the status and cursor in the affiliate database. Processing by
    // cursor makes reconnects and repeated responses idempotent.
    cursor = event.cursor;
  }

  if (!payload.has_more) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

Status values
- received: accepted into the CRM
- contact_attempted: the sales team attempted contact without an answer
- follow_up: another contact is planned
- invalid: the lead cannot be contacted with the submitted number
- not_qualified: the lead did not meet the current qualification criteria
- processing: account registration is currently in progress
- registered: a platform account was registered or linked
- converted: a qualifying first deposit was recorded or the CRM marked the lead as FTD

FTD fields and date filters
- Automatic FTD requires one completed wallet credit of at least 250 USD/USDT equivalent.
- Staff may also select FTD manually; this returns ftd_status=true and ftd_source=manual.
- ftd_date is the exact qualifying wallet-credit time from transactions.balance_processed_at; a manual FTD without a qualifying deposit keeps ftd_date=null.
- ftd_source is automatic for a deposit-backed FTD, manual for a staff override, or null when the lead is not FTD.
- Legacy transactions without an authoritative wallet-credit time are excluded; the API returns no FTD date instead of inventing one.
- from and to accept YYYY-MM-DD or ISO-8601 timestamps with a timezone. A date-only to includes the full UTC day.
- date_field=event (default) filters occurred_at; date_field=lead filters lead_received_at; date_field=ftd filters ftd_date and returns only deposit-backed FTD events. Manual FTDs without a deposit date remain available through event or lead filtering.
- A qualifying deposit creates a canonical lead.ftd event at the exact wallet-credit time.

Cursor rules
- Start with after=0 to read all retained events for this affiliate.
- Save next_cursor only after the events have been stored successfully.
- When has_more is true, request the next page immediately.
- When has_more is false, poll again after approximately five seconds.
- Reusing the same cursor is safe; de-duplicate events by cursor.

Field rules
- email: required, valid email, maximum 254 characters; normalized to lowercase
- first_name: optional, maximum 100 characters
- last_name: optional, maximum 100 characters
- full_name: optional alternative to first_name and last_name, maximum 200 characters
- phone: optional, maximum 60 characters; use international + or 00 format
- country: optional, maximum 100 characters
- office: optional source metadata, maximum 100 characters; it does not override phone routing
- campaign: optional, maximum 120 characters
- notes: optional, maximum 2,000 characters
- external_id: recommended affiliate reference, maximum 120 characters; use a unique value for reliable lookup

Phone validation and Office assignment
The server validates the complete international number against real country numbering plans. A valid number is normalized to E.164 and its detected country code routes the lead to the active Office configured for that phone country (for example +49 -> DE, +33 -> FR, +34 -> ES, +39 -> IT). This happens automatically before the new lead is saved. Invalid, missing, or unknown numbers appear in the Incorrect numbers review queue. A valid country without a matching Office, or an Office without a Desk Manager, appears in Routing review. The submitted country and office fields cannot override the detected phone country.

Errors
- 400: malformed JSON, empty batch, or more than 100 leads
- 401: missing, invalid, paused, rotated, or unknown affiliate key
- 405: method and path combination other than the documented POST and GET routes
- 413: request body larger than 500,000 characters
- 500: temporary server error; retry later

Security and delivery rules
- Call this endpoint from the affiliate's backend/server, not browser JavaScript.
- Never expose the key in a website, mobile app, URL, query string, log, or public repository.
- The key is shown only once. Store it as a secret environment variable.
- Email is the duplicate key inside the destination company. external_id is a reference field, not the duplicate key.
- Store each accepted tracking_id. It is the safest identifier for later status lookup.
- Poll the event feed from the affiliate's backend, never directly from a browser.
- A paused connection or rotated key stops accepting leads immediately.
- For a 500 response, retry safely. A retry may return the lead as a duplicate if the original request was saved.
`;

async function invokeLeadActionRequest(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("admin-leads", {
    body,
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    const payload =
      response instanceof Response
        ? ((await response
            .clone()
            .json()
            .catch(() => null)) as { error?: string } | null)
        : null;
    throw new Error(payload?.error || error.message);
  }
  const result = data as Record<string, unknown> | null;
  if (result?.error) throw new Error(String(result.error));
  return result || {};
}

const nameOf = (lead: Lead) =>
  `${lead.first_name} ${lead.last_name}`.trim() || "Unnamed lead";
const ownerName = (owner: Owner) => {
  const user = Array.isArray(owner.users) ? owner.users[0] : owner.users;
  return (
    `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
    user?.email ||
    owner.user_id
  );
};
const deskManagerName = (manager: DeskManager) => {
  const user = Array.isArray(manager.users) ? manager.users[0] : manager.users;
  return (
    `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
    user?.email ||
    manager.user_id
  );
};
const assigneeRoleLabel = (role: string) =>
  role
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
const operationError = (cause: unknown) => {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause)
    return String((cause as { message?: unknown }).message || "The action failed");
  return "The action failed";
};

export default function AdminLeadsPage({
  staffMode = false,
}: {
  staffMode?: boolean;
}) {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");
  const [disposition, setDisposition] = useState("all");
  const [officeFilter, setOfficeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [phoneFilter, setPhoneFilter] = useState("all");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedTo, setReceivedTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [affiliateName, setAffiliateName] = useState("");
  const [showAffiliateDocs, setShowAffiliateDocs] = useState(false);
  const [sheetName, setSheetName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [secret, setSecret] = useState<{ name: string; key: string } | null>(
    null,
  );
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);
  const [editingAffiliateId, setEditingAffiliateId] = useState<string | null>(
    null,
  );
  const [editingAffiliateName, setEditingAffiliateName] = useState("");
  const [deleteAffiliate, setDeleteAffiliate] = useState<Source | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [owner, setOwner] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [bulkDisposition, setBulkDisposition] =
    useState<LeadDisposition>("new");
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmBulkUnassign, setConfirmBulkUnassign] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const bulkRunningRef = useRef(false);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [companyId, setCompanyId] = useState(getSelectedCrmCompanyId() || "");
  const [isPlatformNetwork, setIsPlatformNetwork] = useState(false);

  const invokeLeadAction = useCallback(
    (body: Record<string, unknown>) =>
      invokeLeadActionRequest({ ...body, company_id: companyId || null }),
    [companyId],
  );

  useEffect(() => {
    if (staffMode) return;
    void Promise.all([
      supabase.rpc("crm_admin_list_companies"),
      supabase.rpc("crm_admin_network_context"),
    ]).then(([companyResult, contextResult]) => {
      const next = (companyResult.data as CrmCompany[] | null) || [];
      setCompanies(next);
      setIsPlatformNetwork(
        (contextResult.data as { is_platform?: boolean } | null)
          ?.is_platform === true,
      );
      const selected = next.some((company) => company.id === companyId)
        ? companyId
        : next[0]?.id || "";
      if (selected) {
        setCompanyId(selected);
        setSelectedCrmCompanyId(selected);
      }
    });
  }, [companyId, staffMode]);

  useEffect(() => {
    setEditingAffiliateId(null);
    setEditingAffiliateName("");
    setConfirmRotate(null);
  }, [companyId]);

  useEffect(() => {
    setSelectedLeadIds(new Set());
    setConfirmBulkDelete(false);
    setConfirmBulkUnassign(false);
  }, [
    companyId,
    page,
    status,
    disposition,
    officeFilter,
    assigneeFilter,
    phoneFilter,
    receivedFrom,
    receivedTo,
    search,
  ]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeLeadAction({
        action: "dashboard",
        page,
        status,
        disposition,
        search,
        office_id: officeFilter,
        assignee_id: assigneeFilter,
        phone_filter: phoneFilter,
        date_from: receivedFrom || null,
        date_to: receivedTo || null,
      });
      setDashboard(data as unknown as Dashboard);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load leads");
    } finally {
      setLoading(false);
    }
  }, [
    invokeLeadAction,
    page,
    status,
    disposition,
    search,
    officeFilter,
    assigneeFilter,
    phoneFilter,
    receivedFrom,
    receivedTo,
  ]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(result);
      await refresh();
    } catch (cause) {
      await refresh();
      setError(cause instanceof Error ? cause.message : "The action failed");
    } finally {
      setBusy(null);
    }
  };

  const createAffiliate = (event: FormEvent) => {
    event.preventDefault();
    void run("affiliate", async () => {
      const data = await invokeLeadAction({
        action: "create_affiliate",
        name: affiliateName,
      });
      setSecret({ name: affiliateName, key: String(data.api_key) });
      setAffiliateName("");
      return "Affiliate connection created. Copy its key now; it is shown only once.";
    });
  };

  const createSheet = (event: FormEvent) => {
    event.preventDefault();
    void run("sheet", async () => {
      const data = await invokeLeadAction({
        action: "create_sheet",
        name: sheetName,
        url: sheetUrl,
      });
      const source = data.source as Source;
      setSheetName("");
      setSheetUrl("");
      const synced = await invokeLeadAction({
        action: "sync_sheet",
        source_id: source.id,
      });
      const result = synced.result as ImportResult;
      return `Sheet connected. ${result.added} new leads, ${result.duplicates} duplicates, ${result.invalid} invalid rows.${automaticRegistrationSummary(result)}`;
    });
  };

  const syncSource = (source: Source) =>
    void run(`sync-${source.id}`, async () => {
      const data = await invokeLeadAction({
        action: "sync_sheet",
        source_id: source.id,
      });
      const result = data.result as ImportResult;
      return `${source.name}: ${result.added} new leads, ${result.duplicates} duplicates, ${result.invalid} invalid rows.${automaticRegistrationSummary(result)}`;
    });

  const toggleSource = (source: Source) =>
    void run(`source-${source.id}`, async () => {
      await invokeLeadAction({
        action: "set_source_active",
        source_id: source.id,
        active: !source.active,
      });
      return `${source.name} ${source.active ? "paused" : "activated"}.`;
    });

  const rotateKey = (source: Source) =>
    void run(`rotate-${source.id}`, async () => {
      const data = await invokeLeadAction({
        action: "rotate_key",
        source_id: source.id,
      });
      setConfirmRotate(null);
      setSecret({ name: source.name, key: String(data.api_key) });
      return "Key rotated. The previous affiliate key stopped working immediately.";
    });

  const renameAffiliate = (event: FormEvent, source: Source) => {
    event.preventDefault();
    const name = editingAffiliateName.trim();
    if (!name) {
      setError("Enter an affiliate name.");
      return;
    }
    void run(`rename-${source.id}`, async () => {
      const data = await invokeLeadAction({
        action: "rename_affiliate_source",
        source_id: source.id,
        name,
      });
      const result = data.result as { updated_leads?: number } | undefined;
      setEditingAffiliateId(null);
      setEditingAffiliateName("");
      return `${source.name} was renamed to ${name}. ${result?.updated_leads || 0} linked lead record${result?.updated_leads === 1 ? "" : "s"} updated.`;
    });
  };

  const deleteAffiliateSource = (deleteLeads: boolean) => {
    if (!deleteAffiliate) return;
    const source = deleteAffiliate;
    void run(`delete-${source.id}`, async () => {
      const data = await invokeLeadAction({
        action: "delete_affiliate_source",
        source_id: source.id,
        delete_leads: deleteLeads,
      });
      const result = data.result as
        { deleted_leads?: number; linked_leads?: number } | undefined;
      setDeleteAffiliate(null);
      return deleteLeads
        ? `${source.name} and ${result?.deleted_leads || 0} linked lead record${result?.deleted_leads === 1 ? "" : "s"} were deleted. Existing client accounts were preserved.`
        : `${source.name} was deleted. ${result?.linked_leads || 0} linked lead record${result?.linked_leads === 1 ? "" : "s"} were preserved.`;
    });
  };

  const importFile = (file: File) =>
    void run("import", async () => {
      if (file.size > 5_000_000)
        throw new Error("Choose a file smaller than 5 MB.");
      let rows: unknown[][];
      if (file.name.toLowerCase().endsWith(".csv"))
        rows = parseCsv(await file.text());
      else if (file.name.toLowerCase().endsWith(".xlsx")) {
        const { readSheet } = await import("read-excel-file/browser");
        rows = await readSheet(file);
      } else throw new Error("Choose a CSV or .xlsx Excel file.");
      const parsed = rowsToLeads(rows);
      if (!parsed.leads.length)
        throw new Error(
          "The file has no valid leads. Include an Email column.",
        );
      if (parsed.leads.length > 5000)
        throw new Error("Import up to 5,000 leads per file.");
      const totals: ImportResult = {
        added: 0,
        duplicates: 0,
        invalid: parsed.invalid,
        automatic_registration: {
          registered: 0,
          existing: 0,
          failed: 0,
          skipped: 0,
        },
      };
      for (let index = 0; index < parsed.leads.length; index += 200) {
        const data = await invokeLeadAction({
          action: "import_rows",
          filename: file.name,
          rows: parsed.leads.slice(index, index + 200) as LeadInput[],
        });
        const result = data.result as ImportResult;
        totals.added += result.added;
        totals.duplicates += result.duplicates;
        totals.invalid += result.invalid;
        if (result.automatic_registration && totals.automatic_registration) {
          totals.automatic_registration.registered +=
            result.automatic_registration.registered;
          totals.automatic_registration.existing +=
            result.automatic_registration.existing;
          totals.automatic_registration.failed +=
            result.automatic_registration.failed;
          totals.automatic_registration.skipped +=
            result.automatic_registration.skipped;
        }
      }
      return `Import complete: ${totals.added} new leads, ${totals.duplicates} duplicates, ${totals.invalid} invalid rows.${automaticRegistrationSummary(totals)}`;
    });

  const registerLead = () => {
    if (!selectedLead) return;
    const lead = selectedLead;
    const [ownerRole, ownerId] = owner ? owner.split(":") : [null, null];
    void run(`register-${lead.id}`, async () => {
      const data = await invokeLeadAction({
        action: "register_lead",
        lead_id: lead.id,
        owner_role: ownerRole,
        owner_id: ownerId,
      });
      setSelectedLead(null);
      setOwner("");
      return data.outcome === "existing"
        ? `${lead.email} already has an account; the lead has been linked to it.`
        : `${lead.email} is now an active client with a trading account and document folder.`;
    });
  };
  const setLeadOffice = (lead: Lead, officeId: string) =>
    void run(`office-${lead.id}`, async () => {
      await invokeLeadAction({
        action: "set_lead_office",
        lead_id: lead.id,
        office_id: officeId || null,
      });
      return "Lead Office updated.";
    });
  const setLeadDisposition = (lead: Lead, nextDisposition: LeadDisposition) =>
    void run(`disposition-${lead.id}`, async () => {
      await invokeLeadAction({
        action: "set_lead_disposition",
        lead_id: lead.id,
        disposition: nextDisposition,
      });
      return `${nameOf(lead)} marked as ${dispositionLabels[nextDisposition]}.`;
    });

  const applyBulkAction = async (actionConfirmed = false) => {
    if (
      !bulkAction ||
      selectedLeadIds.size === 0 ||
      busy ||
      bulkRunningRef.current
    )
      return;
    if (bulkAction === "delete" && !actionConfirmed) {
      setConfirmBulkDelete(true);
      return;
    }
    if (bulkAction === "unassign" && !actionConfirmed) {
      setConfirmBulkUnassign(true);
      return;
    }
    if (bulkAction === "assign" && !bulkOwner) {
      setError(
        dashboard.actor_role === "desk_manager"
          ? "Choose an Agent from your team for the assignment."
          : "Choose an Agent or Retention user for the assignment.",
      );
      return;
    }

    const leads = dashboard.leads.filter((lead) => selectedLeadIds.has(lead.id));
    if (!leads.length) {
      setSelectedLeadIds(new Set());
      setError("The selected leads are no longer on this page. Select them again.");
      return;
    }

    bulkRunningRef.current = true;
    setBusy("bulk");
    setError(null);
    setNotice(null);
    setConfirmBulkDelete(false);
    setConfirmBulkUnassign(false);
    setBulkProgress({ completed: 0, total: leads.length });
    const succeeded = new Set<string>();
    const failures: BulkFailure[] = [];

    try {
      if (bulkAction === "delete") {
        const data = await performLeadBulkDelete(
          leads.map((lead) => lead.id),
          invokeLeadAction,
        );
        const deletedIds = Array.isArray(data.deleted_ids)
          ? data.deleted_ids.map(String)
          : [];
        deletedIds.forEach((id) => succeeded.add(id));
        const returnedFailures = Array.isArray(data.failures)
          ? (data.failures as Array<{ lead_id?: unknown; error?: unknown }>)
          : [];
        returnedFailures.forEach((failure) => {
          const leadId = String(failure.lead_id || "");
          const lead = leads.find((item) => item.id === leadId);
          failures.push({
            leadId,
            label: lead ? nameOf(lead) : "Unavailable lead",
            error: String(failure.error || "Delete failed"),
          });
        });
        setBulkProgress({ completed: leads.length, total: leads.length });
      } else {
        for (let index = 0; index < leads.length; index++) {
          const lead = leads[index];
          try {
            await performLeadBulkAction(
              bulkAction,
              lead,
              { disposition: bulkDisposition, owner: bulkOwner },
              {
                invokeLeadAction,
                rpc: async (name, parameters) => {
                  const { error: rpcError } = await supabase.rpc(
                    name,
                    parameters,
                  );
                  return { error: rpcError };
                },
              },
            );
            succeeded.add(lead.id);
          } catch (cause) {
            failures.push({
              leadId: lead.id,
              label: nameOf(lead),
              error: operationError(cause),
            });
          }
          setBulkProgress({ completed: index + 1, total: leads.length });
        }
      }

      await refresh();
      const actionLabel =
        bulkAction === "status"
          ? `changed to ${dispositionLabels[bulkDisposition]}`
          : bulkAction === "assign"
            ? "assigned"
            : bulkAction === "unassign"
              ? "unassigned"
            : bulkAction === "delete"
              ? "deleted"
              : bulkAction === "promote"
                ? "promoted"
                : "demoted";
      if (failures.length) {
        setSelectedLeadIds(new Set(failures.map((failure) => failure.leadId)));
        setNotice(
          succeeded.size
            ? `${succeeded.size} lead${succeeded.size === 1 ? "" : "s"} ${actionLabel}.`
            : null,
        );
        const details = failures
          .slice(0, 4)
          .map((failure) => `${failure.label}: ${failure.error}`)
          .join("; ");
        setError(
          `${failures.length} of ${leads.length} failed. ${details}${failures.length > 4 ? `; and ${failures.length - 4} more` : ""}`,
        );
      } else {
        setSelectedLeadIds(new Set());
        setBulkAction("");
        setBulkOwner("");
        setNotice(
          `${succeeded.size} lead${succeeded.size === 1 ? "" : "s"} ${actionLabel} successfully.${bulkAction === "delete" ? " Linked client accounts were preserved." : ""}`,
        );
        if (
          bulkAction === "delete" &&
          page > 0 &&
          succeeded.size === dashboard.leads.length
        )
          setPage((value) => Math.max(0, value - 1));
      }
    } catch (cause) {
      await refresh();
      setError(operationError(cause));
    } finally {
      bulkRunningRef.current = false;
      setBusy(null);
      setBulkProgress(null);
    }
  };

  const reprocessPhoneRouting = () =>
    void run("phone-routing", async () => {
      const data = await invokeLeadAction({
        action: "reprocess_phone_routing",
      });
      const result = data.result as
        | ({ updated?: number } & Pick<ImportResult, "automatic_registration">)
        | undefined;
      const automatic = result?.automatic_registration;
      const completed = automatic
        ? automatic.registered + automatic.existing
        : 0;
      return `${result?.updated || 0} lead phone number${result?.updated === 1 ? "" : "s"} revalidated and routed. ${completed} account${completed === 1 ? "" : "s"} registered automatically.`;
    });

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/affiliate-leads`;
  const copyToClipboard = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      setNotice(message);
    } catch {
      setError("Copy failed. Select and copy the text manually.");
    }
  };
  const downloadAffiliateDocs = () => {
    const file = new Blob([affiliateDocumentation(apiUrl)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    const safeName = secret?.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    link.href = url;
    link.download = safeName
      ? `${safeName}-affiliate-api-package.txt`
      : "affiliate-api-integration-guide.txt";
    link.click();
    URL.revokeObjectURL(url);
  };
  const newCount = dashboard.leads.filter(
    (lead) => lead.disposition_status === "new",
  ).length;
  const selectedLeadDeskManagers = selectedLead
    ? dashboard.desk_managers.filter((manager) => {
        const user = Array.isArray(manager.users)
          ? manager.users[0]
          : manager.users;
        return user?.office_id === selectedLead.office_id;
      })
    : [];
  const availableDeskManagers = (
    dashboard.actor_role === "desk_manager" ? [] : [...dashboard.desk_managers]
  )
    .sort((left, right) =>
      deskManagerName(left).localeCompare(deskManagerName(right)),
    );
  const availableAgents = dashboard.owners
    .filter((candidate) => candidate.role === "agent")
    .sort((left, right) => ownerName(left).localeCompare(ownerName(right)));
  const availableRetentionUsers = dashboard.owners
    .filter((candidate) => candidate.role === "retention")
    .sort((left, right) => ownerName(left).localeCompare(ownerName(right)));
  const currentPageLeadIds = dashboard.leads.map((lead) => lead.id);
  const selectedOnPage = currentPageLeadIds.filter((id) =>
    selectedLeadIds.has(id),
  ).length;
  const allCurrentPageSelected =
    currentPageLeadIds.length > 0 &&
    selectedOnPage === currentPageLeadIds.length;
  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate =
        selectedOnPage > 0 && !allCurrentPageSelected;
  }, [allCurrentPageSelected, selectedOnPage]);

  const toggleCurrentPage = () => {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (allCurrentPageSelected)
        currentPageLeadIds.forEach((id) => next.delete(id));
      else currentPageLeadIds.forEach((id) => next.add(id));
      return next;
    });
  };

  return (
    <main
      className={`min-h-screen bg-[#0d1118] px-4 pt-5 text-slate-100 sm:px-6 lg:px-8 ${selectedLeadIds.size > 0 ? "pb-72 sm:pb-32" : "pb-5"}`}
    >
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(staffMode ? "/crm" : "/admin")}
              aria-label="Back to CRM"
              className={`${button} border border-white/10 text-slate-300 hover:text-white`}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300">
              <Users size={21} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Lead inbox</h1>
              <p className="text-sm text-slate-400">
                {staffMode
                  ? dashboard.actor_role === "desk_manager"
                    ? "Leads in your Desk Manager team."
                    : "All Sales Offices. Use the Office selector as a filter."
                  : "Validate, route, and automatically register incoming affiliate leads."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!staffMode && isPlatformNetwork && companies.length > 0 && (
              <AppSelect
                value={companyId}
                onChange={(event) => {
                  setCompanyId(event.target.value);
                  setSelectedCrmCompanyId(event.target.value);
                  setPage(0);
                  setAssigneeFilter("all");
                }}
                className="min-w-[220px] rounded-lg border border-violet-400/30 bg-[#0e1420] px-3 py-2 text-sm text-violet-100"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </AppSelect>
            )}
            {!staffMode && (
              <button
                type="button"
                onClick={reprocessPhoneRouting}
                disabled={loading || !!busy}
                className={`${button} border border-violet-400/25 text-violet-200 hover:bg-violet-500/10`}
              >
                <PhoneCall size={16} />
                {busy === "phone-routing"
                  ? "Checking..."
                  : "Recheck phone routing"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || !!busy}
              className={`${button} border border-white/10 text-slate-300 hover:text-white`}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          >
            <Check size={16} />
            {notice}
          </div>
        )}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`${panel} px-5 py-4`}>
            <div className="text-xs text-slate-400">Matching leads</div>
            <div className="mt-1 text-2xl font-bold">
              {dashboard.total.toLocaleString()}
            </div>
          </div>
          <div className={`${panel} px-5 py-4`}>
            <div className="text-xs text-slate-400">New on this page</div>
            <div className="mt-1 text-2xl font-bold text-violet-300">
              {newCount}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPage(0);
              setPhoneFilter("incorrect");
            }}
            className={`${panel} px-5 py-4 text-left transition hover:border-red-400/30 ${phoneFilter === "incorrect" ? "border-red-400/40 bg-red-500/[0.06]" : ""}`}
          >
            <div className="text-xs text-slate-400">Incorrect numbers</div>
            <div className="mt-1 text-2xl font-bold text-red-300">
              {dashboard.incorrect_phone_count.toLocaleString()}
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setPage(0);
              setPhoneFilter("routing_review");
            }}
            className={`${panel} px-5 py-4 text-left transition hover:border-amber-400/30 ${phoneFilter === "routing_review" ? "border-amber-400/40 bg-amber-500/[0.06]" : ""}`}
          >
            <div className="text-xs text-slate-400">Routing review</div>
            <div className="mt-1 text-2xl font-bold text-amber-300">
              {dashboard.routing_review_count.toLocaleString()}
            </div>
          </button>
        </div>

        <div
          className={`grid items-start gap-5 ${staffMode ? "" : "xl:grid-cols-[minmax(0,1fr)_390px]"}`}
        >
          <section className={`${panel} min-w-0 overflow-hidden`}>
            <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-4">
              <div className="mr-auto">
                <h2 className="font-semibold">Leads</h2>
                <p className="text-xs text-slate-400">
                  Valid phone-routed leads create and initialize their client
                  accounts automatically.
                </p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(0);
                  setSearch(searchInput.trim());
                }}
                className="flex gap-2"
              >
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search email"
                  className={`${input} w-40 sm:w-48`}
                />
                <button
                  type="submit"
                  className={`${button} border border-white/10 text-slate-200 hover:text-white`}
                >
                  Search
                </button>
              </form>
              <AppSelect
                value={phoneFilter}
                onChange={(event) => {
                  setPage(0);
                  setPhoneFilter(event.target.value);
                }}
                className={`${input} w-48`}
                aria-label="Filter phone quality"
              >
                <option value="all">All phone numbers</option>
                <option value="valid">Correct numbers</option>
                <option value="incorrect">Incorrect numbers</option>
                <option value="routing_review">Routing review</option>
              </AppSelect>
              {dashboard.actor_role !== "desk_manager" && (
                <AppSelect
                  value={officeFilter}
                  onChange={(event) => {
                    setPage(0);
                    setOfficeFilter(event.target.value);
                  }}
                  className={`${input} w-44`}
                  aria-label="Filter by Office"
                >
                  <option value="all">All Offices</option>
                  <option value="unassigned">No Office</option>
                  {dashboard.offices.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.code} · {office.name}
                    </option>
                  ))}
                </AppSelect>
              )}
              <AppSelect
                value={assigneeFilter}
                onChange={(event) => {
                  setPage(0);
                  setAssigneeFilter(event.target.value);
                }}
                className={`${input} w-52`}
                aria-label="Filter by assignee"
              >
                <option value="all">
                  {dashboard.actor_role === "desk_manager"
                    ? "All Agents"
                    : "All / Any Assignee"}
                </option>
                {availableDeskManagers.length > 0 && (
                  <optgroup label="Desk Managers">
                    {availableDeskManagers.map((manager) => (
                      <option
                        key={`desk_manager:${manager.user_id}`}
                        value={manager.user_id}
                      >
                        {deskManagerName(manager)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {availableAgents.length > 0 && (
                  <optgroup label="Agents">
                    {availableAgents.map((agent) => (
                      <option
                        key={`agent:${agent.user_id}`}
                        value={agent.user_id}
                      >
                        {ownerName(agent)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {availableRetentionUsers.length > 0 && (
                  <optgroup label="Retention">
                    {availableRetentionUsers.map((retentionUser) => (
                      <option
                        key={`retention:${retentionUser.user_id}`}
                        value={retentionUser.user_id}
                      >
                        {ownerName(retentionUser)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </AppSelect>
              <AppSelect
                value={disposition}
                onChange={(event) => {
                  setPage(0);
                  setDisposition(event.target.value);
                }}
                className={`${input} w-44`}
                aria-label="Filter sales status"
              >
                <option value="all">All lead statuses</option>
                {(
                  Object.entries(dispositionLabels) as [
                    LeadDisposition,
                    string,
                  ][]
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AppSelect>
              <AppSelect
                value={status}
                onChange={(event) => {
                  setPage(0);
                  setStatus(event.target.value);
                }}
                className={`${input} w-40`}
                aria-label="Filter account status"
              >
                <option value="all">All account states</option>
                <option value="new">Not registered</option>
                <option value="inviting">Processing</option>
                <option value="registered">Registered</option>
                <option value="existing">Existing client</option>
              </AppSelect>
              <label className="min-w-40 text-[11px] text-slate-400">
                Received from
                <input
                  type="date"
                  value={receivedFrom}
                  max={receivedTo || undefined}
                  onChange={(event) => {
                    setPage(0);
                    setReceivedFrom(event.target.value);
                  }}
                  className={`${input} mt-1 min-w-40 [color-scheme:dark]`}
                  aria-label="Filter leads received from date"
                />
              </label>
              <label className="min-w-40 text-[11px] text-slate-400">
                Received to
                <input
                  type="date"
                  value={receivedTo}
                  min={receivedFrom || undefined}
                  onChange={(event) => {
                    setPage(0);
                    setReceivedTo(event.target.value);
                  }}
                  className={`${input} mt-1 min-w-40 [color-scheme:dark]`}
                  aria-label="Filter leads received through date"
                />
              </label>
            </div>
            {selectedLeadIds.size > 0 &&
              createPortal(
              <div
                role="region"
                aria-label="Bulk actions"
                className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-h-[calc(100vh-1.5rem)] max-w-5xl flex-wrap items-center gap-2 overflow-y-auto rounded-xl border border-violet-400/30 bg-[#171d29]/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.65)] backdrop-blur sm:inset-x-6 sm:bottom-5 sm:p-4"
              >
                <div className="mr-auto min-w-32 px-1">
                  <div className="text-sm font-semibold text-violet-100">
                    {selectedLeadIds.size} lead
                    {selectedLeadIds.size === 1 ? "" : "s"} selected
                  </div>
                  {bulkProgress && (
                    <div
                      aria-live="polite"
                      className="mt-0.5 text-xs text-violet-300"
                    >
                      Processing {bulkProgress.completed} of {bulkProgress.total}
                    </div>
                  )}
                </div>
                <AppSelect
                  value={bulkAction}
                  onChange={(event) => {
                    setBulkAction(event.target.value as BulkAction);
                    setBulkOwner("");
                  }}
                  disabled={busy === "bulk"}
                  className={`${input} w-full py-2 sm:w-44`}
                  aria-label="Choose bulk action"
                >
                  <option value="">Mass actions</option>
                  <option value="status">Change status</option>
                  {["admin", "desk_manager"].includes(dashboard.actor_role) && (
                    <option value="assign">Assign</option>
                  )}
                  {["admin", "desk_manager"].includes(dashboard.actor_role) && (
                    <option value="unassign">Unassign</option>
                  )}
                  {dashboard.actor_role !== "desk_manager" && (
                    <option value="promote">Promote</option>
                  )}
                  {dashboard.actor_role === "admin" && (
                    <option value="demote">Demote</option>
                  )}
                  {dashboard.actor_role === "admin" && (
                    <option value="delete">Delete</option>
                  )}
                </AppSelect>
                {bulkAction === "status" && (
                  <AppSelect
                    value={bulkDisposition}
                    onChange={(event) =>
                      setBulkDisposition(
                        event.target.value as LeadDisposition,
                      )
                    }
                    disabled={busy === "bulk"}
                    className={`${input} w-full py-2 sm:w-44`}
                    aria-label="Choose new lead status"
                  >
                    {(
                      Object.entries(dispositionLabels) as [
                        LeadDisposition,
                        string,
                      ][]
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </AppSelect>
                )}
                {bulkAction === "assign" && (
                  <AppSelect
                    value={bulkOwner}
                    onChange={(event) => setBulkOwner(event.target.value)}
                    disabled={busy === "bulk"}
                    className={`${input} w-full py-2 sm:w-56`}
                    aria-label="Choose assignment owner"
                  >
                    <option value="">Choose owner</option>
                    {dashboard.owners.map((item) => {
                      const user = Array.isArray(item.users)
                        ? item.users[0]
                        : item.users;
                      const office = dashboard.offices.find(
                        (entry) => entry.id === user?.office_id,
                      );
                      return (
                        <option
                          key={`${item.role}:${item.user_id}`}
                          value={`${item.role}:${item.user_id}`}
                        >
                          {ownerName(item)} · {item.role === "agent" ? "Agent" : "Retention"}
                          {office ? ` · ${office.code}` : ""}
                        </option>
                      );
                    })}
                  </AppSelect>
                )}
                <button
                  type="button"
                  onClick={() => void applyBulkAction()}
                  disabled={
                    !!busy ||
                    !bulkAction ||
                    (bulkAction === "assign" && !bulkOwner)
                  }
                  className={`${button} ${bulkAction === "delete" ? "bg-red-600 text-white hover:bg-red-500" : "bg-violet-600 text-white hover:bg-violet-500"}`}
                >
                  {busy === "bulk" && (
                    <Loader2 size={15} className="animate-spin" />
                  )}
                  {busy === "bulk" ? "Processing" : "Apply"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLeadIds(new Set())}
                  disabled={busy === "bulk"}
                  className={`${button} border border-white/10 text-slate-300 hover:text-white`}
                >
                  Clear
                </button>
              </div>,
              document.body,
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <thead className="border-b border-white/10 bg-[#111723] text-xs text-slate-400">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allCurrentPageSelected}
                        onChange={toggleCurrentPage}
                        disabled={
                          loading || !!busy || dashboard.leads.length === 0
                        }
                        aria-label="Select all leads on this page"
                        className="h-4 w-4 rounded border-white/20 bg-[#0e1420] accent-violet-500"
                      />
                    </th>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Office</th>
                    <th className="px-4 py-3">Assign To</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Received</th>
                    <th className="px-4 py-3">Lead status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07]">
                  {dashboard.leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-white/[0.025]">
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedLeadIds((current) => {
                              const next = new Set(current);
                              if (checked) next.add(lead.id);
                              else next.delete(lead.id);
                              return next;
                            });
                          }}
                          disabled={!!busy}
                          aria-label={`Select ${nameOf(lead)}`}
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-[#0e1420] accent-violet-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">
                          {nameOf(lead)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {lead.email}
                        </div>
                        {lead.campaign && (
                          <div className="mt-1 text-[11px] text-violet-300">
                            {lead.campaign}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        <div>{lead.phone_e164 || lead.phone || "—"}</div>
                        {lead.phone_validation_status === "valid" ? (
                          <div className="mt-1 text-[11px] font-medium text-emerald-300">
                            Correct · {lead.phone_country_code} (+
                            {lead.phone_calling_code})
                          </div>
                        ) : (
                          <div className="mt-1 max-w-52 text-[11px] leading-4 text-red-300">
                            {lead.phone_validation_status === "pending"
                              ? "Not checked yet"
                              : lead.phone_validation_reason ||
                                "Incorrect number"}
                          </div>
                        )}
                        {lead.country && (
                          <div className="mt-1 text-[10px] text-slate-500">
                            Submitted country: {lead.country}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <AppSelect
                          value={lead.office_id || ""}
                          onChange={(event) =>
                            setLeadOffice(lead, event.target.value)
                          }
                          disabled={
                            !!busy ||
                            lead.status !== "new" ||
                            dashboard.actor_role === "desk_manager"
                          }
                          className={`${input} min-w-36 py-2 text-xs`}
                        >
                          <option value="" disabled={staffMode}>
                            No office
                          </option>
                          {dashboard.offices
                            .filter((office) => office.status === "active")
                            .map((office) => (
                              <option key={office.id} value={office.id}>
                                {office.code} · {office.name}
                              </option>
                            ))}
                        </AppSelect>
                        <div
                          className={`mt-1 text-[10px] ${lead.phone_routing_status === "routed" || lead.phone_routing_status === "manual" ? "text-emerald-300" : "text-amber-300"}`}
                        >
                          {lead.phone_routing_status === "routed"
                            ? "Auto-routed by phone"
                            : lead.phone_routing_status === "no_desk_manager"
                              ? "Office has no Desk Manager"
                              : lead.phone_routing_status === "no_office"
                                ? "No Office for detected country"
                                : lead.phone_routing_status === "manual"
                                  ? "Manually classified"
                                  : lead.phone_routing_status === "invalid"
                                    ? "Waiting for phone correction"
                                    : "Routing not checked"}
                        </div>
                        {lead.office_id &&
                          dashboard.desk_managers.filter((manager) => {
                            const user = Array.isArray(manager.users)
                              ? manager.users[0]
                              : manager.users;
                            return user?.office_id === lead.office_id;
                          }).length > 0 && (
                            <div className="mt-1 max-w-52 text-[10px] text-slate-400">
                              Desk:{" "}
                              {dashboard.desk_managers
                                .filter((manager) => {
                                  const user = Array.isArray(manager.users)
                                    ? manager.users[0]
                                    : manager.users;
                                  return user?.office_id === lead.office_id;
                                })
                                .map(deskManagerName)
                                .join(", ")}
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {lead.assignee ? (
                          <>
                            <div className="max-w-44 font-medium text-slate-200">
                              {lead.assignee.name}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-500">
                              {assigneeRoleLabel(lead.assignee.role)}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-500">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        <div>{lead.source_name || "Import"}</div>
                        <div className="text-slate-500">
                          {lead.source_kind.replaceAll("_", " ")}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                        <time
                          dateTime={lead.created_at}
                          title={new Date(lead.created_at).toISOString()}
                        >
                          <span className="block">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                            {new Date(lead.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false,
                            })}
                          </span>
                        </time>
                      </td>
                      <td className="px-4 py-3">
                        <AppSelect
                          value={lead.disposition_status}
                          onChange={(event) =>
                            setLeadDisposition(
                              lead,
                              event.target.value as LeadDisposition,
                            )
                          }
                          disabled={!!busy}
                          className={`${input} min-w-40 border ${dispositionStyles[lead.disposition_status]} py-2 text-xs font-semibold`}
                        >
                          {(
                            Object.entries(dispositionLabels) as [
                              LeadDisposition,
                              string,
                            ][]
                          ).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </AppSelect>
                        <div className="mt-1 text-[10px] text-slate-500">
                          Account:{" "}
                          {lead.status === "new"
                            ? lead.phone_routing_status === "routed"
                              ? lead.registration_error
                                ? "Automatic registration failed"
                                : "Awaiting automatic registration"
                              : "Waiting for valid phone routing"
                            : lead.status === "inviting"
                              ? "Processing"
                              : lead.status === "existing"
                                ? "Existing client"
                                : "Registered"}
                        </div>
                        {lead.registered_user_id &&
                          lead.registered_is_promoted !== null && (
                            <div
                              className={`mt-1 text-[10px] font-medium ${lead.registered_is_promoted ? "text-amber-300" : "text-cyan-300"}`}
                            >
                              Workspace: {lead.registered_is_promoted ? "Retention" : "Sales"}
                            </div>
                          )}
                        {lead.registration_error && (
                          <div className="mt-2 max-w-64 text-[11px] leading-4 text-red-300">
                            Last attempt: {lead.registration_error}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {lead.status === "new" &&
                        lead.phone_routing_status === "routed" &&
                        lead.registration_error ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLead(lead);
                              setOwner("");
                            }}
                            disabled={!!busy}
                            className={`${button} bg-violet-600 text-white hover:bg-violet-500`}
                          >
                            <Send size={14} />
                            Retry
                          </button>
                        ) : lead.status === "new" ? (
                          <span className="text-xs text-slate-500">
                            Automatic
                          </span>
                        ) : lead.status === "inviting" ? (
                          <span className="text-xs text-slate-400">
                            Account creation in progress
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Linked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && dashboard.leads.length === 0 && (
                <div className="p-10 text-center text-sm text-slate-400">
                  No leads match this view yet.
                </div>
              )}
              {loading && (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
                  <Loader2 size={17} className="animate-spin" />
                  Loading leads
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400">
              <span>
                {dashboard.total
                  ? `${page * 50 + 1}–${Math.min((page + 1) * 50, dashboard.total)} of ${dashboard.total}`
                  : "0 leads"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => value - 1)}
                  disabled={page === 0 || loading}
                  className={`${button} border border-white/10 disabled:opacity-40`}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => value + 1)}
                  disabled={(page + 1) * 50 >= dashboard.total || loading}
                  className={`${button} border border-white/10 disabled:opacity-40`}
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          {!staffMode && (
            <aside className="space-y-4">
              <section className={`${panel} p-5`}>
                <div className="mb-3 flex items-center gap-2">
                  <KeyRound size={18} className="text-violet-300" />
                  <h2 className="font-semibold">Affiliate API</h2>
                </div>
                <p className="text-xs leading-5 text-slate-400">
                  A secure server-to-server connection for delivering leads and
                  following partner-facing status changes without receiving CRM
                  access.
                </p>
                <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.07] p-3 text-xs leading-5 text-emerald-100">
                  <b>What to send:</b> download the integration guide, then
                  provide the one-time key through a separate secure secret
                  channel. Documentation and code examples never contain the
                  real key.
                </div>
                <button
                  type="button"
                  onClick={() => setShowAffiliateDocs(true)}
                  className={`${button} mt-4 w-full border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20`}
                >
                  <BookOpen size={16} />
                  View full integration guide
                </button>
                <div className="my-4 border-t border-white/10" />
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Create a private key
                </label>
                <form onSubmit={createAffiliate} className="flex gap-2">
                  <input
                    required
                    maxLength={100}
                    value={affiliateName}
                    onChange={(event) => setAffiliateName(event.target.value)}
                    placeholder="Affiliate or partner name"
                    className={input}
                  />
                  <button
                    type="submit"
                    disabled={!!busy}
                    aria-label="Create affiliate key"
                    className={`${button} bg-violet-600 text-white hover:bg-violet-500`}
                  >
                    <Plus size={16} />
                  </button>
                </form>
                <p className="mt-2 text-[11px] leading-4 text-amber-200/80">
                  The secret key is displayed once. Create a different key for
                  each affiliate.
                </p>
              </section>
              <section className={`${panel} p-5`}>
                <div className="mb-4 flex items-center gap-2">
                  <Link2 size={18} className="text-violet-300" />
                  <h2 className="font-semibold">Google Sheet</h2>
                </div>
                <p className="mb-4 text-xs leading-5 text-slate-400">
                  Connect a Google Sheet that can be exported as CSV. The server
                  checks active sheets every 10 minutes.
                </p>
                <form onSubmit={createSheet} className="space-y-2.5">
                  <input
                    required
                    maxLength={100}
                    value={sheetName}
                    onChange={(event) => setSheetName(event.target.value)}
                    placeholder="Sheet name"
                    className={input}
                  />
                  <input
                    required
                    type="url"
                    value={sheetUrl}
                    onChange={(event) => setSheetUrl(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className={input}
                  />
                  <button
                    type="submit"
                    disabled={!!busy}
                    className={`${button} w-full bg-violet-600 text-white hover:bg-violet-500`}
                  >
                    <Plus size={16} />
                    Connect and sync
                  </button>
                </form>
              </section>
              <section className={`${panel} p-5`}>
                <div className="mb-4 flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-violet-300" />
                  <h2 className="font-semibold">Import a file</h2>
                </div>
                <p className="mb-4 text-xs leading-5 text-slate-400">
                  Upload CSV or Excel .xlsx with an Email column. International
                  phone numbers are validated and routed automatically.
                </p>
                <label
                  className={`${button} w-full cursor-pointer border border-white/15 text-slate-200 hover:border-violet-400/40`}
                >
                  <Upload size={16} />
                  {busy === "import"
                    ? "Importing..."
                    : "Choose CSV or Excel file"}
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    className="sr-only"
                    disabled={!!busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) importFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </section>
              <section className={`${panel} overflow-hidden`}>
                <div className="border-b border-white/10 px-5 py-4">
                  <h2 className="font-semibold">Connections</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Rename, pause, rotate, or delete an Affiliate API
                    connection.
                  </p>
                </div>
                {dashboard.sources.length === 0 ? (
                  <div className="px-5 py-6 text-xs text-slate-400">
                    No connections yet.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.07]">
                    {dashboard.sources.map((source) => (
                      <div key={source.id} className="p-4">
                        {editingAffiliateId === source.id ? (
                          <form
                            onSubmit={(event) => renameAffiliate(event, source)}
                            className="flex items-center gap-2"
                          >
                            <input
                              autoFocus
                              required
                              maxLength={100}
                              value={editingAffiliateName}
                              onChange={(event) =>
                                setEditingAffiliateName(event.target.value)
                              }
                              aria-label={`New name for ${source.name}`}
                              className={`${input} min-w-0 flex-1 py-2`}
                            />
                            <button
                              type="submit"
                              disabled={!!busy || !editingAffiliateName.trim()}
                              className={`${button} border border-emerald-400/25 p-2 text-emerald-300 hover:bg-emerald-500/10`}
                              aria-label="Save affiliate name"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAffiliateId(null);
                                setEditingAffiliateName("");
                              }}
                              disabled={!!busy}
                              className={`${button} border border-white/10 p-2 text-slate-400 hover:text-white`}
                              aria-label="Cancel affiliate rename"
                            >
                              <X size={15} />
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-semibold">
                                  {source.name}
                                </div>
                                {source.kind === "affiliate_api" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingAffiliateId(source.id);
                                      setEditingAffiliateName(source.name);
                                      setConfirmRotate(null);
                                      setError(null);
                                      setNotice(null);
                                    }}
                                    disabled={!!busy}
                                    className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-violet-300 disabled:opacity-50"
                                    aria-label={`Edit ${source.name} name`}
                                    title="Edit affiliate name"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                )}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {source.kind === "google_sheet"
                                  ? "Google Sheet"
                                  : "Affiliate API"}{" "}
                                · {source.active ? "Active" : "Paused"}
                              </div>
                            </div>
                            <span
                              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${source.active ? "bg-emerald-400" : "bg-slate-600"}`}
                            />
                          </div>
                        )}
                        {source.last_synced_at && (
                          <div className="mt-2 text-[11px] text-slate-500">
                            Last sync{" "}
                            {new Date(source.last_synced_at).toLocaleString()}
                          </div>
                        )}
                        {source.last_sync_error && (
                          <div className="mt-2 text-xs text-amber-300">
                            {source.last_sync_error}
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {source.kind === "google_sheet" && (
                            <button
                              type="button"
                              onClick={() => syncSource(source)}
                              disabled={!!busy || !source.active}
                              className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}
                            >
                              <RefreshCw size={13} />
                              Sync now
                            </button>
                          )}
                          {source.kind === "affiliate_api" &&
                            (confirmRotate === source.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRotate(null)}
                                  className={`${button} text-xs text-slate-400`}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rotateKey(source)}
                                  disabled={!!busy}
                                  className={`${button} bg-amber-500/15 text-xs text-amber-200`}
                                >
                                  Confirm rotation
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRotate(source.id)}
                                disabled={!!busy}
                                className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}
                              >
                                <KeyRound size={13} />
                                Rotate key
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => toggleSource(source)}
                            disabled={!!busy}
                            className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}
                          >
                            {source.active ? "Pause" : "Activate"}
                          </button>
                          {source.kind === "affiliate_api" && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmRotate(null);
                                setDeleteAffiliate(source);
                              }}
                              disabled={!!busy}
                              className={`${button} border border-red-400/20 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200`}
                            >
                              <Trash2 size={13} />
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          )}
        </div>

        {deleteAffiliate && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-affiliate-title"
              className="w-full max-w-2xl rounded-2xl border border-red-400/25 bg-[#171e2b] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-red-300">
                    <AlertTriangle size={19} />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Permanent deletion
                    </span>
                  </div>
                  <h2
                    id="delete-affiliate-title"
                    className="mt-1 text-xl font-bold text-white"
                  >
                    Delete {deleteAffiliate.name}?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Choose what happens to the Lead Inbox records received from
                    this affiliate. The affiliate key will stop working
                    immediately with either option.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteAffiliate(null)}
                  disabled={!!busy}
                  aria-label="Cancel affiliate deletion"
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => deleteAffiliateSource(false)}
                  disabled={!!busy}
                  className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-4 text-left transition hover:bg-amber-500/10 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 font-semibold text-amber-100">
                    <Trash2 size={17} />
                    Delete affiliate only
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    Deletes the connection and API key but keeps every existing
                    lead record in the Lead Inbox.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => deleteAffiliateSource(true)}
                  disabled={!!busy}
                  className="rounded-xl border border-red-400/30 bg-red-500/[0.08] p-4 text-left transition hover:bg-red-500/15 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 font-semibold text-red-100">
                    <Trash2 size={17} />
                    Delete affiliate and leads
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    Deletes the connection, API key, and all Lead Inbox records
                    linked to this affiliate.
                  </p>
                </button>
              </div>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-400">
                <b className="text-slate-200">
                  Client accounts are always preserved.
                </b>{" "}
                If a linked lead was already registered as a client, this
                deletion never removes that client’s login, wallet, funds, or
                trading data.
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteAffiliate(null)}
                  disabled={!!busy}
                  className={`${button} border border-white/10 text-slate-300 hover:text-white`}
                >
                  Cancel
                </button>
              </div>
            </section>
          </div>
        )}

        {showAffiliateDocs && (
          <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 p-3 sm:p-6">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="affiliate-docs-title"
              className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[#171e2b] shadow-2xl"
            >
              <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#171e2b]/95 px-5 py-4 backdrop-blur sm:px-7">
                <div>
                  <div className="flex items-center gap-2 text-violet-300">
                    <BookOpen size={19} />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Technical documentation
                    </span>
                  </div>
                  <h2
                    id="affiliate-docs-title"
                    className="mt-1 text-xl font-bold text-white"
                  >
                    Affiliate Lead API integration guide
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Submit leads securely and follow every partner-facing status
                    change.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAffiliateDocs(false)}
                  aria-label="Close documentation"
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                >
                  <X size={20} />
                </button>
              </header>
              <div className="space-y-7 px-5 py-6 text-sm text-slate-300 sm:px-7">
                {secret ? (
                  <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                    <h3 className="flex items-center gap-2 font-semibold text-emerald-100">
                      <Send size={17} />
                      Ready to send to {secret.name}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-emerald-50/80">
                      This guide never contains the private key. Download it,
                      then copy the one-time key separately into the affiliate’s
                      server-side secret manager. Never place the key in source
                      code, screenshots, documentation, or logs.
                    </p>
                  </section>
                ) : (
                  <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                    <h3 className="flex items-center gap-2 font-semibold text-amber-100">
                      <KeyRound size={17} />
                      Documentation preview only — do not send yet
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-amber-50/80">
                      The value{" "}
                      <span className="font-mono">YOUR_AFFILIATE_KEY</span> is
                      only a placeholder. Close this guide, create a private key
                      using the affiliate’s name, copy it to a server-side
                      secret manager, and download the key-free guide.
                    </p>
                  </section>
                )}
                <section>
                  <h3 className="font-semibold text-white">
                    What this API does
                  </h3>
                  <p className="mt-2 max-w-4xl leading-6 text-slate-400">
                    This server-to-server API accepts prospective client details
                    and returns an opaque tracking ID for every visible record.
                    The same private key can read current partner-facing states
                    and an ordered event feed whenever CRM staff change a lead.
                    It does not give the affiliate CRM access or expose internal
                    notes, staff, balances, or deposit amounts.
                  </p>
                </section>

                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    [
                      "1",
                      "Create a connection",
                      "Enter the affiliate name and generate a private key. Use a separate key for every partner.",
                    ],
                    [
                      "2",
                      "Send the documentation",
                      "Give the affiliate this guide, endpoint, and their key through a secure channel.",
                    ],
                    [
                      "3",
                      "Submit and store IDs",
                      "Every accepted record returns a tracking ID that should be stored beside the affiliate reference.",
                    ],
                    [
                      "4",
                      "Follow status events",
                      "Poll the cursor-based event feed from the affiliate backend and update its dashboard in seconds.",
                    ],
                  ].map(([number, title, description]) => (
                    <div
                      key={number}
                      className="rounded-xl border border-white/10 bg-white/[0.025] p-4"
                    >
                      <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-200">
                        {number}
                      </div>
                      <h4 className="font-semibold text-white">{title}</h4>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {description}
                      </p>
                    </div>
                  ))}
                </section>

                <section>
                  <h3 className="font-semibold text-white">
                    Endpoints and authentication
                  </h3>
                  <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-[#0d1118] p-4 font-mono text-xs">
                    <div>
                      <span className="mr-3 rounded bg-emerald-500/15 px-2 py-1 font-sans font-bold text-emerald-300">
                        POST
                      </span>
                      <span className="break-all text-slate-200">{apiUrl}</span>
                      <p className="mt-1 pl-[58px] font-sans text-[11px] text-slate-500">
                        Submit one lead or a batch of up to 100.
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <span className="mr-3 rounded bg-cyan-500/15 px-2 py-1 font-sans font-bold text-cyan-300">
                        GET
                      </span>
                      <span className="break-all text-slate-200">
                        {apiUrl}/status?tracking_id=TRACKING_UUID
                      </span>
                      <p className="mt-1 pl-[51px] font-sans text-[11px] text-slate-500">
                        Read the latest state of one or more leads.
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <span className="mr-3 rounded bg-cyan-500/15 px-2 py-1 font-sans font-bold text-cyan-300">
                        GET
                      </span>
                      <span className="break-all text-slate-200">
                        {apiUrl}/events?after=0&amp;limit=100
                      </span>
                      <p className="mt-1 pl-[51px] font-sans text-[11px] text-slate-500">
                        Read every ordered change after a saved cursor.
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-3 text-slate-300">
                      POST Content-Type: application/json
                    </div>
                    <div className="break-all text-slate-300">
                      All routes: x-affiliate-key: YOUR_AFFILIATE_KEY
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-amber-200">
                    Keep the real value in a server-side secret named
                    AFFILIATE_API_KEY. It is never embedded in this guide.
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-white">Request fields</h3>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="bg-white/[0.04] text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Field</th>
                          <th className="px-4 py-3">Required</th>
                          <th className="px-4 py-3">Limit</th>
                          <th className="px-4 py-3">Meaning</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.07]">
                        {[
                          [
                            "email",
                            "Yes",
                            "254",
                            "Valid email address; converted to lowercase and used for duplicate detection.",
                          ],
                          ["first_name", "No", "100", "Lead’s first name."],
                          ["last_name", "No", "100", "Lead’s last name."],
                          [
                            "full_name",
                            "No",
                            "200",
                            "Alternative to first_name and last_name.",
                          ],
                          [
                            "phone",
                            "No",
                            "60",
                            "International number beginning with + or 00; validated and routed by detected country.",
                          ],
                          [
                            "country",
                            "No",
                            "100",
                            "Affiliate-provided country metadata; the detected phone country controls routing.",
                          ],
                          [
                            "office",
                            "No",
                            "100",
                            "Affiliate-provided Office metadata; it does not override phone routing.",
                          ],
                          [
                            "campaign",
                            "No",
                            "120",
                            "Campaign or marketing source label.",
                          ],
                          [
                            "notes",
                            "No",
                            "2,000",
                            "Additional lead information.",
                          ],
                          [
                            "external_id",
                            "Recommended",
                            "120",
                            "Affiliate’s own unique reference for status lookup; it is not used for email duplicate detection.",
                          ],
                        ].map((row) => (
                          <tr key={row[0]}>
                            <td className="px-4 py-3 font-mono text-violet-200">
                              {row[0]}
                            </td>
                            <td className="px-4 py-3">{row[1]}</td>
                            <td className="px-4 py-3">{row[2]}</td>
                            <td className="px-4 py-3 text-slate-400">
                              {row[3]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    The validated phone country controls Office routing: +49 →
                    DE, +33 → FR, +34 → ES and +39 → IT when those active Office
                    mappings and Desk Managers exist. Routed leads create or
                    link their client accounts automatically. Invalid or
                    missing numbers go to{" "}
                    <b>Incorrect numbers</b>. Valid countries without an Office
                    or Desk Manager go to <b>Routing review</b>. Submitted
                    country or office text cannot override the detected number.
                  </p>
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="font-semibold text-white">
                      Single-lead JSON
                    </h3>
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                      <code>{`{
  "email": "jane@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "phone": "+49 30 901820",
  "country": "DE",
  "campaign": "Spring campaign",
  "notes": "Requested a callback",
  "external_id": "partner-123"
}`}</code>
                    </pre>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      Batch JSON (1–100 leads)
                    </h3>
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                      <code>{`{
  "leads": [
    {
      "email": "jane@example.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "external_id": "partner-123"
    },
    {
      "email": "john@example.com",
      "first_name": "John",
      "external_id": "partner-124"
    }
  ]
}`}</code>
                    </pre>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-white">cURL example</h3>
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                    <code>{`curl --request POST '${apiUrl}' \\
  --header 'Content-Type: application/json' \\
  --header 'x-affiliate-key: YOUR_AFFILIATE_KEY' \\
  --data '{"email":"jane@example.com","first_name":"Jane","last_name":"Doe","phone":"+49 30 901820","country":"DE","campaign":"Spring campaign","external_id":"partner-123"}'`}</code>
                  </pre>
                </section>

                <section>
                  <h3 className="font-semibold text-white">
                    JavaScript / Node.js example
                  </h3>
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                    <code>{`const response = await fetch('${apiUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-affiliate-key': process.env.AFFILIATE_API_KEY
  },
  body: JSON.stringify({
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+49 30 901820',
    country: 'DE',
    campaign: 'Spring campaign',
    external_id: 'partner-123'
  })
});

const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Lead submission failed');`}</code>
                  </pre>
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="font-semibold text-white">
                      Successful response
                    </h3>
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                      <code>{`HTTP 200
{
  "accepted": 1,
  "duplicates": 0,
  "invalid": 0,
  "results": [
    {
      "outcome": "accepted",
      "tracking_id": "8a3f63f4-87f5-4dad-b16f-91af0c8d8c14",
      "external_id": "partner-123",
      "status": "received",
      "reason_code": null,
      "account_status": "new",
      "received_at": "2026-09-29T10:42:18.000Z",
      "updated_at": "2026-09-29T10:42:18.000Z"
    }
  ]
}`}</code>
                    </pre>
                    <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-400">
                      <li>
                        <span className="font-mono text-slate-300">
                          accepted
                        </span>
                        : new leads saved
                      </li>
                      <li>
                        <span className="font-mono text-slate-300">
                          duplicates
                        </span>
                        : valid emails already present or repeated in the
                        request
                      </li>
                      <li>
                        <span className="font-mono text-slate-300">
                          invalid
                        </span>
                        : entries without a valid email
                      </li>
                      <li>
                        <span className="font-mono text-slate-300">
                          results
                        </span>
                        : trackable records owned by this affiliate connection
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">HTTP errors</h3>
                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 text-xs">
                      <div className="grid grid-cols-[60px_1fr] gap-3 border-b border-white/[0.07] px-4 py-3">
                        <b className="text-amber-200">400</b>
                        <span className="text-slate-400">
                          Malformed JSON, invalid query, empty batch, or over
                          100 leads
                        </span>
                      </div>
                      <div className="grid grid-cols-[60px_1fr] gap-3 border-b border-white/[0.07] px-4 py-3">
                        <b className="text-amber-200">401</b>
                        <span className="text-slate-400">
                          Missing, invalid, paused, rotated, or unknown key
                        </span>
                      </div>
                      <div className="grid grid-cols-[60px_1fr] gap-3 border-b border-white/[0.07] px-4 py-3">
                        <b className="text-amber-200">405</b>
                        <span className="text-slate-400">
                          Unsupported method and route combination
                        </span>
                      </div>
                      <div className="grid grid-cols-[60px_1fr] gap-3 border-b border-white/[0.07] px-4 py-3">
                        <b className="text-amber-200">413</b>
                        <span className="text-slate-400">
                          Request body is larger than 500,000 characters
                        </span>
                      </div>
                      <div className="grid grid-cols-[60px_1fr] gap-3 px-4 py-3">
                        <b className="text-amber-200">500</b>
                        <span className="text-slate-400">
                          Temporary server error; retry later
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.05] p-5">
                  <div className="flex items-start gap-3">
                    <RefreshCw
                      size={19}
                      className="mt-0.5 shrink-0 text-cyan-300"
                    />
                    <div>
                      <h3 className="font-semibold text-cyan-100">
                        Live status system
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        The affiliate backend reads an ordered cursor feed every
                        five seconds. When a CRM status changes, a new event
                        appears automatically. Saving the cursor makes
                        reconnects safe and prevents missed changes. Every event
                        also reports whether an actual first deposit exists and
                        its exact wallet-credit time.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      "received",
                      "contact_attempted",
                      "follow_up",
                      "invalid",
                      "not_qualified",
                      "processing",
                      "registered",
                      "converted",
                    ].map((statusName) => (
                      <span
                        key={statusName}
                        className="rounded-md border border-cyan-300/15 bg-black/15 px-2 py-1 font-mono text-[10px] text-cyan-100/80"
                      >
                        {statusName}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="font-semibold text-white">
                      Current status lookup
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Use either the returned tracking ID or the affiliate’s
                      external reference. The key always limits results to that
                      affiliate connection.
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                      <code>{`curl --request GET \\
  '${apiUrl}/status?tracking_id=TRACKING_UUID' \\
  --header 'x-affiliate-key: YOUR_AFFILIATE_KEY'`}</code>
                    </pre>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      Ordered event response
                    </h3>
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                      <code>{`{
  "events": [{
    "cursor": 42,
    "type": "lead.status_changed",
    "tracking_id": "8a3f63f4-87f5-4dad-b16f-91af0c8d8c14",
    "external_id": "partner-123",
    "status": "follow_up",
    "reason_code": null,
    "ftd_status": false,
    "ftd_date": null,
    "ftd_source": null,
    "lead_received_at": "2026-09-28T09:20:00.000Z",
    "occurred_at": "2026-09-29T11:18:04.000Z"
  }],
  "next_cursor": 42,
  "has_more": false
}`}</code>
                    </pre>
                  </div>
                </section>

                <section className="rounded-xl border border-violet-400/20 bg-violet-500/[0.05] p-5">
                  <h3 className="font-semibold text-violet-100">
                    Date-range and FTD reporting
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    Date-only ranges include the complete UTC day. The default
                    filters event time; select lead or FTD time explicitly when
                    producing acquisition and conversion reports.
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                    <code>{`# Event changes in the period
GET ${apiUrl}/events?from=2026-09-01&to=2026-09-29&after=0&limit=100

# Leads generated in the period
GET ${apiUrl}/events?date_field=lead&from=2026-09-01&to=2026-09-29&after=0&limit=100

# Exact first deposits in the period
GET ${apiUrl}/events?date_field=ftd&from=2026-09-01&to=2026-09-29&after=0&limit=100`}</code>
                  </pre>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    <span className="font-mono text-violet-200">ftd_date</span>{" "}
                    comes from the first qualifying completed wallet credit. It
                    is never inferred from the editable CRM status timestamp.
                    Automatic FTD requires one credited amount of at least 250
                    USD/USDT equivalent. A staff member can still mark FTD
                    manually; that reports a manual source and keeps the date
                    null until a qualifying deposit exists. Legacy rows without
                    an authoritative credit time are excluded instead of
                    receiving an invented FTD date.
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-white">
                    Working Node.js live monitor
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Run this on the affiliate’s server. Replace the example
                    persistence comments with database updates and store the
                    latest cursor durably.
                  </p>
                  <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300">
                    <code>{`const endpoint = '${apiUrl}';
const headers = {
  'x-affiliate-key': process.env.AFFILIATE_API_KEY
};
let cursor = Number(process.env.LAST_AFFILIATE_CURSOR || 0);

for (;;) {
  const response = await fetch(
    endpoint + '/events?after=' + cursor + '&limit=100',
    { headers }
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Status feed failed');
  }

  for (const event of payload.events) {
    console.log(
      event.external_id,
      event.status,
      event.ftd_status,
      event.ftd_date,
      event.occurred_at
    );
    // Update the affiliate database idempotently by event.cursor.
    cursor = event.cursor;
  }

  // Persist cursor after the batch succeeds.
  if (!payload.has_more) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}`}</code>
                  </pre>
                  <div className="mt-3 grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
                    <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                      <b className="text-slate-200">Backlog:</b> when{" "}
                      <span className="font-mono">has_more</span> is true,
                      request the next page immediately.
                    </p>
                    <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                      <b className="text-slate-200">Reconnect:</b> restart from
                      the last cursor successfully stored by the affiliate.
                    </p>
                  </div>
                </section>

                <section className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-amber-100">
                    <ShieldCheck size={17} />
                    Security and delivery rules
                  </h3>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-5 text-slate-300">
                    <li>
                      Call every endpoint from the affiliate’s backend/server,
                      not from browser JavaScript.
                    </li>
                    <li>
                      Never expose the key in a website, mobile app, URL, query
                      string, log, or public repository.
                    </li>
                    <li>
                      The key is shown only once and should be stored as a
                      secret environment variable.
                    </li>
                    <li>
                      Email is the duplicate key within the destination company.
                      Use a unique{" "}
                      <span className="font-mono">external_id</span> and store
                      the returned{" "}
                      <span className="font-mono">tracking_id</span>.
                    </li>
                    <li>
                      Process events idempotently by cursor and persist the
                      cursor only after the related updates succeed.
                    </li>
                    <li>
                      Pausing a connection or rotating its key stops submission
                      and status access immediately.
                    </li>
                    <li>
                      A 500 response may be retried. If the original submission
                      was saved, the retry is safely reported as a duplicate.
                    </li>
                  </ul>
                </section>
              </div>
              <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-white/10 bg-[#171e2b]/95 px-5 py-4 backdrop-blur sm:px-7">
                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(
                      affiliateDocumentation(apiUrl),
                      "Affiliate integration guide copied.",
                    )
                  }
                  className={`${button} border border-white/15 text-slate-200 hover:bg-white/5`}
                >
                  <Copy size={15} />
                  Copy integration guide
                </button>
                {secret && (
                  <button
                    type="button"
                    onClick={downloadAffiliateDocs}
                    className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}
                  >
                    <Download size={15} />
                    Download integration guide
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAffiliateDocs(false)}
                  className={`${button} ${secret ? "border border-white/15 text-slate-200" : "bg-violet-600 text-white hover:bg-violet-500"}`}
                >
                  Done
                </button>
              </footer>
            </section>
          </div>
        )}

        {secret && !showAffiliateDocs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="affiliate-key-title"
              className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#171e2b] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="affiliate-key-title"
                    className="text-lg font-semibold"
                  >
                    {secret.name} affiliate package
                  </h2>
                  <p className="mt-1 text-sm text-amber-200">
                    The private key is shown only now. Copy it to a secure
                    server-side secret before closing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSecret(null)}
                  aria-label="Close"
                  className="text-slate-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-100">
                  <Send size={17} />
                  Key-free integration guide
                </div>
                <p className="mt-2 text-xs leading-5 text-emerald-50/80">
                  Download the guide below. Send the private key separately
                  through a secure secret channel and store it only as the
                  affiliate backend’s AFFILIATE_API_KEY environment secret.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadAffiliateDocs}
                className={`${button} mt-4 w-full bg-emerald-600 py-3 text-white hover:bg-emerald-500`}
              >
                <Download size={17} />
                Download integration guide
              </button>
              <button
                type="button"
                onClick={() => setShowAffiliateDocs(true)}
                className={`${button} mt-2 w-full border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20`}
              >
                <BookOpen size={16} />
                Review package before sending
              </button>
              <details className="mt-4 rounded-lg border border-white/10 bg-[#0d1118] p-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-300">
                  Show or copy private key separately
                </summary>
                <div className="mt-3 break-all rounded-lg bg-black/20 p-3 font-mono text-xs text-white">
                  {secret.key}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void copyToClipboard(secret.key, "Affiliate key copied.")
                  }
                  className={`${button} mt-2 w-full border border-white/10 text-slate-200 hover:bg-white/5`}
                >
                  <Clipboard size={16} />
                  Copy key only
                </button>
              </details>
              <p className="mt-3 text-center text-[11px] leading-4 text-slate-500">
                Do not send a screenshot. The downloaded guide never contains
                the private key.
              </p>
            </section>
          </div>
        )}

        {selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="register-lead-title"
              className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#171e2b] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2
                    id="register-lead-title"
                    className="text-lg font-semibold"
                  >
                    Retry automatic registration
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {nameOf(selectedLead)} · {selectedLead.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  disabled={!!busy}
                  aria-label="Close"
                  className="text-slate-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-5 rounded-lg border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-slate-200">
                <ShieldCheck size={18} className="mb-2 text-violet-300" />
                Creates an unpromoted Sales client in{" "}
                {dashboard.offices.find(
                  (item) => item.id === selectedLead.office_id,
                )?.code || "No office"}
                {selectedLead.phone_routing_status === "routed" &&
                  selectedLead.phone_calling_code
                  ? `, automatically routed from +${selectedLead.phone_calling_code}`
                  : ""}
                .{" "}
                {selectedLeadDeskManagers.length > 0
                  ? `The client will be available to ${selectedLeadDeskManagers.map(deskManagerName).join(", ")}. `
                  : ""}
                Retention assignment becomes available only after promotion.
              </div>
              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
                >
                  {error}
                </div>
              )}
              <label className="mt-5 block text-xs font-medium text-slate-300">
                Assign same-Office sales agent{" "}
                <span className="font-normal text-slate-500">(optional)</span>
                <AppSelect
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  className={`mt-1.5 ${input}`}
                >
                  <option value="">Unassigned</option>
                  {dashboard.owners
                    .filter((item) => {
                      const user = Array.isArray(item.users)
                        ? item.users[0]
                        : item.users;
                      return (
                        item.role === "agent" &&
                        (user?.office_id || "") ===
                          (selectedLead.office_id || "")
                      );
                    })
                    .map((item) => (
                      <option
                        key={item.user_id}
                        value={`agent:${item.user_id}`}
                      >
                        {ownerName(item)}
                      </option>
                    ))}
                </AppSelect>
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  disabled={!!busy}
                  className={`${button} border border-white/10 text-slate-300`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={registerLead}
                  disabled={!!busy}
                  className={`${button} bg-violet-600 text-white hover:bg-violet-500`}
                >
                  {busy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Retry creation
                </button>
              </div>
            </section>
          </div>
        )}

        {confirmBulkDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="bulk-delete-title"
              aria-describedby="bulk-delete-description"
              className="w-full max-w-md rounded-2xl border border-red-400/25 bg-[#171e2b] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-red-500/15 p-2 text-red-300">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 id="bulk-delete-title" className="text-lg font-semibold">
                    Delete {selectedLeadIds.size} selected lead
                    {selectedLeadIds.size === 1 ? "" : "s"}?
                  </h2>
                  <p
                    id="bulk-delete-description"
                    className="mt-2 text-sm leading-6 text-slate-400"
                  >
                    This permanently removes the selected Lead Inbox records.
                    Linked client accounts are preserved. Leads with account
                    creation currently in progress will not be deleted.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  disabled={busy === "bulk"}
                  className={`${button} border border-white/10 text-slate-300 hover:text-white`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void applyBulkAction(true)}
                  disabled={busy === "bulk"}
                  className={`${button} bg-red-600 text-white hover:bg-red-500`}
                >
                  {busy === "bulk" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  Delete {selectedLeadIds.size} lead
                  {selectedLeadIds.size === 1 ? "" : "s"}
                </button>
              </div>
            </section>
          </div>
        )}

        {confirmBulkUnassign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="bulk-unassign-title"
              aria-describedby="bulk-unassign-description"
              className="w-full max-w-md rounded-2xl border border-amber-400/25 bg-[#171e2b] p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-amber-500/15 p-2 text-amber-300">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 id="bulk-unassign-title" className="text-lg font-semibold">
                    Unassign {selectedLeadIds.size} selected lead
                    {selectedLeadIds.size === 1 ? "" : "s"}?
                  </h2>
                  <p
                    id="bulk-unassign-description"
                    className="mt-2 text-sm leading-6 text-slate-400"
                  >
                    This removes the current Agent assignment from every
                    selected lead. The leads remain available in your permitted
                    Desk Manager scope.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmBulkUnassign(false)}
                  disabled={busy === "bulk"}
                  className={`${button} border border-white/10 text-slate-300 hover:text-white`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void applyBulkAction(true)}
                  disabled={busy === "bulk"}
                  className={`${button} bg-amber-600 text-white hover:bg-amber-500`}
                >
                  {busy === "bulk" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Users size={16} />
                  )}
                  Unassign {selectedLeadIds.size} lead
                  {selectedLeadIds.size === 1 ? "" : "s"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
