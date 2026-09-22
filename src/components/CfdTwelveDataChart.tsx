import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip, type ChartOptions
} from 'chart.js';
import { getCfdInstrument } from '../constants/tradingPairs';
import { useMarketData } from '../contexts/MarketDataContext';
import { supabase } from '../lib/supabaseClient';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type Candle = { candle_time: string; open: number; high: number; low: number; close: number; volume: number };

export default function CfdTwelveDataChart({ selectedPair }: { selectedPair: string }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const { getMarketDataBySymbol } = useMarketData();
  const quote = getMarketDataBySymbol(selectedPair);
  const instrument = getCfdInstrument(selectedPair);

  useEffect(() => {
    let active = true;
    setCandles([]);
    setLoading(true);
    const load = async () => {
      const { data, error } = await supabase.from('cfd_market_candles')
        .select('candle_time,open,high,low,close,volume')
        .eq('symbol', selectedPair)
        .order('candle_time', { ascending: false })
        .limit(180);
      if (!active) return;
      if (!error && data) setCandles(data.reverse().map(row => ({
        candle_time: row.candle_time,
        open: Number(row.open), high: Number(row.high), low: Number(row.low),
        close: Number(row.close), volume: Number(row.volume)
      })));
      setLoading(false);
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedPair]);

  const points = useMemo(() => {
    const values = candles.map(candle => ({ time: candle.candle_time, price: candle.close }));
    if (quote?.price && quote.timestamp &&
      (!values.length || Date.parse(quote.timestamp) > Date.parse(values[values.length - 1].time))) {
      values.push({ time: quote.timestamp, price: quote.price });
    }
    return values;
  }, [candles, quote]);
  const pricePrecision = instrument?.type === 'forex' ? 5 : 2;
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
        <div className="flex items-center gap-3"><span className="font-semibold text-white">{selectedPair}</span><span className="text-slate-500">1m chart</span><span className="text-slate-500">Twelve Data</span></div>
        <span className={`font-mono font-semibold tabular-nums ${rising ? 'text-emerald-400' : 'text-rose-400'}`}>
          {last > 0 ? last.toFixed(pricePrecision) : '--'}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 px-2 pb-2 pt-3">
        {points.length > 1 ? <Line data={chartData} options={options} /> : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {loading ? 'Loading Twelve Data chart…' : instrument?.tradable === false
              ? 'Twelve Data chart unavailable for this instrument'
              : 'Waiting for Twelve Data chart history'}
          </div>
        )}
      </div>
    </div>
  );
}
