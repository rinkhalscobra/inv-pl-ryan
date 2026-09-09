import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

type TradeType = 'all' | 'futures' | 'cfd';

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
  if (symbol.includes('/') && !symbol.includes('JPY')) return price.toFixed(5);
  if (symbol.includes('JPY')) return price.toFixed(3);
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function getCurrencyForSymbol(symbol: string): string {
  if (symbol.includes('/')) return symbol.split('/')[0];
  return 'USD';
}

function drawAtlasMarketLogo(doc: jsPDF, x: number, y: number, size: number) {
  const s = size / 24;

  doc.setFillColor(37, 99, 235);
  const radius = size * 0.18;
  const cx = x + size / 2;
  const cy = y + size / 2;
  doc.roundedRect(x, y, size, size, radius, radius, 'F');

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(s * 2.2);
  doc.setLineCap('round');

  doc.line(cx, y + s * 2, cx, y + size - s * 2);

  const topBarY = y + s * 5;
  doc.line(x + s * 17, topBarY, x + s * 9.5, topBarY);
  const cp1x = x + s * 6;
  const cp1y = topBarY;
  const midY = topBarY + s * 3.5;
  const endX = x + s * 9.5;
  const endY = topBarY + s * 7;

  const steps = 20;
  let prevX = x + s * 9.5;
  let prevY = topBarY;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const px = mt * mt * prevX + 2 * mt * t * cp1x + t * t * endX;
    const py = mt * mt * topBarY + 2 * mt * t * cp1y + t * t * midY;
    if (i === 1) {
      prevX = px;
      prevY = py;
      continue;
    }
    doc.line(prevX, prevY, px, py);
    prevX = px;
    prevY = py;
  }

  doc.line(endX, endY, x + s * 14.5, endY);

  const botBarY = endY;
  const cp2x = x + s * 18;
  const cp2y = botBarY;
  const botEndY = botBarY + s * 7;
  const botEndX = x + s * 14.5;

  prevX = x + s * 14.5;
  prevY = botBarY;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const px = mt * mt * prevX + 2 * mt * t * cp2x + t * t * botEndX;
    const py = mt * mt * botBarY + 2 * mt * t * cp2y + t * t * botEndY;
    if (i === 1) {
      prevX = px;
      prevY = py;
      continue;
    }
    doc.line(prevX, prevY, px, py);
    prevX = px;
    prevY = py;
  }

  doc.line(x + s * 6, botEndY, botEndX, botEndY);
}

export function generateTradePdf(
  filteredHistory: PositionHistoryRow[],
  totalProfit: number,
  tradeType: TradeType,
  dateFrom: string,
  dateTo: string,
  cols: ColumnVisibility
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  drawAtlasMarketLogo(doc, margin, 10, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(37, 99, 235);
  doc.text('Atlas Market', margin + 18, 19.5);

  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text('TRADE STATEMENT', pageWidth / 2, 18, { align: 'center' });

  const typeLabel = tradeType === 'all' ? 'All Trades' : tradeType === 'futures' ? 'Futures' : 'CFD';
  const dateRange = dateFrom || dateTo
    ? `${dateFrom || 'Start'} \u2013 ${dateTo || 'Present'}`
    : 'All Time';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`${typeLabel}  |  ${dateRange}`, pageWidth / 2, 24, { align: 'center' });

  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 31);
  doc.text(`Total Trades: ${filteredHistory.length}`, pageWidth - margin, 31, { align: 'right' });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, 33, pageWidth - margin, 33);

  const headers: string[] = [
    'Order ID', 'Symbol', 'Type', 'Size', 'Margin', 'Currency',
    'Open Price', 'Open Time', 'Close Price', 'Close Time'
  ];
  if (cols.sl) headers.push('S/L');
  if (cols.tp) headers.push('T/P');
  if (cols.swap) headers.push('Swap');
  if (cols.commission) headers.push('Commission');
  headers.push('Profit');

  const body = filteredHistory.map(row => {
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
    if (cols.sl) cells.push('--');
    if (cols.tp) cells.push('--');
    if (cols.swap) cells.push((row.accumulated_swap_cost || 0).toFixed(2));
    if (cols.commission) cells.push((row.spread_cost || 0).toFixed(2));
    cells.push(row.pnl.toFixed(2));
    return cells;
  });

  const profitColIndex = headers.length - 1;
  const typeColIndex = 2;

  autoTable(doc, {
    startY: 36,
    head: [headers],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 2.5,
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2,
      textColor: [40, 40, 40],
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 18, font: 'courier', fontSize: 6.5 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      6: { halign: 'right', font: 'courier', fontSize: 6.5 },
      7: { fontSize: 6.5 },
      8: { halign: 'right', font: 'courier', fontSize: 6.5 },
      9: { fontSize: 6.5 },
      [profitColIndex]: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    didParseCell(data) {
      if (data.section === 'body') {
        if (data.column.index === profitColIndex) {
          const val = parseFloat(data.cell.raw as string);
          if (val >= 0) {
            data.cell.styles.textColor = [22, 163, 74];
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
        if (data.column.index === typeColIndex) {
          const val = data.cell.raw as string;
          if (val === 'BUY') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'SELL') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
    didDrawPage(data) {
      const pageH = doc.internal.pageSize.getHeight();
      const pageNum = doc.getCurrentPageInfo().pageNumber;
      const totalPages = doc.getNumberOfPages();

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, pageH - 12, pageWidth - margin, pageH - 12);

      doc.setFontSize(7.5);
      doc.setTextColor(130, 130, 130);
      doc.setFont('helvetica', 'normal');
      doc.text('Generated by Atlas Market  |  dex.vestio.ai', margin, pageH - 8);
      doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageH - 8, { align: 'right' });

      if (pageNum > 1) {
        drawAtlasMarketLogo(doc, margin, 5, 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(37, 99, 235);
        doc.text('Atlas Market', margin + 11, 10.5);
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 180;
  const pageH = doc.internal.pageSize.getHeight();

  if (finalY + 25 > pageH - 15) {
    doc.addPage();
  }

  const summaryY = finalY + 25 > pageH - 15 ? 25 : finalY + 10;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, summaryY, pageWidth - margin, summaryY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text('Total Profit:', margin, summaryY + 8);

  const profitStr = `${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} USD`;
  if (totalProfit >= 0) {
    doc.setTextColor(22, 163, 74);
  } else {
    doc.setTextColor(220, 38, 38);
  }
  doc.setFontSize(14);
  doc.text(profitStr, margin + 35, summaryY + 8);

  const typeLabel2 = tradeType === 'all' ? 'all' : tradeType;
  doc.save(`trade_statement_${typeLabel2}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
