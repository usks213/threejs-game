export type ResolutionMode = 'auto' | 'high' | 'medium' | 'low';

export class AdaptiveResolution {
  scale = 1;
  private slow = 0;
  private fast = 0;
  private samples = 0;

  constructor(public mode: ResolutionMode = 'auto') { this.setMode(mode); }

  setMode(mode: ResolutionMode): void {
    this.mode = mode;
    this.scale = mode === 'low' ? .55 : mode === 'medium' ? .75 : 1;
    this.slow = this.fast = this.samples = 0;
  }

  /** Call before the next draw, using active intervals only, never menu/hidden idle time. */
  observe(milliseconds: number): boolean {
    if (this.mode !== 'auto' || !Number.isFinite(milliseconds) || milliseconds <= 0) return false;
    // Initial shader/environment compilation is not representative of steady rendering.
    if (++this.samples <= 2) return false;
    this.slow = milliseconds > 48 ? this.slow + 1 : Math.max(0, this.slow - 1);
    this.fast = milliseconds < 24 ? this.fast + 1 : 0;
    let next = this.scale;
    if (milliseconds > 180) {
      // Raster cost scales with pixel area. A multi-second active frame must
      // reduce the next draw promptly, rather than taking many seconds to step
      // down through each preset. No scene features or ray samples are removed.
      next = Math.max(.35, Math.floor(this.scale * Math.sqrt(48 / milliseconds) * 20) / 20);
    } else if (this.slow >= 3 && this.scale > .55) {
      next = Math.max(.55, Math.round((this.scale - .15) * 100) / 100);
    } else if (this.fast >= 60 && this.scale < 1) {
      // Restore detail slowly after a transient stall or a lighter scene; avoid
      // permanently pinning quality low because one active frame was expensive.
      next = Math.min(1, Math.round((this.scale + .05) * 100) / 100);
    }
    if (next === this.scale) return false;
    this.scale = next; this.slow = this.fast = 0;
    return true;
  }
}
