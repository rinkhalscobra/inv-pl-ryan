import { parsePhoneNumberFromString } from "npm:libphonenumber-js@1.13.14/max";

export type PhoneValidationStatus = "valid" | "invalid" | "unsupported" | "missing";
export type PhoneRoutingStatus = "routed" | "no_office" | "no_desk_manager" | "invalid" | "manual";

export interface PhoneClassification {
  phone_e164: string | null;
  phone_country_code: string | null;
  phone_calling_code: string | null;
  phone_validation_status: PhoneValidationStatus;
  phone_validation_reason: string;
}

export function classifyInternationalPhone(value: unknown): PhoneClassification {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      phone_e164: null,
      phone_country_code: null,
      phone_calling_code: null,
      phone_validation_status: "missing",
      phone_validation_reason: "Phone number is missing",
    };
  }

  // Affiliates commonly send an international access prefix as 00. Store the
  // canonical E.164 form after parsing, but keep the original value on the lead.
  const international = raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
  if (!international.startsWith("+")) {
    return {
      phone_e164: null,
      phone_country_code: null,
      phone_calling_code: null,
      phone_validation_status: "invalid",
      phone_validation_reason: "Use international format beginning with + or 00",
    };
  }

  try {
    const phone = parsePhoneNumberFromString(international);
    if (!phone) {
      return {
        phone_e164: null,
        phone_country_code: null,
        phone_calling_code: null,
        phone_validation_status: "invalid",
        phone_validation_reason: "The international calling code is not recognized",
      };
    }
    if (!phone.country) {
      return {
        phone_e164: phone.number,
        phone_country_code: null,
        phone_calling_code: phone.countryCallingCode || null,
        phone_validation_status: "unsupported",
        phone_validation_reason: "The number is valid but is not linked to a supported country",
      };
    }
    if (!phone.isValid()) {
      return {
        phone_e164: phone.number,
        phone_country_code: phone.country,
        phone_calling_code: phone.countryCallingCode || null,
        phone_validation_status: "invalid",
        phone_validation_reason: `The number is not valid for ${phone.country}`,
      };
    }
    return {
      phone_e164: phone.number,
      phone_country_code: phone.country,
      phone_calling_code: phone.countryCallingCode || null,
      phone_validation_status: "valid",
      phone_validation_reason: "",
    };
  } catch {
    return {
      phone_e164: null,
      phone_country_code: null,
      phone_calling_code: null,
      phone_validation_status: "invalid",
      phone_validation_reason: "The phone number cannot be parsed",
    };
  }
}

export function routePhoneToOffice(
  classification: PhoneClassification,
  officesByCountry: Map<string, string>,
  deskManagerOfficeIds: Set<string>,
) {
  if (classification.phone_validation_status !== "valid" || !classification.phone_country_code) {
    return { office_id: null, phone_routing_status: "invalid" as const };
  }
  const officeId = officesByCountry.get(classification.phone_country_code.toUpperCase()) || null;
  if (!officeId) return { office_id: null, phone_routing_status: "no_office" as const };
  return {
    office_id: officeId,
    phone_routing_status: deskManagerOfficeIds.has(officeId) ? "routed" as const : "no_desk_manager" as const,
  };
}
