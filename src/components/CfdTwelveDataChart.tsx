import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip, type ChartOptions
} from 'chart.js';
import { getCfdInstrument } from '../constants/tradingPairs';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { supabase } from '../lib/supabaseClient';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type Candle = { candle_time: string; open: number; high: number; low: number; close: number; volume: number };
const historyCache = new Map<string, Candle[]>();

export default function CfdTwelveDataChart({ selectedPair, market = 'cfd' }: { selectedPair: string; market?: 'cfd' | 'crypto' }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const { getMarketDataBySymbol } = useMarketData();
  const { getCryptoDataBySymbol } = useBybitData();
  const quote = market === 'crypto' ? getCryptoDataBySymbol(selectedPair) : getMarketDataBySymbol(selectedPair);
  const instrument = getCfdInstrument(selectedPair);

  useEffect(() => {
    let active = true;
    const cacheKey = `${market}:${selectedPair}`;
    const cached = historyCache.get(cacheKey);
    setCandles(cached || []);
    setLoading(!cached);
    const load = async () => {
      const { data, error } = await supabase.from(market === 'crypto' ? 'crypto_market_candles' : 'cfd_market_candles')
        .select('candle_time,open,high,low,close,volume')
        .eq('symbol', selectedPair)
        .order('candle_time', { ascending: false })
        .limit(180);
      if (!active) return;
      if (!error && data) {
        const next = data.reverse().map(row => ({
          candle_time: row.candle_time,
          open: Number(row.open), high: Number(row.high), low: Number(row.low),
          close: Number(row.close), volume: Number(row.volume)
        }));
        if (next.length) {
          historyCache.set(cacheKey, next);
          setCandles(next);
        }
      }
      setLoading(false);
    };
    void load();
    const onHistoryUpdated = (event: Event) => {
      if (market === 'crypto' && (event as CustomEvent<{ symbol: string }>).detail?.symbol === selectedPair) {
        void load();
      }
    };
    window.addEventListener('twelve-crypto-history-updated', onHistoryUpdated);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('twelve-crypto-history-updated', onHistoryUpdated); };
  }, [selectedPair, market]);

  const points = useMemo(() => {
    const values = candles.map(candle => ({ time: candle.candle_time, price: candle.close }));
    if (quote?.price && quote.timestamp &&
      (!values.length || Date.parse(quote.timestamp) > Date.parse(values[values.length - 1].time))) {
      values.push({ time: quote.timestamp, price: quote.price });
    }
    return values;
  }, [candles, quote]);
  const pricePrecision = market === 'crypto' ? (Number(quote?.price || 0) < 1 ? 8 : 2)
    : instrument?.type === 'forex' ? 5 : 2;
  const last = points[points.length - 1]?.price || quote?.price || 0;
  const first = points[0]?.price || last;
  const rising = last >= first;
  const color = rising ? '#34d399' : '#fb7185';
  const chartData = useMemo(() => ({
    labels: points.map(point => new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    datasets: [{
      label: selectedPair,
      data: points.map(point => point.price),
      borderColor: color,
      backgroundColor: rising ? 'rgba(52,211,153,0.09)' : 'rgba(251,113,133,0.09)',
      borderWidth: 1.7,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: color,
      fill: true,
      tension: 0.12,
    }]
  }), [points, selectedPair, color, rising]);
  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        backgroundColor: '#1b2028',
        borderColor: '#3b4250',
        borderWidth: 1,
        callbacks: { label: context => `${selectedPair}  ${Number(context.parsed.y).toFixed(pricePrecision)}` }
      }
    },
    scales: {
      x: {
        grid: { color: '#1e2630' },
        border: { color: '#2a313c' },
        ticks: { color: '#8793a5', maxTicksLimit: 8, maxRotation: 0, font: { size: 10 } }
      },
      y: {
        position: 'right',
        grid: { color: '#1e2630' },
        border: { color: '#2a313c' },
        ticks: { color: '#aab5c5', font: { size: 10 }, callback: value => Number(value).toFixed(pricePrecision) }
      }
    }
  }), [selectedPair, pricePrecision]);

  return (
    <div className="flex h-full min-h-[280px] flex-col bg-[#0b0e11] text-slate-200">
      <div className="flex min-h-10 items-center justify-between border-b border-[#252a33] px-4 text-xs">
        <div className="flex items-center gap-3"><span className="font-semibold text-white">{selectedPair}</span><span className="text-slate-500">1m chart</span>{market === 'crypto' && <span className="text-slate-500">USDT reference</span>}</div>
        <span className={`font-mono font-semibold tabular-nums ${rising ? 'text-emerald-400' : 'text-rose-400'}`}>
          {last > 0 ? last.toFixed(pricePrecision) : '--'}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 px-2 pb-2 pt-3">
        {points.length > 1 ? <Line data={chartData} options={options} /> : (
          <div className="flex h-full items-center justify-center px-4">
            {quote?.price ? <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 text-slate-300">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">Market reference quote</div>
              <div className="mt-2 font-mono text-3xl font-semibold text-white">{quote.price.toFixed(pricePrecision)}</div>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-4 text-xs">
                <div><span className="text-slate-500">24h high</span><div className="mt-1 font-mono">{quote.high_price_24h > 0 ? quote.high_price_24h.toFixed(pricePrecision) : '--'}</div></div>
                <div><span className="text-slate-500">24h low</span><div className="mt-1 font-mono">{quote.low_price_24h > 0 ? quote.low_price_24h.toFixed(pricePrecision) : '--'}</div></div>
              </div>
              <div className="mt-4 text-xs text-slate-500">{loading ? 'Loading chart history…' : 'Chart history will appear when the market feed returns it.'}</div>
            </div> : <div className="text-sm text-slate-500">{loading ? 'Loading market data…' : 'Market data unavailable'}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
