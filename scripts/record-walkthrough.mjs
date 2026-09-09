import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const outDir = path.join(root, 'artifacts', 'walkthrough');
const framesDir = path.join(outDir, 'frames');
fs.mkdirSync(framesDir, { recursive: true });
for (const name of fs.readdirSync(framesDir)) {
  if (name.endsWith('.png') || name.endsWith('.jpg')) fs.unlinkSync(path.join(framesDir, name));
}

const email = process.env.WALKTHROUGH_EMAIL;
const password = process.env.WALKTHROUGH_PASSWORD;
if (!email || !password) throw new Error('WALKTHROUGH_EMAIL and WALKTHROUGH_PASSWORD are required');

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = fs.existsSync(edge) ? edge : chrome;
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.addInitScript(() => {
  localStorage.setItem('i18nextLng', 'en');
  sessionStorage.setItem('marketLoadingShown', 'true');
});

let frame = 0;
let recording = true;
let lastFrameAt = 0;
const cdp = await page.context().newCDPSession(page);
cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  const now = metadata?.timestamp ? metadata.timestamp * 1000 : Date.now();
  if (recording && now - lastFrameAt >= 190) {
    lastFrameAt = now;
    fs.writeFileSync(path.join(framesDir, `frame-${String(frame++).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
  }
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1 });
const pause = (ms) => page.waitForTimeout(ms);
const narration = [];

async function caption(title, body, seconds = 5, accent = '#8b5cf6') {
  narration.push(`${title}. ${body}`);
  await page.evaluate(({ title, body, accent, seconds }) => {
    document.getElementById('walkthrough-caption')?.remove();
    const el = document.createElement('div');
    el.id = 'walkthrough-caption';
    el.innerHTML = `<div class="wt-kicker">${title}</div><div class="wt-body">${body}</div><div class="wt-progress"></div>`;
    el.style.cssText = `position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;width:min(1080px,calc(100vw - 80px));padding:16px 22px;border:1px solid ${accent}88;border-radius:16px;background:rgba(8,12,27,.94);box-shadow:0 18px 60px rgba(0,0,0,.55);color:#fff;font-family:Inter,Segoe UI,sans-serif;pointer-events:none`;
    const style = document.createElement('style');
    style.id = 'walkthrough-style';
    style.textContent = `.wt-kicker{font-size:14px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${accent};margin-bottom:6px}.wt-body{font-size:22px;line-height:1.35}.wt-progress{height:3px;width:0;margin-top:12px;border-radius:9px;background:${accent};animation:wtprogress ${seconds}s linear forwards}@keyframes wtprogress{to{width:100%}}.wt-focus{outline:4px solid ${accent}!important;outline-offset:4px!important;box-shadow:0 0 0 9px ${accent}33!important}`;
    document.head.appendChild(style);
    document.body.appendChild(el);
  }, { title, body, accent, seconds });
  await pause(seconds * 1000);
}

async function focus(locator) {
  await page.locator('.wt-focus').evaluateAll((els) => els.forEach((el) => el.classList.remove('wt-focus'))).catch(() => {});
  await locator.first().scrollIntoViewIfNeeded().catch(() => {});
  await locator.first().evaluate((el) => el.classList.add('wt-focus')).catch(() => {});
}

await page.goto('http://127.0.0.1:4173/signin', { waitUntil: 'domcontentloaded', timeout: 60000 });
await caption('Secure sign-in', 'Sign in with your account. Keep your password private and enable two-factor authentication when available.', 4);
await page.getByPlaceholder(/enter your email/i).fill(email);
await page.getByPlaceholder(/enter your password/i).fill(password);
await focus(page.getByRole('button', { name: /sign in/i }));
await pause(2_000);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL((url) => url.pathname === '/', { timeout: 60000 });
await page.waitForLoadState('domcontentloaded');
await pause(6_000);

