import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateCandles, mergeCandleHistory, type MarketCandle } from '../src/lib/chartCandles.ts';

const candle = (time: string, open: number, high: number, low: number, close: number, volume = 10): MarketCandle => ({
  candle_time: time, open, high, low, close, volume,
});
const at = (time: string) => Date.parse(time) / 1000;
const history = [
  candle('2026-11-12T10:00:00Z', 100, 110, 98, 105),
  candle('2026-11-12T10:01:00Z', 105, 112, 103, 108, 20),
  candle('2026-11-12T10:04:00Z', 108, 109, 95, 96, 30),
  candle('2026-11-12T10:05:00Z', 96, 104, 94, 102, 40),
];

test('five-minute candles retain the first open, extremes, last close, and total volume', () => {
  assert.deepEqual(aggregateCandles(history, 5), [
    { time: at('2026-11-12T10:00:00Z'), open: 100, high: 112, low: 95, close: 96, volume: 60 },
    { time: at('2026-11-12T10:05:00Z'), open: 96, high: 104, low: 94, close: 102, volume: 40 },
  ]);
});

test('hourly and four-hour bars use UTC boundaries across the day', () => {
  const rows = [candle('2026-11-12T11:59:00Z', 10, 12, 9, 11), candle('2026-11-12T12:00:00Z', 11, 13, 10, 12)];
  assert.deepEqual(aggregateCandles(rows, 60).map(bar => bar.time), [at('2026-11-12T11:00:00Z'), at('2026-11-12T12:00:00Z')]);
  assert.deepEqual(aggregateCandles(rows, 240).map(bar => bar.time), [at('2026-11-12T08:00:00Z'), at('2026-11-12T12:00:00Z')]);
});

test('daily bars align to UTC even when source timestamps carry another timezone', () => {
  const rows = [candle('2026-11-12T00:59:00+01:00', 10, 12, 9, 11), candle('2026-11-12T01:00:00+01:00', 11, 13, 10, 12)];
  assert.deepEqual(aggregateCandles(rows, 1440).map(bar => bar.time), [at('2026-11-11T00:00:00Z'), at('2026-11-12T00:00:00Z')]);
});

test('overlapping history pages replace revised bars, sort dates, and do not double count volume', () => {
  const revised = { ...history[1], close: 111 };
  const merged = mergeCandleHistory([history[2], history[1]], [history[0], revised]);
  assert.deepEqual(merged, [history[0], revised, history[2]]);
  assert.equal(aggregateCandles(merged, 5)[0].volume, 60);
});

test('a newer quote extends the current candle without changing its open or losing its wick', () => {
  const original = structuredClone(history);
  const bars = aggregateCandles(history, 5, { timestamp: '2026-11-12T10:05:30Z', price: 110 });
  assert.deepEqual(bars[1], { time: at('2026-11-12T10:05:00Z'), open: 96, high: 110, low: 94, close: 110, volume: 40 });
  assert.deepEqual(history, original);
});

test('a quote in a new minute updates the current timeframe and starts a new bar at its boundary', () => {
  assert.equal(aggregateCandles(history, 5, { timestamp: '2026-11-12T10:06:00Z', price: 106 }).length, 2);
  const bars = aggregateCandles(history, 5, { timestamp: '2026-11-12T10:10:00Z', price: 106 });
  assert.equal(bars.length, 3);
  assert.deepEqual(bars[2], { time: at('2026-11-12T10:10:00Z'), open: 106, high: 106, low: 106, close: 106, volume: 0 });
});

test('stale or invalid quotes cannot overwrite a historical closing price', () => {
  for (const quote of [
    { timestamp: '2026-11-12T10:04:30Z', price: 500 },
    { timestamp: '2026-11-12T10:05:00Z', price: 500 },
    { timestamp: 'invalid', price: 500 },
    { timestamp: '2026-11-12T10:06:00Z', price: NaN },
  ]) assert.deepEqual(aggregateCandles(history, 5, quote), aggregateCandles(history, 5));
});

test('market gaps are preserved and invalid candles are excluded', () => {
  const rows = [history[0], candle('2026-11-13T10:00:00Z', 100, 110, 98, 105),
    candle('invalid', 100, 110, 98, 105), candle('2026-11-12T11:00:00Z', 100, 90, 98, 105)];
  assert.equal(aggregateCandles(rows, 5).length, 2);
  assert.deepEqual(aggregateCandles([], 1), []);
  assert.throws(() => aggregateCandles(history, 0), /Invalid chart timeframe/);
});
