import { CFD_INSTRUMENTS } from './tradingPairs';

export interface CfdTier {
  name: string;
  minEquity: number;
  maxForex: number;
  maxCommodities: number;
  maxStocks: number;
  description: string;
}

export const CFD_TIERS: CfdTier[] = [
  {
    name: 'Starter',
    minEquity: 0,
    maxForex: 100,
    maxCommodities: 30,
    maxStocks: 20,
    description: 'New/retail users, basic access'
  },
  {
    name: 'Plus',
    minEquity: 10000,
    maxForex: 200,
    maxCommodities: 50,
    maxStocks: 40,
    description: 'Active users with basic risk experience'
  },
  {
    name: 'Advanced',
    minEquity: 50000,
    maxForex: 300,
    maxCommodities: 75,
    maxStocks: 60,
    description: 'Frequent traders needing higher gearing'
  },
  {
    name: 'Pro',
    minEquity: 100000,
    maxForex: 500,
    maxCommodities: 90,
    maxStocks: 80,
    description: 'Semi-pro, tighter spreads, priority support'
  },
  {
    name: 'Elite',
    minEquity: 250000,
    maxForex: 1000,
    maxCommodities: 100,
    maxStocks: 100,
    description: 'Top tier, best pricing, bespoke limits'
  }
];

export function getInstrumentTypeFromSymbol(symbol: string): 'forex' | 'commodity' | 'stock' | 'index' | 'etf' {
  const instrument = CFD_INSTRUMENTS.find(item => item.symbol === symbol);

  if (instrument) {
    return instrument.type as 'forex' | 'commodity' | 'stock' | 'index' | 'etf';
  }

  return 'commodity';
}

export function getUserCfdTier(portfolioValue: number): CfdTier {
  for (let i = CFD_TIERS.length - 1; i >= 0; i--) {
    if (portfolioValue >= CFD_TIERS[i].minEquity) {
      return CFD_TIERS[i];
    }
  }

  return CFD_TIERS[0];
}