await caption('Chapter 1 — Dashboard', 'The dashboard is the account control center. We will cover the header, account state, portfolio summary, performance chart, market overview, activity tabs, quick actions, and news area one by one.', 10);
await caption('Dashboard overview', 'Start here: review portfolio value, available balance, active positions, performance, and market cards before placing any trade.', 7);
await caption('Main navigation', 'Home returns to this dashboard. Swap opens asset conversion. Futures opens leveraged crypto trading. CFD opens forex, commodity, index, and stock contracts. The highlighted item shows the current section.', 10);
await caption('Portfolio value control', 'Portfolio Value estimates the combined account value in the selected display currency. The eye control hides or reveals the number; the currency menu changes display only and does not convert holdings.', 9);
await caption('Demo or live badge', 'The DEMO or LIVE badge is critical. Demo activity uses simulated funds. Live activity can affect real balances. Always verify this badge before touching an order button.', 8);
await caption('Account tier and user menu', 'The tier badge represents the account status. The profile menu contains wallet, profile, security, and sign-out actions. Account settings are separate from trading controls.', 8);
await caption('Dashboard summary cards', 'The change card summarizes account movement for the selected period. Positions P and L totals open-position profit and loss. BTC Price is market reference data. Trading Volume summarizes executed activity.', 10);
await caption('Understanding P and L', 'Positive unrealized P and L is not secured profit. It changes with live prices until the position is closed. Negative P and L is likewise unrealized until exit or liquidation.', 9);
await caption('Portfolio performance chart', 'The performance chart plots account value over time. Use the period selectors to compare short and long windows. A rising line can reflect deposits as well as trading performance, so check transactions too.', 11);
await caption('Market overview', 'Market Overview gives quick prices and percentage changes for major assets. Green or red movement describes the selected time window; it is not a recommendation to buy or sell.', 9);
await page.mouse.wheel(0, 520);
await pause(3_000);
await caption('Overview, positions, and transactions tabs', 'Overview combines recent information. Positions lists current exposure. Transactions lists balance-changing activity. Switching tabs changes the dataset; it does not open or close anything.', 10);
await caption('Check existing exposure', 'Review open positions and recent activity first. This prevents accidental overexposure or duplicating an existing position.', 6);
await caption('Position cards', 'Each position card identifies the symbol, long or short side, leverage, entry price, live price, and unrealized result. Read all of them before adding risk in the same market.', 9);
await caption('Recent transactions', 'Recent Transactions records deposits, withdrawals, swaps, trading adjustments, and other balance events. Use the date, description, direction, and amount to reconcile account changes.', 9);
await caption('Quick actions and news', 'Quick actions are shortcuts into trading or wallet flows. The news section provides context only; headlines can be delayed or incomplete and should never replace independent analysis.', 9);
await page.mouse.wheel(0, -800);
await pause(2_000);

const futures = page.getByRole('button', { name: /futures/i }).first();
await focus(futures);
await caption('Chapter 2 — Futures workspace', 'The Futures screen has five functional regions: header and pair selector, order book, chart, market list, order-entry forms, and the position and order-management table below.', 10, '#38bdf8');
await caption('Open Futures', 'Choose Futures from the main navigation. Futures use leverage, so both gains and losses can grow quickly.', 5);
await futures.click();
await pause(8_000);

await caption('Futures header', 'The header confirms the selected symbol, current reference price, portfolio value, account mode, and account tier. Re-check the symbol after every navigation or search action.', 9, '#38bdf8');
await caption('Choose the crypto pair', 'Use the pair selector to choose the market. Confirm the symbol and live price before entering an order.', 5, '#38bdf8');
const pairButton = page.locator('header button').filter({ hasText: /BTC|ETH|USDT/ }).first();
await focus(pairButton);
await pairButton.click().catch(() => {});
await pause(2_000);
const search = page.getByPlaceholder(/search pairs/i);
if (await search.count()) {
  await search.fill('ETH');
  await pause(2_000);
  const eth = page.getByRole('button', { name: /ETH.*USDT/i }).first();
  if (await eth.count()) await eth.click();
}
await pause(4_000);

