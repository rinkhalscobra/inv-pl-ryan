// Twelve Data CFD /quote timestamps identify the quote's source bar.
// A three-minute limit covers the one-minute selected-market polling cadence
// and the bar's opening time while still rejecting an interrupted feed.
export const CFD_QUOTE_MAX_AGE_MS = 3 * 60_000;
