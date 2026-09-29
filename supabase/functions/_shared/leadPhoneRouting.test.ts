import { assertEquals } from "jsr:@std/assert@1";
import {
  classifyInternationalPhone,
  routePhoneToOffice,
} from "./leadPhoneRouting.ts";

Deno.test("classifies supported international phone formats", () => {
  const plusFormat = classifyInternationalPhone("+49 456 2353");
  assertEquals(plusFormat.phone_validation_status, "valid");
  assertEquals(plusFormat.phone_country_code, "DE");
  assertEquals(plusFormat.phone_calling_code, "49");

  const accessPrefix = classifyInternationalPhone("0044 20 7183 8750");
  assertEquals(accessPrefix.phone_validation_status, "valid");
  assertEquals(accessPrefix.phone_country_code, "GB");
  assertEquals(accessPrefix.phone_e164, "+442071838750");
});

Deno.test("rejects missing, national-only, and impossible numbers", () => {
  assertEquals(
    classifyInternationalPhone("").phone_validation_status,
    "missing",
  );
  assertEquals(
    classifyInternationalPhone("0494562353").phone_validation_status,
    "invalid",
  );
  assertEquals(
    classifyInternationalPhone("+49123").phone_validation_status,
    "invalid",
  );
});

Deno.test("routes only valid numbers to the configured country Office", () => {
  const germanPhone = classifyInternationalPhone("+49 456 2353");
  const offices = new Map([["DE", "office-de"]]);

  assertEquals(
    routePhoneToOffice(germanPhone, offices, new Set(["office-de"])),
    { office_id: "office-de", phone_routing_status: "routed" },
  );
  assertEquals(routePhoneToOffice(germanPhone, offices, new Set()), {
    office_id: "office-de",
    phone_routing_status: "no_desk_manager",
  });
  assertEquals(
    routePhoneToOffice(
      classifyInternationalPhone("+33 6 12 34 56 78"),
      offices,
      new Set(),
    ),
    { office_id: null, phone_routing_status: "no_office" },
  );
  assertEquals(
    routePhoneToOffice(
      classifyInternationalPhone("030 123456"),
      offices,
      new Set(),
    ),
    { office_id: null, phone_routing_status: "invalid" },
  );
});
