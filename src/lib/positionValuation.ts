/** Monetary position values come from the server's settlement calculation. */
export interface ValuedPosition {
  margin?: number;
  unrealizedPnl?: number;
  unrealized_pnl?: number;
}

export const positionNetPnl = (position: ValuedPosition): number => {
  const value = Number(position.unrealizedPnl ?? position.unrealized_pnl ?? 0);
  return Number.isFinite(value) ? value : 0;
};

export const sumPositionPnl = (positions: readonly ValuedPosition[]): number => (
  positions.reduce((sum, position) => sum + positionNetPnl(position), 0)
);

/** Percentage controls must round sizes down so they never exceed the budget. */
export const positionSizeForMargin = (margin: number, leverage: number, notionalPerUnit: number, decimals = 8): number => {
  if (![margin, leverage, notionalPerUnit].every(value => Number.isFinite(value) && value > 0)) return 0;
  const factor = 10 ** decimals;
  return Math.floor((margin * leverage / notionalPerUnit) * factor) / factor;
};

export const configuredSpreadCost = (spread: { spreadPercentage: number; minSpread: number; maxSpread: number }, notional: number): number => (
  notional > 0 && Number.isFinite(notional) ? Math.min(Math.max(notional * spread.spreadPercentage, spread.minSpread), spread.maxSpread) : 0
);
