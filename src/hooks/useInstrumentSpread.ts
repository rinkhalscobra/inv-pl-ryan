import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { SpreadConfig } from '../constants/spreadConfig';

/** Order estimates use the same live spread configuration as settlement. */
export function useInstrumentSpread(symbol: string) {
  const [value, setValue] = useState<{ symbol: string; spread: SpreadConfig } | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    const load = async () => {
      const request = ++version;
      const { data, error } = await supabase.rpc('get_instrument_spread', { p_symbol: symbol });
      if (!active || request !== version) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) { setValue(null); return; }
      setValue({ symbol, spread: {
        symbol, instrumentType: row.instrument_type,
        spreadPercentage: Number(row.spread_percentage), minSpread: Number(row.min_spread_value), maxSpread: Number(row.max_spread_value),
      } });
    };
    void load();
    const channel = supabase.channel(`instrument-spread-${symbol}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'instrument_spreads', filter: `symbol=eq.${symbol}` }, () => void load())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [symbol]);
  return value?.symbol === symbol ? value.spread : null;
}
