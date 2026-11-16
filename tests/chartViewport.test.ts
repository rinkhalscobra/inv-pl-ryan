import assert from 'node:assert/strict';
import test from 'node:test';
import { ChartViewport } from '../src/lib/chartViewport.ts';

for (const market of ['cfd:EUR/USD', 'crypto:BTCUSDT']) {
  test(`${market}: delayed history replaces the quote-only opening view`, () => {
    const viewport = new ChartViewport();
    const view = `${market}:1`;
    assert.equal(viewport.rangeFor(view, 0, true), null);
    const provisional = viewport.rangeFor(view, 1, true)!;
    assert.ok(provisional.to - provisional.from >= 60, 'One quote must not fill the chart width');
    assert.equal(viewport.rangeFor(view, 180, true), null);
    const loaded = viewport.rangeFor(view, 180, false)!;
    assert.ok(loaded.from < 0 && loaded.to > 179, 'The completed history must be visible');
    assert.equal(viewport.rangeFor(view, 180, false), null, 'Minute updates and chart-mode changes preserve the view');
  });
}

test('an initially sparse database is reframed when provider history arrives later', () => {
  const viewport = new ChartViewport();
  const view = 'crypto:BTCUSDT:1';
  const sparse = viewport.rangeFor(view, 2, false)!;
  assert.ok(sparse.to - sparse.from >= 60);
  const backfilled = viewport.rangeFor(view, 40, false)!;
  assert.ok(backfilled.to > 39 && backfilled.from < 0);
  assert.ok(viewport.rangeFor(view, 180, false));
  assert.equal(viewport.rangeFor(view, 181, false), null);
});

test('dragging or zooming during loading preserves the chosen view when history arrives', () => {
  const viewport = new ChartViewport();
  viewport.rangeFor('cfd:EUR/USD:1', 2, true);
  viewport.preserve();
  assert.equal(viewport.rangeFor('cfd:EUR/USD:1', 180, false), null);
  assert.equal(viewport.rangeFor('cfd:EUR/USD:1', 181, false), null);
});

test('new symbols, timeframes and markets initialise independently', () => {
  const viewport = new ChartViewport();
  for (const view of ['crypto:BTCUSDT:1', 'crypto:BTCUSDT:5', 'crypto:ETHUSDT:5', 'cfd:EUR/USD:5']) {
    assert.ok(viewport.rangeFor(view, 3, true));
    assert.ok(viewport.rangeFor(view, 180, false));
    viewport.preserve();
    assert.equal(viewport.rangeFor(view, 180, false), null);
  }
  viewport.reset();
  assert.ok(viewport.rangeFor('cfd:EUR/USD:5', 180, false));
});

test('cached history does not lock the viewport before expanded timeframe history completes', () => {
  const viewport = new ChartViewport();
  viewport.rangeFor('cfd:EUR/USD:1', 180, false);
  viewport.rangeFor('cfd:EUR/USD:60', 3, true);
  assert.equal(viewport.rangeFor('cfd:EUR/USD:60', 20, true), null);
  assert.ok(viewport.rangeFor('cfd:EUR/USD:60', 180, false));
  assert.equal(viewport.rangeFor('cfd:EUR/USD:60', 180, false), null);
});
