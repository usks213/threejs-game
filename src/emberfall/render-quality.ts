import type { GraphicsQuality } from './lighting';
/** One-way performance fallback; an explicit user choice resets it. */
export class QualityGovernor {
  requested: GraphicsQuality = 'balanced';
  effective: GraphicsQuality = 'balanced';
  private slowUpdates = 0;
  set(quality: GraphicsQuality) { this.requested = this.effective = quality; this.slowUpdates = 0; }
  observe(milliseconds: number) {
    const threshold = this.effective === 'high' ? 12 : 9;
    this.slowUpdates = milliseconds > threshold ? this.slowUpdates + 1 : Math.max(0, this.slowUpdates - 1);
    if (this.slowUpdates < 6 || this.effective === 'low') return false;
    this.effective = this.effective === 'high' ? 'balanced' : 'low'; this.slowUpdates = 0; return true;
  }
}
