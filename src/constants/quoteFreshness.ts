// Stored CFD quotes refresh every four minutes. Allow one refresh interval plus
// source-bar and network drift before disabling trading.
export const CFD_QUOTE_MAX_AGE_MS = 6 * 60_000;

// Crypto quotes use the same four-minute stored-price cycle.
export const CRYPTO_QUOTE_MAX_AGE_MS = 6 * 60_000;