await caption('Markets panel', 'The markets list is another pair selector. It compares available symbols, current prices, and changes. Selecting a row updates the chart, order book, and both order forms together.', 9, '#38bdf8');
await caption('Order book', 'Red rows represent resting sell liquidity and green rows resting buy liquidity. Price is the quote, amount is size at that level, and cumulative totals show visible depth. The book changes continuously.', 11, '#38bdf8');
await caption('Spread in the order book', 'The distance between the best ask and best bid is the market spread. A wider spread increases immediate trading cost and can cause a market order to fill away from the last displayed price.', 10, '#38bdf8');
await caption('Trading chart', 'The chart visualizes price history for the selected pair. Timeframe, candle, and indicator controls change analysis only. Drawing on a chart never creates an order.', 9, '#38bdf8');
await caption('Live price versus execution price', 'The displayed live price is a reference. A market order may execute at multiple prices when liquidity is thin. A limit order controls price but may remain unfilled.', 10, '#38bdf8');
await caption('Market or limit order', 'Market executes near the current price. Limit waits for your chosen price. Always verify the order type before continuing.', 6, '#38bdf8');
await caption('Market order behavior', 'A market order prioritizes execution, not exact price. Use it only when immediate entry matters more than slippage. The final fill can differ from the preview.', 9, '#38bdf8');
await caption('Limit order behavior', 'A limit order prioritizes price, not execution. A buy limit normally sits below the market and a sell limit above it. It stays in Open Orders until filled or cancelled.', 10, '#38bdf8');
await caption('Set leverage and margin mode', 'Lower leverage gives more room before liquidation. Isolated limits risk to this position; cross can use more of the account balance.', 7, '#38bdf8');
await caption('Isolated margin', 'Isolated margin assigns a defined margin amount to one position. Losses are contained more clearly, although the position can liquidate sooner if that assigned margin is exhausted.', 10, '#38bdf8');
await caption('Cross margin', 'Cross margin can draw on eligible account margin to support the position. This may delay liquidation but exposes more of the available balance to one losing trade.', 10, '#38bdf8');
await caption('How leverage changes exposure', 'Leverage multiplies market exposure relative to required margin. At ten times leverage, one thousand dollars of exposure may use roughly one hundred dollars of initial margin before fees and buffers.', 11, '#38bdf8');
await caption('Leverage is not a profit setting', 'Selecting higher leverage does not make a trade idea better. It reduces required margin and moves liquidation closer. Risk is determined by exposure, stop distance, and account size together.', 11, '#38bdf8');
await caption('Available margin', 'Available Margin is the amount currently eligible to support new exposure. It differs from total portfolio value because open positions and pending orders reserve margin.', 9, '#38bdf8');
const amountInputs = page.locator('input[type="number"]');
if (await amountInputs.count()) {
  await focus(amountInputs.first());
  await amountInputs.first().fill('0.001').catch(() => {});
}
await caption('Enter position size', 'Enter the asset amount and review required margin, spread cost, and liquidation price. Position size should come from your risk limit—not from the maximum available balance.', 7, '#38bdf8');
await caption('Amount field and percentage shortcuts', 'The amount field is denominated in the base asset, such as BTC or ETH. Percentage buttons calculate a size from available margin. They are convenience tools, not recommended risk levels.', 11, '#38bdf8');
await caption('Required margin calculation', 'Required margin is approximately position notional divided by leverage, plus any platform buffers. It is collateral, not the maximum possible loss if the position uses cross margin.', 10, '#38bdf8');
await caption('Spread cost preview', 'Spread cost estimates the entry disadvantage created by bid and ask pricing. It can change before execution and is separate from commissions, funding, and later slippage.', 9, '#38bdf8');
await caption('Liquidation price', 'Liquidation Price estimates where the platform may forcibly close the position because margin is insufficient. It is not a substitute for a stop loss and may move under cross margin.', 11, '#38bdf8');
await caption('Add protection', 'Set stop loss before entry to cap planned risk, and take profit to define the exit. A long benefits if price rises; a short benefits if price falls.', 7, '#38bdf8');
await caption('Stop-loss trigger and execution', 'The trigger price activates the stop. A market execution prioritizes exit but can slip; a limit execution controls price but might not fill during a fast move.', 11, '#38bdf8');
await caption('Take-profit trigger and execution', 'Take profit automates a planned favorable exit. Its trigger must be placed on the profitable side of entry: above a long entry or below a short entry.', 10, '#38bdf8');
await caption('Long order form', 'The long form is used when the plan expects price to rise. Profit and loss are based on exit price minus entry price, multiplied by position amount, before costs.', 10, '#38bdf8');
await caption('Short order form', 'The short form is used when the plan expects price to fall. Profit and loss reverse direction: entry price minus exit price, multiplied by amount, before costs.', 10, '#38bdf8');
const longButton = page.getByRole('button', { name: /open long|buy.*long|long/i }).last();
if (await longButton.count()) await focus(longButton);
await caption('Final review—do not rush', 'Before pressing Open Long or Open Short, re-check pair, side, size, leverage, margin mode, fees, stop loss, and take profit. This walkthrough does not submit an order.', 8, '#38bdf8');
await caption('Positions tab', 'After a market fill, Positions shows symbol, size, side, entry and current prices, liquidation, margin, swap or funding cost, stop and target, P and L, return, and close controls.', 11, '#38bdf8');
await caption('Open Orders tab', 'Pending limit orders appear in Open Orders with order type, side, price, amount, leverage, reserved margin, and status. Cancel individual orders or Cancel All only after checking the scope.', 11, '#38bdf8');
await caption('Position History tab', 'Position History records completed trades with entry, exit, size, duration, costs, and realized result. Realized P and L is the figure that actually affects the balance.', 10, '#38bdf8');
await caption('Closing a position', 'Use the Close control on the correct row, confirm the symbol and amount, and review the quoted exit. Closing the page, signing out, or switching sections does not close a position.', 11, '#38bdf8');

