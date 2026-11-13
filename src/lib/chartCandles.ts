export type MarketCandle = {
  candle_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartCandle = Omit<MarketCandle, 'candle_time'> & { time: number };
export type ChartQuote = { price: number; timestamp: string };

export const CHART_TIMEFRAMES = [
  { minutes: 1, label: '1m' },
  { minutes: 5, label: '5m' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 240, label: '4h' },
  { minutes: 1440, label: '1D' },
] as const;

export function mergeCandleHistory(previous: MarketCandle[], incoming: MarketCandle[]): MarketCandle[] {
  const byTime = new Map<number, MarketCandle>();
  for (const candle of [...previous, ...incoming]) {
    const time = Date.parse(candle.candle_time);
    if (!Number.isFinite(time) || ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      || candle.low <= 0 || candle.high < Math.max(candle.open, candle.close)
      || candle.low > Math.min(candle.open, candle.close)) continue;
    byTime.set(time, candle);
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([, candle]) => candle);
}

/** Combine actual minute bars into UTC-aligned OHLC bars, without filling market gaps. */
export function aggregateCandles(history: MarketCandle[], minutes: number, quote?: ChartQuote | null): ChartCandle[] {
  if (!Number.isInteger(minutes) || minutes < 1) throw new Error('Invalid chart timeframe');
  const candles = mergeCandleHistory([], history);
  const latest = candles[candles.length - 1];
  const quoteTime = Date.parse(quote?.timestamp || '');
  if (quote && Number.isFinite(quote.price) && quote.price > 0 && Number.isFinite(quoteTime)
    && (!latest || quoteTime > Date.parse(latest.candle_time))) {
    const minuteTime = Math.floor(quoteTime / 60_000) * 60_000;
    if (latest && minuteTime === Date.parse(latest.candle_time)) {
      candles[candles.length - 1] = {
        ...latest, high: Math.max(latest.high, quote.price), low: Math.min(latest.low, quote.price), close: quote.price,
      };
    } else {
      candles.push({ candle_time: new Date(minuteTime).toISOString(), open: quote.price,
        high: quote.price, low: quote.price, close: quote.price, volume: 0 });
    }
  }

  const bars: ChartCandle[] = [];
  const interval = minutes * 60;
  for (const candle of candles) {
    const time = Math.floor(Date.parse(candle.candle_time) / 1000 / interval) * interval;
    const previous = bars[bars.length - 1];
    if (previous?.time === time) {
      previous.high = Math.max(previous.high, candle.high);
      previous.low = Math.min(previous.low, candle.low);
      previous.close = candle.close;
      previous.volume += Number.isFinite(candle.volume) ? candle.volume : 0;
    } else {
      bars.push({ time, open: candle.open, high: candle.high, low: candle.low, close: candle.close,
        volume: Number.isFinite(candle.volume) ? candle.volume : 0 });
    }
  }
  return bars;
}
