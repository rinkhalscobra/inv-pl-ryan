import { getSwapConfigForSymbol, calculateDailySwapCost, formatSwapRate } from '../constants/swapConfig';

export interface SwapCostEstimate {
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  yearlyCost: number;
  dailyRate: number;
  annualizedRate: number;
  description: string;
}

export function estimateSwapCosts(
  symbol: string,
  positionSize: number,
  leverage: number = 1
): SwapCostEstimate | null {
  const swapConfig = getSwapConfigForSymbol(symbol);

  if (!swapConfig) {
    return null;
  }

  const dailyCost = calculateDailySwapCost(symbol, positionSize, leverage);

  return {
    dailyCost,
    weeklyCost: dailyCost * 7,
    monthlyCost: dailyCost * 30,
    yearlyCost: dailyCost * 365,
    dailyRate: swapConfig.dailySwapRate,
    annualizedRate: swapConfig.annualizedRate,
    description: swapConfig.description
  };
}

export function formatSwapCostDisplay(swapCost: number): string {
  if (swapCost === 0) {
    return '$0.00';
  }

  if (Math.abs(swapCost) < 0.01) {
    return swapCost < 0 ? '-$0.01' : '$0.01';
  }

  const sign = swapCost < 0 ? '-' : '';
  return `${sign}$${Math.abs(swapCost).toFixed(2)}`;
}

export function calculateAccumulatedSwap(
  dailySwapCost: number,
  days: number
): number {
  return dailySwapCost * days;
}

export function getSwapImpactOnPnL(
  pnl: number,
  accumulatedSwap: number
): {
  originalPnl: number;
  swapCost: number;
  netPnl: number;
  swapImpactPercentage: number;
} {
  const netPnl = pnl - accumulatedSwap;
  const swapImpactPercentage = pnl !== 0 ? (accumulatedSwap / Math.abs(pnl)) * 100 : 0;

  return {
    originalPnl: pnl,
    swapCost: accumulatedSwap,
    netPnl,
    swapImpactPercentage
  };
}

export function shouldChargeSwapToday(
  lastSwapChargeDate: string | null,
  positionCreatedAt: string
): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!lastSwapChargeDate) {
    const createdDate = new Date(positionCreatedAt);
    const createdDateOnly = new Date(
      createdDate.getFullYear(),
      createdDate.getMonth(),
      createdDate.getDate()
    );

    const daysSinceCreation = Math.floor(
      (today.getTime() - createdDateOnly.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceCreation > 0;
  }

  const lastChargeDate = new Date(lastSwapChargeDate);
  const lastChargeDateOnly = new Date(
    lastChargeDate.getFullYear(),
    lastChargeDate.getMonth(),
    lastChargeDate.getDate()
  );

  return today.getTime() > lastChargeDateOnly.getTime();
}

export function calculateDaysSinceLastSwap(
  lastSwapChargeDate: string | null,
  positionCreatedAt: string
): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!lastSwapChargeDate) {
    const createdDate = new Date(positionCreatedAt);
    const createdDateOnly = new Date(
      createdDate.getFullYear(),
      createdDate.getMonth(),
      createdDate.getDate()
    );

    return Math.max(
      0,
      Math.floor((today.getTime() - createdDateOnly.getTime()) / (1000 * 60 * 60 * 24))
    );
  }

  const lastChargeDate = new Date(lastSwapChargeDate);
  const lastChargeDateOnly = new Date(
    lastChargeDate.getFullYear(),
    lastChargeDate.getMonth(),
    lastChargeDate.getDate()
  );

  return Math.max(
    0,
    Math.floor((today.getTime() - lastChargeDateOnly.getTime()) / (1000 * 60 * 60 * 24))
  );
}

export interface SwapSummary {
  totalPositions: number;
  totalDailySwapCost: number;
  totalAccumulatedSwap: number;
  estimatedWeeklyCost: number;
  estimatedMonthlyCost: number;
  byInstrumentType: Record<string, {
    count: number;
    dailyCost: number;
    accumulatedCost: number;
  }>;
}

export function calculatePortfolioSwapSummary(
  positions: Array<{
    symbol: string;
    amount: number;
    entryPrice: number;
    leverage: number;
    accumulated_swap_cost?: number;
  }>
): SwapSummary {
  const summary: SwapSummary = {
    totalPositions: positions.length,
    totalDailySwapCost: 0,
    totalAccumulatedSwap: 0,
    estimatedWeeklyCost: 0,
    estimatedMonthlyCost: 0,
    byInstrumentType: {}
  };

  positions.forEach(position => {
    const positionSize = position.amount * position.entryPrice;
    const swapConfig = getSwapConfigForSymbol(position.symbol);

    if (swapConfig) {
      const dailyCost = calculateDailySwapCost(position.symbol, positionSize, position.leverage);
      const instrumentType = swapConfig.instrumentType;

      summary.totalDailySwapCost += dailyCost;
      summary.totalAccumulatedSwap += position.accumulated_swap_cost || 0;

      if (!summary.byInstrumentType[instrumentType]) {
        summary.byInstrumentType[instrumentType] = {
          count: 0,
          dailyCost: 0,
          accumulatedCost: 0
        };
      }

      summary.byInstrumentType[instrumentType].count += 1;
      summary.byInstrumentType[instrumentType].dailyCost += dailyCost;
      summary.byInstrumentType[instrumentType].accumulatedCost += position.accumulated_swap_cost || 0;
    }
  });

  summary.estimatedWeeklyCost = summary.totalDailySwapCost * 7;
  summary.estimatedMonthlyCost = summary.totalDailySwapCost * 30;

  return summary;
}
