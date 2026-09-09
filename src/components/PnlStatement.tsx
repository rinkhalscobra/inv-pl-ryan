import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  FileText,
  Filter,
  Calendar,
  TrendingUp,
  TrendingDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Settings2
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { CFD_INSTRUMENTS } from '../constants/tradingPairs';
import { generateTradePdf } from '../utils/generateTradePdf';

type TradeType = 'all' | 'futures' | 'cfd';

interface ColumnVisibility {
  sl: boolean;
  tp: boolean;
  swap: boolean;
  commission: boolean;
}

interface PositionHistoryRow {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  exit_price: number;
  amount: number;
  leverage: number;
  margin: number;
  pnl: number;
  roi: number;
  open_time: string;
  close_time: string;
  accumulated_swap_cost: number;
  spread_cost: number;
}

const cfdSymbolSet = new Set(CFD_INSTRUMENTS.map(i => i.symbol));

function isCfdSymbol(symbol: string): boolean {
  if (cfdSymbolSet.has(symbol)) return true;
  if (symbol.includes('/')) return true;
  const upperSym = symbol.toUpperCase();
  if (!upperSym.endsWith('USDT') && !upperSym.endsWith('USD')) {
    return CFD_INSTRUMENTS.some(i => i.symbol === symbol);
  }
  if (upperSym.endsWith('USDT')) return false;
  return cfdSymbolSet.has(symbol);
}

function getCurrencyForSymbol(symbol: string): string {
  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    return parts[0];
  }
  return 'USD';
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return '--';
  }
}