await page.getByRole('button', { name: /^CFD$/i }).first().click();
await pause(8_000);
await caption('Chapter 3 — CFD workspace', 'The CFD workspace combines instrument details, chart, markets list, order entry, and the same position-management system. CFD contract specifications make sizing different from crypto Futures.', 11, '#f59e0b');
await caption('Open CFD trading', 'CFDs let you speculate on instruments such as forex, commodities, indices, or stocks without owning the underlying asset. They are leveraged and high risk.', 7, '#f59e0b');
await caption('Instrument details panel', 'The left panel describes the selected instrument, current quote, category, trading status, and contract-related information. Verify the exact instrument because similar symbols can represent different products.', 10, '#f59e0b');
const cfdPair = page.locator('header button').filter({ hasText: /EUR|USD|XAU|BTC/ }).first();
await focus(cfdPair);
await cfdPair.click().catch(() => {});
await pause(2_000);
const cfdSearch = page.getByPlaceholder(/search pairs/i);
if (await cfdSearch.count()) {
  await cfdSearch.fill('EUR');
  await pause(2_000);
  const eur = page.getByRole('button', { name: /EUR.*USD/i }).first();
  if (await eur.count()) await eur.click();
}
await pause(4_000);

await caption('CFD markets categories', 'The markets panel groups forex, commodities, indices, and stocks. Search or select a row to update the whole workspace. View-only or closed instruments cannot accept a new trade.', 10, '#f59e0b');
await caption('Forex CFDs', 'Forex pairs quote one currency against another. EUR slash USD, for example, expresses dollars per euro. Pip value, contract size, leverage limits, and trading hours determine exposure and cost.', 12, '#f59e0b');
await caption('Commodity CFDs', 'Commodity CFDs can track gold, silver, oil, or other benchmarks. Contract sizes and price units differ significantly, so never reuse a forex lot assumption for a commodity.', 11, '#f59e0b');
await caption('Index CFDs', 'Index CFDs track a basket benchmark rather than one company. Session gaps, overnight financing, and news from many constituent companies can move the quote quickly.', 10, '#f59e0b');
await caption('Stock CFDs', 'Stock CFDs track individual shares without transferring ownership. Corporate actions, market hours, gaps, dividends, and instrument availability can affect pricing and adjustments.', 10, '#f59e0b');
await caption('CFD size is measured in lots', 'Confirm the instrument and contract size. Enter lots—not dollars. Even 0.01 lot can represent meaningful market exposure.', 7, '#f59e0b');
await caption('Lot size and units', 'A lot is a contract quantity defined by the instrument. The platform converts lots into underlying units before calculating notional value, margin, profit, and loss.', 10, '#f59e0b');
await caption('Minimum trade size', 'The minimum is commonly 0.01 lot on this form, but minimum size does not mean low risk. Multiply lots by contract size and price to understand total exposure.', 10, '#f59e0b');
await caption('CFD price source', 'The displayed quote is a market-data snapshot or live feed depending on availability. Check the connection indicator and refresh state before relying on the preview.', 9, '#f59e0b');
await caption('CFD leverage limits', 'Allowed leverage can vary by account setting and asset class. Forex, commodities, and stocks may each have different minimum and maximum choices.', 9, '#f59e0b');
await caption('CFD market and limit orders', 'Market orders seek immediate execution at the available quote. Limit orders wait at a chosen price. Closed markets, gaps, and fast movement can affect fills.', 10, '#f59e0b');
const cfdInputs = page.locator('input[type="number"]');
if (await cfdInputs.count()) {
  await focus(cfdInputs.first());
  await cfdInputs.first().fill('0.01').catch(() => {});
}
await caption('Review CFD costs and risk', 'Check spread, required margin, leverage, swap or overnight costs, and liquidation risk. Market hours and liquidity differ by instrument.', 8, '#f59e0b');
await caption('CFD spread', 'The spread is the difference between buy and sell prices and is an immediate trading cost. It can widen during low liquidity, session changes, and important news.', 10, '#f59e0b');
await caption('Overnight swap cost', 'Keeping a CFD open across the daily financing cutoff can add a swap charge or credit. The amount depends on instrument, direction, size, and number of nights.', 11, '#f59e0b');
await caption('Weekend and session risk', 'Many CFDs stop quoting outside their market session. News can create a gap when trading resumes, causing stop orders to execute beyond the requested trigger.', 11, '#f59e0b');
await caption('Long versus short', 'Use Long only when your plan expects a rise; use Short only when it expects a fall. Add stop loss and take profit, then verify every field before submission.', 7, '#f59e0b');
await caption('CFD long calculation', 'For a long CFD, gross result is exit minus entry, multiplied by underlying units. Spread, commission, financing, and slippage then reduce or change the net result.', 11, '#f59e0b');
await caption('CFD short calculation', 'For a short CFD, gross result is entry minus exit, multiplied by units. Losses can grow as the price rises, so position size and stop placement remain essential.', 11, '#f59e0b');
await caption('CFD stop and target placement', 'Set triggers using the instrument price scale. Forex may use several decimal places, while indices or commodities use different increments. Confirm the displayed precision.', 10, '#f59e0b');
await caption('Order and position management', 'After submission, monitor Positions, Open Orders, and Position History. Cancel unwanted pending orders and close positions deliberately—never assume a browser close exits a trade.', 8, '#f59e0b');
await caption('Monitoring an open CFD', 'Watch live price, unrealized P and L, margin, liquidation level, financing cost, and stop or target status. A profitable trade can reverse before it is closed.', 10, '#f59e0b');
await caption('Cancelling is not closing', 'Cancel affects a pending order that has not filled. Close exits an existing position. If part of a limit order already filled, cancelling the remainder does not close the filled portion.', 11, '#f59e0b');
await caption('Final pre-trade checklist', 'Confirm account mode, instrument, market status, order type, side, lots, units, leverage, margin mode, required margin, spread, financing, liquidation, stop loss, take profit, and available balance.', 12, '#f59e0b');

