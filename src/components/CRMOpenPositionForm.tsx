import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import AppSelect from './AppSelect';
import { supabase } from '../lib/supabaseClient';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface TradeMarket {
  symbol: string;
  instrument_type: string;
  contract_size: number;
  price: number | null;
  quoted_at: string | null;
  fresh: boolean | null;
  notional_per_unit: number | null;
  limits: { minimum: number; maximum: number };
}
interface TradeContext { client_id: string; available_margin: number; markets: TradeMarket[] }
interface Props {
  clientId: string;
  clientName: string;
  market: 'futures' | 'cfd';
  auditReason: string;
  onOpened: () => void;
}
const positiveNumber = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const errorText = (problem: unknown) => problem && typeof problem === 'object' && 'message' in problem ? String(problem.message) : 'The position could not be opened.';
const fieldClass = 'mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white focus:border-purple-400 focus:outline-none';

export default function CRMOpenPositionForm({ clientId, clientName, market, auditReason, onOpened }: Props) {
  const { formatUsd } = useFiatCurrency();
  const [context, setContext] = useState<TradeContext | null>(null);
  const [symbol, setSymbol] = useState(market === 'futures' ? 'BTCUSDT' : 'EUR/USD');
  const [search, setSearch] = useState('');
  const [quantity, setQuantity] = useState('');
  const [leverage, setLeverage] = useState('10');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [marginType, setMarginType] = useState<'isolated' | 'cross'>('isolated');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const epoch = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const selected = context?.markets.find(item => item.symbol === symbol);
  const minimum = Number(selected?.limits.minimum || 1);
  const maximum = Number(selected?.limits.maximum || 100);

  const load = useCallback(async (keepError = false) => {
    const current = ++epoch.current;
    const { data, error: failure } = await supabase.rpc('crm_get_client_trade_context', { p_target_user_id: clientId, p_market: market });
    if (!mounted.current || current !== epoch.current) return;
    setLoading(false);
    if (failure) { setError(failure.message); setContext(null); }
    else {
      setContext(data as TradeContext);
      if (!keepError) setError('');
    }
  }, [clientId, market]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const refresh = () => { if (!document.hidden && !busy.current) void load(true); };
    const timer = window.setInterval(refresh, 20_000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [load]);

  useEffect(() => { setLeverage(String(Math.max(minimum, Math.min(10, maximum)))); }, [symbol, minimum, maximum]);

  const refreshQuote = async () => {
    if (!selected) return;
    setLoading(true); setError('');
    try {
      const { data, error: failure } = await supabase.functions.invoke(market === 'futures' ? 'twelve-crypto-market-data' : 'cfd-market-data', {
        body: market === 'futures' ? { action: 'sync_selected', symbol, force: true }
          : { instruments: [{ symbol, type: selected.instrument_type }], force: true },
      });
      if (failure || data?.success !== true) throw new Error(data?.error || failure?.message || 'Market quote is unavailable.');
      await load();
    } catch (problem) { if (mounted.current) setError(errorText(problem)); }
    finally { if (mounted.current) setLoading(false); }
  };

  const size = positiveNumber(quantity);
  const gearing = Number(leverage);
  const notional = size * Number(selected?.contract_size || 1) * Number(selected?.notional_per_unit || 0);
  const requiredMargin = gearing > 0 ? notional / gearing : 0;
  const availableMargin = Number(context?.available_margin || 0);
  const quoteFresh = Boolean(selected?.fresh && selected.quoted_at && Date.now() - Date.parse(selected.quoted_at) <= 6 * 60_000);
  const valid = quoteFresh && size > 0 && (market !== 'cfd' || size >= 0.01) && notional >= 1
    && Number.isInteger(gearing) && gearing >= minimum && gearing <= maximum && requiredMargin > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || !valid || auditReason.trim().length < 3) return;
    if ((stopLoss && !positiveNumber(stopLoss)) || (takeProfit && !positiveNumber(takeProfit))) {
      setError('Enter valid stop-loss and take-profit prices.'); return;
    }
    const parameters = {
      p_target_user_id: clientId, p_market: market, p_symbol: symbol, p_side: side,
      p_quantity: size, p_leverage: gearing, p_margin_type: marginType,
      p_stop_loss: stopLoss ? Number(stopLoss) : null,
      p_take_profit: takeProfit ? Number(takeProfit) : null, p_reason: auditReason.trim(),
    };
    const fingerprint = JSON.stringify(parameters);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    busy.current = true; setSaving(true); setError(''); setSuccess('');
    try {
      const { data, error: failure } = await supabase.rpc('crm_open_client_position', { ...parameters, p_request_key: request.current.key });
      if (failure) throw failure;
      if (data?.kind !== 'position' || !data?.id) throw new Error('The position could not be confirmed. Retry with the same details to check its status.');
      if (!mounted.current) return;
      request.current = null; setQuantity(''); setStopLoss(''); setTakeProfit('');
      setSuccess(`${side === 'long' ? 'Long' : 'Short'} ${symbol} position opened for ${clientName}.`);
      onOpened();
      void load(true);
    } catch (problem) {
      if (mounted.current) { setError(errorText(problem)); void load(true); }
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  };

  const markets = context?.markets.filter(item => item.symbol.includes(search.trim().toUpperCase()) || item.symbol === symbol) || [];
  return <section className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-semibold text-white"><Plus size={18} className="text-violet-300" />Open {market === 'futures' ? 'Futures' : 'CFD'} position for {clientName}</h3>
        <p className="mt-1 text-xs text-slate-400">Executes at the verified market price using this client's available margin.</p></div>
      <button type="button" disabled={loading || saving || !selected} onClick={() => void refreshQuote()} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh price</button>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    {success && <p role="status" className="mb-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</p>}
    <form onSubmit={submit}>
      <fieldset disabled={loading || saving || !context} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs text-slate-400">Search markets<input value={search} onChange={event => setSearch(event.target.value)} className={fieldClass} placeholder={market === 'futures' ? 'BTCUSDT' : 'EUR/USD'} /></label>
        <label className="text-xs text-slate-400">Instrument<AppSelect aria-label="Instrument" value={symbol} onChange={event => { setSymbol(event.target.value); setStopLoss(''); setTakeProfit(''); setSuccess(''); }} className={fieldClass}>{markets.map(item => <option key={item.symbol} value={item.symbol}>{item.symbol}</option>)}</AppSelect></label>
        <label className="text-xs text-slate-400">Direction<AppSelect aria-label="Direction" value={side} onChange={event => setSide(event.target.value as 'long' | 'short')} className={fieldClass}><option value="long">Long</option><option value="short">Short</option></AppSelect></label>
        <label className="text-xs text-slate-400">{market === 'cfd' ? 'Size (lots)' : 'Quantity'}<input aria-label={market === 'cfd' ? 'Size (lots)' : 'Quantity'} type="number" min={market === 'cfd' ? '0.01' : '0.00000001'} step={market === 'cfd' ? '0.01' : '0.00000001'} value={quantity} onChange={event => setQuantity(event.target.value)} className={fieldClass} required />
          <span className="mt-1 block">{market === 'cfd' ? `1 lot = ${Number(selected?.contract_size || 1).toLocaleString()} units` : symbol.replace(/USDT$/, '')}</span></label>
        <label className="text-xs text-slate-400">Leverage<input aria-label="Leverage" type="number" min={minimum} max={maximum} step="1" value={leverage} onChange={event => setLeverage(event.target.value)} className={fieldClass} required /><span className="mt-1 block">Client limit: {minimum}× – {maximum}×</span></label>
        <label className="text-xs text-slate-400">Margin mode<AppSelect aria-label="Margin mode" value={marginType} onChange={event => setMarginType(event.target.value as 'isolated' | 'cross')} className={fieldClass}><option value="isolated">Isolated</option><option value="cross">Cross</option></AppSelect></label>
        <label className="text-xs text-slate-400">Stop-loss price (optional)<input aria-label="Stop-loss price (optional)" type="number" min="0" step="any" value={stopLoss} onChange={event => setStopLoss(event.target.value)} className={fieldClass} /></label>
        <label className="text-xs text-slate-400">Take-profit price (optional)<input aria-label="Take-profit price (optional)" type="number" min="0" step="any" value={takeProfit} onChange={event => setTakeProfit(event.target.value)} className={fieldClass} /></label>
      </fieldset>
      <div className="my-4 grid gap-3 rounded-xl bg-slate-950/50 p-4 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-slate-500">Market price</p><p className="mt-1 font-mono text-white">{selected?.price ? Number(selected.price).toLocaleString('en-US', { maximumFractionDigits: 8 }) : 'Unavailable'}</p></div>
        <div><p className="text-xs text-slate-500">Estimated margin (USD)</p><p className="mt-1 font-mono text-white">{formatUsd(requiredMargin)}</p></div>
        <div><p className="text-xs text-slate-500">Client available margin (USD)</p><p className="mt-1 font-mono text-white">{formatUsd(availableMargin)}</p></div>
      </div>
      {context && !quoteFresh && <p className="mb-3 text-xs text-amber-400">A verified live price is required. Refresh the price before opening a position.</p>}
      {quoteFresh && !selected?.notional_per_unit && <p className="mb-3 text-xs text-amber-400">USD conversion is unavailable. Refresh prices or choose another instrument.</p>}
      {valid && requiredMargin > availableMargin && <p className="mb-3 text-xs text-amber-400">This order exceeds the client's available margin.</p>}
      <button type="submit" disabled={loading || saving || !valid || requiredMargin > availableMargin || auditReason.trim().length < 3} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">{saving ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}{saving ? 'Opening position...' : side === 'long' ? 'Open Long position' : 'Open Short position'}</button>
      <p className="mt-3 text-xs text-slate-500">The audit reason entered above is required and saved with this order.</p>
    </form>
  </section>;
}