function formatPrice(price: number, symbol: string): string {
  if (symbol.includes('/') && !symbol.includes('JPY')) {
    return price.toFixed(5);
  }
  if (symbol.includes('JPY')) {
    return price.toFixed(3);
  }
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

const ROWS_PER_PAGE = 20;

function buildHtmlDocument(
  filteredHistory: PositionHistoryRow[],
  totalProfit: number,
  tradeType: TradeType,
  dateFrom: string,
  dateTo: string,
  cols: ColumnVisibility
): string {
  const typeLabel = tradeType === 'all' ? 'All Trades' : tradeType === 'futures' ? 'Futures' : 'CFD';
  const dateRange = dateFrom || dateTo
    ? `${dateFrom || 'Start'} to ${dateTo || 'Present'}`
    : 'All Time';

  const thCells = [
    '<th>Order ID</th>',
    '<th>Symbol</th>',
    '<th>Type</th>',
    '<th>Size</th>',
    '<th>Margin</th>',
    '<th>Currency</th>',
    '<th>Open Price</th>',
    '<th>Open Time</th>',
    '<th>Close Price</th>',
    '<th>Close Time</th>',
    cols.sl ? '<th>S/L</th>' : '',
    cols.tp ? '<th>T/P</th>' : '',
    cols.swap ? '<th>Swap</th>' : '',
    cols.commission ? '<th>Commission</th>' : '',
    '<th>Profit</th>'
  ].filter(Boolean).join('\n        ');

  const rows = filteredHistory.map((row, idx) => {
    const profitColor = row.pnl >= 0 ? 'color: green;' : 'color: red;';
    const cells = [
      `<td>${row.id.slice(0, 8)}</td>`,
      `<td>${row.symbol}</td>`,
      `<td>${row.side === 'long' ? 'BUY' : 'SELL'}</td>`,
      `<td>${row.amount.toFixed(4)}</td>`,
      `<td>${row.margin.toFixed(2)}</td>`,
      `<td>${getCurrencyForSymbol(row.symbol)}</td>`,
      `<td>${formatPrice(row.entry_price, row.symbol)}</td>`,
      `<td>${formatDateTime(row.open_time)}</td>`,
      `<td>${formatPrice(row.exit_price, row.symbol)}</td>`,
      `<td>${formatDateTime(row.close_time)}</td>`,
      cols.sl ? '<td>--</td>' : '',
      cols.tp ? '<td>--</td>' : '',
      cols.swap ? `<td>${(row.accumulated_swap_cost || 0).toFixed(2)}</td>` : '',
      cols.commission ? `<td>${(row.spread_cost || 0).toFixed(2)}</td>` : '',
      `<td style="${profitColor} font-weight: bold;">${row.pnl.toFixed(2)}</td>`
    ].filter(Boolean).join('\n        ');
    return `<tr style="background: ${idx % 2 === 0 ? '#f9f9f9' : '#ffffff'};">\n        ${cells}\n      </tr>`;
  }).join('\n      ');

  const totalColor = totalProfit >= 0 ? 'color: green;' : 'color: red;';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Trade Statement - ${typeLabel}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #333; background: #fff; }
    h1 { text-align: center; font-size: 24px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
    .subtitle { text-align: center; color: #666; font-size: 13px; margin-bottom: 30px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; color: #555; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #e8e8e8; padding: 10px 6px; text-align: left; font-weight: 700; border-bottom: 2px solid #ccc; white-space: nowrap; }
    td { padding: 8px 6px; border-bottom: 1px solid #eee; white-space: nowrap; }
    .totals { margin-top: 30px; }
    .totals h3 { font-size: 14px; margin-bottom: 5px; }
    .totals .value { font-size: 20px; font-weight: bold; }
    @media print {
      body { margin: 20px; }
      @page { size: landscape; margin: 15mm; }
    }
  </style>
</head>
<body>
  <h1>TRADES</h1>
  <div class="subtitle">${typeLabel} | ${dateRange}</div>
  <div class="meta">
    <span>Generated: ${new Date().toLocaleString()}</span>
    <span>Total Trades: ${filteredHistory.length}</span>
  </div>
  <table>
    <thead>
      <tr>
        ${thCells}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="totals">
    <h3>Total Profit:</h3>
    <div class="value" style="${totalColor}">${totalProfit.toFixed(2)}</div>
  </div>
</body>
</html>`;
}

const PnlStatement: React.FC = () => {
  const { t } = useTranslation();
  const [tradeType, setTradeType] = useState<TradeType>('all');
  const [loading, setLoading] = useState(true);
  const [allHistory, setAllHistory] = useState<PositionHistoryRow[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [columns, setColumns] = useState<ColumnVisibility>({
    sl: true,
    tp: true,
    swap: true,
    commission: true
  });
  const toggleColumn = (key: keyof ColumnVisibility) => {
    setColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('futures_position_history')
        .select('id, symbol, side, entry_price, exit_price, amount, leverage, margin, pnl, roi, open_time, close_time, accumulated_swap_cost, spread_cost')
        .eq('user_id', user.id)
        .order('close_time', { ascending: false });

      if (error) throw error;
      setAllHistory(data || []);
    } catch (err) {
      console.error('Failed to fetch position history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredHistory = useMemo(() => {
    let result = allHistory;

    if (tradeType === 'futures') {
      result = result.filter(r => !isCfdSymbol(r.symbol));
    } else if (tradeType === 'cfd') {
      result = result.filter(r => isCfdSymbol(r.symbol));
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter(r => new Date(r.close_time) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(r => new Date(r.close_time) <= to);
    }

    return result;
  }, [allHistory, tradeType, dateFrom, dateTo]);

  const totalProfit = useMemo(() => {
    return filteredHistory.reduce((sum, r) => sum + r.pnl, 0);
  }, [filteredHistory]);

  const totalSwap = useMemo(() => {
    return filteredHistory.reduce((sum, r) => sum + (r.accumulated_swap_cost || 0), 0);
  }, [filteredHistory]);

  const totalSpread = useMemo(() => {
    return filteredHistory.reduce((sum, r) => sum + (r.spread_cost || 0), 0);
  }, [filteredHistory]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / ROWS_PER_PAGE));
  const paginatedRows = filteredHistory.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [tradeType, dateFrom, dateTo]);

  const getHtmlContent = useCallback(() => {
    return buildHtmlDocument(filteredHistory, totalProfit, tradeType, dateFrom, dateTo, columns);
  }, [filteredHistory, totalProfit, tradeType, dateFrom, dateTo, columns]);

  const handleDownloadHtml = () => {
    const html = getHtmlContent();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const typeLabel = tradeType === 'all' ? 'all' : tradeType;
    a.href = url;
    a.download = `trade_statement_${typeLabel}_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    generateTradePdf(filteredHistory, totalProfit, tradeType, dateFrom, dateTo, columns);
  };

  const handleDownloadCsv = () => {
    const headers: string[] = [
      'Order ID', 'Symbol', 'Type', 'Size', 'Margin', 'Currency',
      'Open Price', 'Open Time', 'Close Price', 'Close Time'
    ];
    if (columns.sl) headers.push('S/L');
    if (columns.tp) headers.push('T/P');
    if (columns.swap) headers.push('Swap');
    if (columns.commission) headers.push('Commission');
    headers.push('Profit');

    const csvRows = [headers.join(',')];

    for (const row of filteredHistory) {
      const cells: string[] = [
        row.id.slice(0, 8),
        row.symbol,
        row.side === 'long' ? 'BUY' : 'SELL',
        row.amount.toFixed(4),
        row.margin.toFixed(2),
        getCurrencyForSymbol(row.symbol),
        formatPrice(row.entry_price, row.symbol),
        formatDateTime(row.open_time),
        formatPrice(row.exit_price, row.symbol),
        formatDateTime(row.close_time)
      ];
      if (columns.sl) cells.push('--');
      if (columns.tp) cells.push('--');
      if (columns.swap) cells.push((row.accumulated_swap_cost || 0).toFixed(2));
      if (columns.commission) cells.push((row.spread_cost || 0).toFixed(2));
      cells.push(row.pnl.toFixed(2));
      csvRows.push(cells.join(','));
    }

    csvRows.push('');
    const emptyCount = headers.length - 2;
    csvRows.push(`Total Profit:${','.repeat(emptyCount)}${totalProfit.toFixed(2)}`);

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const typeLabel = tradeType === 'all' ? 'all' : tradeType;
    a.href = url;
    a.download = `trade_statement_${typeLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const columnToggles: { key: keyof ColumnVisibility; label: string }[] = [
    { key: 'sl', label: 'S/L' },
    { key: 'tp', label: 'T/P' },
    { key: 'swap', label: 'Swap' },
    { key: 'commission', label: 'Commission' }
  ];

  return (
    <div className="space-y-6">
      <div className="app-surface-primary rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <BarChart3 size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">PnL Statement</h3>
              <p className="text-slate-400 text-sm">Download your trading history</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={filteredHistory.length === 0}
              className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 rounded-xl transition-colors border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={16} />
              <span className="text-sm">CSV</span>
            </button>
            <button
              onClick={handleDownloadHtml}
              disabled={filteredHistory.length === 0}
              className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 px-4 py-2 rounded-xl transition-colors border border-blue-500/30 text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText size={16} />
              <span className="text-sm">HTML</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={filteredHistory.length === 0}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 rounded-xl transition-colors border border-red-500/30 text-red-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={16} />
              <span className="text-sm">PDF</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-400" />
              <div className="flex app-surface-muted rounded-xl p-1">
                {(['all', 'futures', 'cfd'] as TradeType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => setTradeType(type)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      tradeType === type
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {type === 'all' ? 'All' : type === 'futures' ? 'Futures' : 'CFD'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="app-input text-sm px-3 py-1.5 rounded-lg border border-slate-700/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
              <span className="text-slate-500 text-sm">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="app-input text-sm px-3 py-1.5 rounded-lg border border-slate-700/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Settings2 size={16} className="text-slate-400" />
            <span className="text-slate-400 text-sm">Columns:</span>
            <div className="flex flex-wrap gap-2">
              {columnToggles.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleColumn(key)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 border ${
                    columns[key]
                      ? 'bg-slate-700/50 border-slate-600/50 text-white'
                      : 'bg-slate-900/30 border-slate-800/50 text-slate-500'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                    columns[key]
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'border-slate-600 bg-transparent'
                  }`}>
                    {columns[key] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="app-surface-muted rounded-xl p-4">
            <div className="text-slate-400 text-xs mb-1">Total Trades</div>
            <div className="text-xl font-bold text-white">{filteredHistory.length}</div>
          </div>
          <div className="app-surface-muted rounded-xl p-4">
            <div className="text-slate-400 text-xs mb-1">Total Profit</div>
            <div className={`text-xl font-bold flex items-center gap-1 ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalProfit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}
            </div>
          </div>
          <div className="app-surface-muted rounded-xl p-4">
            <div className="text-slate-400 text-xs mb-1">Total Swap</div>
            <div className="text-xl font-bold text-amber-400">{totalSwap.toFixed(2)}</div>
          </div>
          <div className="app-surface-muted rounded-xl p-4">
            <div className="text-slate-400 text-xs mb-1">Total Commission</div>
            <div className="text-xl font-bold text-slate-300">{totalSpread.toFixed(2)}</div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-emerald-400" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-1">No closed trades found</p>
            <p className="text-sm">Closed positions will appear here</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Order ID</th>
                    <th className="text-left text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Symbol</th>
                    <th className="text-left text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Type</th>
                    <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Size</th>
                    <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Margin</th>
                    <th className="text-left text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Currency</th>
                    <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Open Price</th>
                    <th className="text-left text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Open Time</th>
                    <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Close Price</th>
                    <th className="text-left text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Close Time</th>
                    {columns.sl && <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">S/L</th>}
                    {columns.tp && <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">T/P</th>}
                    {columns.swap && <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Swap</th>}
                    {columns.commission && <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Commission</th>}
                    <th className="text-right text-slate-400 font-semibold py-3 px-2 whitespace-nowrap">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${
                        idx % 2 === 0 ? 'bg-slate-900/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-2 text-slate-300 font-mono text-xs">{row.id.slice(0, 8)}</td>
                      <td className="py-2.5 px-2 text-white font-medium">{row.symbol}</td>
                      <td className="py-2.5 px-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          row.side === 'long'
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {row.side === 'long' ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-300">{row.amount.toFixed(4)}</td>
                      <td className="py-2.5 px-2 text-right text-slate-300">{row.margin.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-slate-300">{getCurrencyForSymbol(row.symbol)}</td>
                      <td className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs">{formatPrice(row.entry_price, row.symbol)}</td>
                      <td className="py-2.5 px-2 text-slate-400 text-xs whitespace-nowrap">{formatDateTime(row.open_time)}</td>
                      <td className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs">{formatPrice(row.exit_price, row.symbol)}</td>
                      <td className="py-2.5 px-2 text-slate-400 text-xs whitespace-nowrap">{formatDateTime(row.close_time)}</td>
                      {columns.sl && <td className="py-2.5 px-2 text-right text-slate-500">--</td>}
                      {columns.tp && <td className="py-2.5 px-2 text-right text-slate-500">--</td>}
                      {columns.swap && <td className="py-2.5 px-2 text-right text-amber-400">{(row.accumulated_swap_cost || 0).toFixed(2)}</td>}
                      {columns.commission && <td className="py-2.5 px-2 text-right text-slate-300">{(row.spread_cost || 0).toFixed(2)}</td>}
                      <td className={`py-2.5 px-2 text-right font-bold ${row.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {row.pnl >= 0 ? '+' : ''}{row.pnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
              <div className="text-slate-400 text-sm">
                Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}-{Math.min(currentPage * ROWS_PER_PAGE, filteredHistory.length)} of {filteredHistory.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-slate-300 text-sm px-2">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PnlStatement;


