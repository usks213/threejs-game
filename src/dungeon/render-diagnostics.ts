/** Optional test=1 telemetry. Counts CPU submission/RAF work, never GPU completion
 * or presentation. Fixed histograms avoid retaining per-frame samples. */
export const DUNGEON_TIMING_BOUNDS_MS = [16.7, 33.4, 50, 100, 250, 500, 1000] as const;
interface Timing {count: number; totalMs: number; maxMs: number; lastMs: number | null; bins: number[]}
export interface DungeonRenderStats {
 submission: {frame: number; calls: number; triangles: number; points: number; lines: number};
 memory: {geometries: number; textures: number; programs: number};
 camera: {position: {x: number; y: number; z: number}; yaw: number; pitch: number};
 resolution: {width: number; height: number; dpr: number};
 graphicsFailed: boolean;
}
export type DungeonRenderDiagnosticsSnapshot = ReturnType<DungeonRenderDiagnostics['snapshot']>;
const timing = (): Timing => ({count: 0, totalMs: 0, maxMs: 0, lastMs: null, bins: Array(DUNGEON_TIMING_BOUNDS_MS.length + 1).fill(0)});
function record(value: Timing, ms: number) {
 if (!Number.isFinite(ms) || ms < 0) return;
 value.count++; value.totalMs += ms; value.maxMs = Math.max(value.maxMs, ms); value.lastMs = ms;
 let bin = 0; while (bin < DUNGEON_TIMING_BOUNDS_MS.length && ms > DUNGEON_TIMING_BOUNDS_MS[bin]) bin++; value.bins[bin]++;
}
const copyTiming = (value: Timing) => ({...value, bins: [...value.bins]});
export class DungeonRenderDiagnostics {
 private generation = 0; private disposed = false;
 private rafCallbacks = 0; private lastRafAtMs: number | null = null; private rafGaps = timing();
 private attempts = 0; private successes = 0; private failures = 0;
 private enteredAtMs: number | null = null; private lastReturnAtMs: number | null = null; private lastSuccessfulReturnAtMs: number | null = null;
 private inFlight = false; private submissionDurations = timing();
 raf(now: number) {
  if (this.disposed || !Number.isFinite(now)) return;
  this.rafCallbacks++; if (this.lastRafAtMs !== null) record(this.rafGaps, now - this.lastRafAtMs); this.lastRafAtMs = now;
 }
 beginSubmission(now: number) {
  if (this.disposed || !Number.isFinite(now)) return;
  this.attempts++; this.enteredAtMs = now; this.inFlight = true;
 }
 endSubmission(now: number, succeeded: boolean) {
  if (this.disposed || !this.inFlight || !Number.isFinite(now)) return;
  record(this.submissionDurations, now - this.enteredAtMs!); this.lastReturnAtMs = now; this.inFlight = false;
  if (succeeded) {this.successes++; this.lastSuccessfulReturnAtMs = now;} else this.failures++;
 }
 reset() {
  if (this.disposed) return;
  this.generation++; this.rafCallbacks = 0; this.lastRafAtMs = null; this.rafGaps = timing();
  this.attempts = this.successes = this.failures = 0; this.enteredAtMs = this.lastReturnAtMs = this.lastSuccessfulReturnAtMs = null;
  this.inFlight = false; this.submissionDurations = timing();
 }
 snapshot(stats: DungeonRenderStats | null = null) {
  return {meaning: 'CPU render submission; not GPU completion or presentation', generation: this.generation, disposed: this.disposed,
   timingBoundsMs: [...DUNGEON_TIMING_BOUNDS_MS], raf: {callbacks: this.rafCallbacks, lastAtMs: this.lastRafAtMs, gaps: copyTiming(this.rafGaps)},
   submission: {attempts: this.attempts, successes: this.successes, failures: this.failures, inFlight: this.inFlight,
    lastEntryAtMs: this.enteredAtMs, lastReturnAtMs: this.lastReturnAtMs, lastSuccessfulReturnAtMs: this.lastSuccessfulReturnAtMs, durations: copyTiming(this.submissionDurations)},
   stats: stats ? structuredClone(stats) : null};
 }
 dispose() {if (this.disposed) return; this.reset(); this.disposed = true;}
}
