const MIN_VISIBLE_BARS = 60;
const RIGHT_PADDING_BARS = 3;

/** Initialise a market view as history arrives, then preserve the user's view. */
export class ChartViewport {
  private key = '';
  private fittedBars = 0;
  private settled = false;
  private userAdjusted = false;

  preserve() {
    this.userAdjusted = true;
  }

  reset() {
    this.key = '';
    this.fittedBars = 0;
    this.settled = false;
    this.userAdjusted = false;
  }

  rangeFor(key: string, barCount: number, loading: boolean) {
    if (key !== this.key) {
      this.reset();
      this.key = key;
    }
    if (loading) this.settled = false;
    if (!barCount || this.userAdjusted) return null;

    // The initial quote is provisional. Fit again when the history read ends,
    // and when a sparse cache is filled by the provider's history warmup.
    const needsFit = !this.fittedBars || (!loading && (
      !this.settled || (this.fittedBars < MIN_VISIBLE_BARS && barCount > this.fittedBars)
    ));
    if (!needsFit) return null;
    this.fittedBars = barCount;
    this.settled = !loading;
    return {
      from: barCount - Math.max(MIN_VISIBLE_BARS, barCount) - 0.5,
      to: barCount - 1 + RIGHT_PADDING_BARS,
    };
  }
}