await page.getByRole('button', { name: /home|dashboard/i }).first().click().catch(() => {});
await pause(5_000);
await caption('Chapter 4 — Complete operating routine', 'Before trading, inspect the dashboard and existing exposure. Build the order carefully. After entry, monitor positions and orders. At exit, verify the realized result and transaction record.', 11, '#22c55e');
await caption('What this demonstration did', 'This recording signed in, navigated every relevant workspace, searched and selected instruments, entered example sizes, and highlighted every decision point. It intentionally stopped before financial confirmation.', 11, '#22c55e');
await caption('Safe trading checklist', 'Use small risk, understand leverage, confirm every order, and never trade money you cannot afford to lose. This video is a platform guide—not financial advice.', 9, '#22c55e');

recording = false;
await cdp.send('Page.stopScreencast').catch(() => {});
await browser.close();

const ffmpeg = path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const output = path.join(outDir, 'atlas-market-complete-training-v3.mp4');
const silentOutput = path.join(outDir, 'atlas-market-complete-training-v3-silent.mp4');
const narrationText = path.join(outDir, 'narration-v3.txt');
const narrationWav = path.join(outDir, 'narration-v3.wav');
fs.writeFileSync(narrationText, narration.join('\r\n\r\n'), 'utf8');
await new Promise((resolve, reject) => {
  const proc = spawn(ffmpeg, [
    '-y', '-framerate', '5', '-i', path.join(framesDir, 'frame-%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', silentOutput
  ], { stdio: 'inherit' });
  proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
});
await new Promise((resolve, reject) => {
  const proc = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'synthesize-narration.ps1'),
    '-InputPath', narrationText, '-OutputPath', narrationWav
  ], { stdio: 'inherit' });
  proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`narration synthesis exited ${code}`)));
});
const wav = fs.readFileSync(narrationWav);
const byteRate = wav.readUInt32LE(28);
const dataBytes = wav.readUInt32LE(40);
const audioDuration = dataBytes / byteRate;
const videoDuration = frame / 5;
let remainingTempo = audioDuration / Math.max(1, videoDuration - 1);
const tempoFilters = [];
while (remainingTempo > 2) {
  tempoFilters.push('atempo=2');
  remainingTempo /= 2;
}
tempoFilters.push(`atempo=${Math.max(0.5, remainingTempo).toFixed(4)}`);
await new Promise((resolve, reject) => {
  const proc = spawn(ffmpeg, [
    '-y', '-i', silentOutput, '-i', narrationWav,
    '-filter:a', tempoFilters.join(','), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-shortest', '-movflags', '+faststart', output
  ], { stdio: 'inherit' });
  proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`audio mux exited ${code}`)));
});
console.log(JSON.stringify({ output, frames: frame }, null, 2));
