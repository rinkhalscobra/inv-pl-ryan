export type AffiliateEndpoint = "submit" | "status" | "events";
export type AffiliateEventDateField = "event" | "lead" | "ftd";

export type AffiliateEventQuery = {
  after: number;
  limit: number;
  from: string | null;
  to: string | null;
  dateField: AffiliateEventDateField;
};

export function affiliateEndpoint(pathname: string): AffiliateEndpoint | null {
  const segments = pathname.split("/").filter(Boolean);
  const functionIndex = segments.lastIndexOf("affiliate-leads");
  if (functionIndex < 0) return null;
  const suffix = segments.slice(functionIndex + 1);
  if (suffix.length === 0) return "submit";
  if (suffix.length === 1 && suffix[0] === "status") return "status";
  if (suffix.length === 1 && suffix[0] === "events") return "events";
  return null;
}

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const timestampWithZone =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

function parseDateBound(value: string, endOfDay: boolean): string | null {
  if (dateOnly.test(value)) {
    const start = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      start.toISOString().slice(0, 10) !== value
    )
      return null;
    if (!endOfDay) return start.toISOString();
    return new Date(start.getTime() + 86_400_000 - 1).toISOString();
  }
  if (!timestampWithZone.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseAffiliateEventQuery(
  url: URL,
): AffiliateEventQuery | { error: string } {
  const afterText = (url.searchParams.get("after") || "0").trim();
  const after = Number(afterText);
  if (!Number.isSafeInteger(after) || after < 0)
    return { error: "after must be a non-negative event cursor" };

  const limitText = (url.searchParams.get("limit") || "100").trim();
  const parsedLimit = Number(limitText);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1)
    return { error: "limit must be a positive integer" };
  const limit = Math.min(parsedLimit, 100);

  const dateFieldText = (url.searchParams.get("date_field") || "event")
    .trim()
    .toLowerCase();
  if (!["event", "lead", "ftd"].includes(dateFieldText))
    return { error: "date_field must be event, lead, or ftd" };
  const dateField = dateFieldText as AffiliateEventDateField;

  const fromText = (url.searchParams.get("from") || "").trim();
  const toText = (url.searchParams.get("to") || "").trim();
  const from = fromText ? parseDateBound(fromText, false) : null;
  const to = toText ? parseDateBound(toText, true) : null;
  if (fromText && !from)
    return {
      error: "from must be YYYY-MM-DD or an ISO-8601 timestamp with timezone",
    };
  if (toText && !to)
    return {
      error: "to must be YYYY-MM-DD or an ISO-8601 timestamp with timezone",
    };
  if (from && to && Date.parse(from) > Date.parse(to))
    return { error: "from must be earlier than or equal to to" };

  return { after, limit, from, to, dateField };
}
