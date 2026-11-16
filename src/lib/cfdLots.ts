import { CFD_INSTRUMENTS } from '../constants/tradingPairs.ts';

export const getCfdLotSize = (symbol: string): number => {
  const instrument = CFD_INSTRUMENTS.find(item => item.symbol === symbol);
  if (instrument?.type === 'forex') return 100000;
  if (instrument?.type === 'stock') return 100;
  if (instrument?.type !== 'commodity') return 1;
  switch (symbol) {
    case 'XAG/USD': return 5000;
    case 'XAUUSD': case 'XAU/USD':
    case 'XPTUSD': case 'XPT/USD':
    case 'XPDUSD': case 'XPD/USD': return 100;
    case 'NATGAS/USD': return 10000;
    case 'BCO/USD': case 'WTICO/USD': return 1000;
    case 'CORN/USD': case 'WHEAT/USD': return 5000;
    case 'SUGAR/USD': return 112000;
    default: return 1;
  }
};
