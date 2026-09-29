import { assertEquals } from "jsr:@std/assert@1";
import {
  affiliateEndpoint,
  parseAffiliateEventQuery,
} from "./affiliateEvents.ts";

Deno.test("recognizes only the existing affiliate routes", () => {
  assertEquals(affiliateEndpoint("/functions/v1/affiliate-leads"), "submit");
  assertEquals(
    affiliateEndpoint("/functions/v1/affiliate-leads/events"),
    "events",
  );
  assertEquals(
    affiliateEndpoint("/functions/v1/affiliate-leads/events/"),
    "events",
  );
  assertEquals(
    affiliateEndpoint("/functions/v1/affiliate-leads/status"),
    "status",
  );
  assertEquals(
    affiliateEndpoint("/functions/v1/affiliate-leads/events/unknown"),
    null,
  );
});

Deno.test("keeps cursor pagination and caps large limits", () => {
  const parsed = parseAffiliateEventQuery(
    new URL("https://example.test/affiliate-leads/events?after=41&limit=5000"),
  );
  assertEquals(parsed, {
    after: 41,
    limit: 100,
    from: null,
    to: null,
    dateField: "event",
  });
});

Deno.test("normalizes inclusive date-only ranges", () => {
  const parsed = parseAffiliateEventQuery(
    new URL(
      "https://example.test/affiliate-leads/events?from=2026-09-01&to=2026-09-29&date_field=ftd",
    ),
  );
  assertEquals(parsed, {
    after: 0,
    limit: 100,
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-29T23:59:59.999Z",
    dateField: "ftd",
  });
});

Deno.test("accepts timezone timestamps and one-sided ranges", () => {
  const parsed = parseAffiliateEventQuery(
    new URL(
      "https://example.test/affiliate-leads/events?from=2026-09-18T14:32:10%2B02:00",
    ),
  );
  assertEquals(parsed, {
    after: 0,
    limit: 100,
    from: "2026-09-18T12:32:10.000Z",
    to: null,
    dateField: "event",
  });
});

Deno.test(
  "rejects invalid cursors, limits, dates, fields, and reversed ranges",
  () => {
    for (const query of [
      "after=-1",
      "after=1.5",
      "limit=0",
      "limit=abc",
      "from=2026-02-30",
      "to=September-29",
      "date_field=created",
      "from=2026-09-30&to=2026-09-01",
    ]) {
      const parsed = parseAffiliateEventQuery(
        new URL(`https://example.test/affiliate-leads/events?${query}`),
      );
      assertEquals("error" in parsed, true, query);
    }
  },
);
