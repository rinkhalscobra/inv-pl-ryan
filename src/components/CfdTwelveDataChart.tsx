import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickChart, LineChart, RefreshCw } from 'lucide-react';
import {
  AreaSeries, CandlestickSeries, ColorType, createChart,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import { getCfdInstrument } from '../constants/tradingPairs';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { useChartHistory } from '../hooks/useChartHistory';
import { aggregateCandles, CHART_TIMEFRAMES, type ChartCandle } from '../lib/chartCandles';

type ChartType = 'candlesticks' | 'line';
const readPreference = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};

export default function CfdTwelveDataChart({ selectedPair, market = 'cfd' }: { selectedPair: string; market?: 'cfd' | 'crypto' }) {
  const [chartType, setChartType] = useState<ChartType>(() => readPreference('atlas-chart-type') === 'line' ? 'line' : 'candlesticks');
  const [minutes, setMinutes] = useState(() => {
    const saved = Number(readPreference('atlas-chart-timeframe'));
    return CHART_TIMEFRAMES.some(timeframe => timeframe.minutes === saved) ? saved : 1;
  });
  const [hoveredCandle, setHoveredCandle] = useState<ChartCandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const barsRef = useRef<ChartCandle[]>([]);
  const fittedViewRef = useRef('');
  const { candles, loading, error } = useChartHistory(selectedPair, market, minutes);
  const { getMarketDataBySymbol } = useMarketData();
  const { getCryptoDataBySymbol } = useBybitData();
  const quote = market === 'crypto' ? getCryptoDataBySymbol(selectedPair) : getMarketDataBySymbol(selectedPair);
  const instrument = getCfdInstrument(selectedPair);
  const bars = useMemo(() => aggregateCandles(candles, minutes, quote).slice(-180), [candles, minutes, quote]);
  const pricePrecision = market === 'crypto' ? (Number(quote?.price || candles[candles.length - 1]?.close || 0) < 1 ? 8 : 2)
    : instrument?.type === 'forex' ? 5 : 2;
  const latest = bars[bars.length - 1];
  const last = latest?.close || quote?.price || 0;
  const rising = last >= (bars[0]?.open || last);
  const displayCandle = hoveredCandle || latest;
  const timeframeLabel = CHART_TIMEFRAMES.find(timeframe => timeframe.minutes === minutes)?.label;

  useEffect(() => {
    try {
      localStorage.setItem('atlas-chart-type', chartType);
      localStorage.setItem('atlas-chart-timeframe', String(minutes));
    } catch { /* Chart controls also work when browser storage is unavailable. */ }
  }, [chartType, minutes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#0b0e11' }, textColor: '#aab5c5', fontSize: 10, attributionLogo: true },
      grid: { vertLines: { color: '#1e2630' }, horzLines: { color: '#1e2630' } },
      rightPriceScale: { borderColor: '#2a313c', scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: '#2a313c', timeVisible: true, secondsVisible: false, rightOffset: 3 },
      crosshair: { vertLine: { color: '#64748b' }, horzLine: { color: '#64748b' } },
      handleScroll: { vertTouchDrag: false },
    });
    chartRef.current = chart;
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399', downColor: '#fb7185', borderVisible: false,
      wickUpColor: '#34d399', wickDownColor: '#fb7185',
    });
    lineSeriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: '#34d399', topColor: 'rgba(52,211,153,0.16)', bottomColor: 'rgba(52,211,153,0)', lineWidth: 2, visible: false,
    });
    chart.subscribeCrosshairMove(event => {
      setHoveredCandle(typeof event.time === 'number' ? barsRef.current.find(bar => bar.time === event.time) || null : null);
    });
    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current = null;
      fittedViewRef.current = '';
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const lineSeries = lineSeriesRef.current;
    if (!chart || !candleSeries || !lineSeries) return;
    barsRef.current = bars;
    setHoveredCandle(null);
    const priceFormat = { type: 'price' as const, precision: pricePrecision, minMove: 10 ** -pricePrecision };
    candleSeries.applyOptions({ visible: chartType === 'candlesticks', priceFormat });
    const color = rising ? '#34d399' : '#fb7185';
    lineSeries.applyOptions({ visible: chartType === 'line', priceFormat, lineColor: color,
      topColor: rising ? 'rgba(52,211,153,0.16)' : 'rgba(251,113,133,0.16)',
      bottomColor: rising ? 'rgba(52,211,153,0)' : 'rgba(251,113,133,0)' });
    candleSeries.setData(bars.map(bar => ({ ...bar, time: bar.time as UTCTimestamp })));
    lineSeries.setData(bars.map(bar => ({ time: bar.time as UTCTimestamp, value: bar.close })));
    chart.applyOptions({ timeScale: { timeVisible: minutes < 1440 } });
    const view = `${market}:${selectedPair}:${minutes}`;
    // A refresh preserves the trader's zoom and scroll position.
    if (bars.length && (fittedViewRef.current !== view || loading)) {
      chart.timeScale().fitContent();
      fittedViewRef.current = view;
    }
  }, [bars, chartType, market, selectedPair, minutes, pricePrecision, rising, loading]);

  return (
    <div className="flex h-full min-h-[280px] min-w-0 flex-col bg-[#0b0e11] text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#252a33] px-3 py-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white">{selectedPair}</span>
          <span className={`font-mono font-semibold tabular-nums ${rising ? 'text-emerald-400' : 'text-rose-400'}`}>
            {last > 0 ? last.toFixed(pricePrecision) : '--'}
          </span>
          {market === 'crypto' && <span className="text-slate-500">USDT reference</span>}
        </div>
        <div role="group" aria-label="Chart type" className="flex items-center gap-1 rounded border border-[#353d49] bg-[#151b24] p-1">
          {(['candlesticks', 'line'] as const).map(type => {
            const Icon = type === 'candlesticks' ? CandlestickChart : LineChart;
            return <button key={type} type="button" aria-pressed={chartType === type}
              onClick={() => setChartType(type)}
              className={`flex items-center gap-1.5 rounded px-2 py-1.5 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${chartType === type
                ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
              <Icon aria-hidden="true" size={14} />
              {type === 'candlesticks' ? 'Candles' : 'Line'}
            </button>;
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#252a33] px-3 py-2 text-xs">
        <div role="group" aria-label="Chart timeframe" className="flex flex-wrap items-center gap-1">
          {CHART_TIMEFRAMES.map(timeframe => (
            <button key={timeframe.minutes} type="button" aria-pressed={minutes === timeframe.minutes}
              onClick={() => setMinutes(timeframe.minutes)}
              className={`rounded px-2 py-1.5 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${minutes === timeframe.minutes
                ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
              {timeframe.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-500">UTC</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400" title="Chart history refreshes every minute while this tab is active">
          <RefreshCw aria-hidden="true" size={11} /> Auto-refresh 1m
        </span>
        {loading && <span role="status" className="text-[10px] text-slate-500">Loading history…</span>}
      </div>
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 px-3 py-1 font-mono text-[10px] tabular-nums text-slate-400" aria-label="Candle prices">
        {displayCandle && <>
          <span>{new Date(displayCandle.time * 1000).toLocaleString([], { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          {(['open', 'high', 'low', 'close'] as const).map(field => (
            <span key={field}>{field[0].toUpperCase()} <span className={displayCandle.close >= displayCandle.open ? 'text-emerald-400' : 'text-rose-400'}>{displayCandle[field].toFixed(pricePrecision)}</span></span>
          ))}
        </>}
      </div>
      <div className="relative min-h-0 flex-1" role="img" aria-label={`${selectedPair} ${timeframeLabel} ${chartType === 'candlesticks' ? 'Japanese candlestick' : 'line'} chart`}>
        <div ref={containerRef} className="absolute inset-0" />
        {!bars.length && <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-slate-500">
          {loading ? 'Loading chart history…' : error || 'Chart history will appear when market data is available.'}
        </div>}
      </div>
      {error && bars.length > 0 && <p role="status" className="px-3 py-1 text-[10px] text-amber-400">{error}</p>}
      <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="self-start px-3 py-1 text-[9px] text-slate-500 hover:text-slate-300">
        TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc.
      </a>
    </div>
  );
}
