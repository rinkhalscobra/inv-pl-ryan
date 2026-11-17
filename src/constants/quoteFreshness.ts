// Both markets refresh each minute. The same bounded source-time window is
// enforced by client forms, CRM, execution, valuation and settlement.
export const CFD_QUOTE_MAX_AGE_MS = 6 * 60_000;

// Keep the crypto execution window aligned with the shared trading engine.
export const CRYPTO_QUOTE_MAX_AGE_MS = 6 * 60_000;
