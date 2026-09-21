export interface SwapCurrency {
  symbol: string;
  name: string;
  iconUrl: string;
  balance?: number;
  price?: number;
}

export interface SwapMarketPrice {
  symbol: string;
  baseSymbol: string;
  name: string;
  iconUrl: string;
  price: number;
  sortIndex: number;
}
