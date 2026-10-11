import type { Snapshot } from './types';
import { distance, wallRay } from './world';

export type DungeonAudioCue = 'swing' | 'hurt' | 'chest' | 'pickup' | 'return';
type VisibleActor = Snapshot['actors'][number];
const HALF_FOV_TANGENT = Math.tan(76 * Math.PI / 360);

/** Use the same vertical field of view as the dungeon camera. No wall or rear radar. */
function visibleChest(snapshot: Snapshot, actor: VisibleActor, position: VisibleActor['position'], aspect: number) {
  if (distance(actor.position, position) > 2.6) return false;
  const eye = { ...actor.position, y: actor.position.y + 1.52 };
  const center = { ...position, y: position.y + .5 };
  if (wallRay(eye, center, snapshot.seed, snapshot.doors)) return false;
  const dx = center.x - eye.x, dy = center.y - eye.y, dz = center.z - eye.z;
  const sy = Math.sin(actor.yaw), cy = Math.cos(actor.yaw), sp = Math.sin(actor.pitch), cp = Math.cos(actor.pitch);
  const depth = -dx * sy * cp + dy * sp - dz * cy * cp;
  const horizontal = dx * cy - dz * sy;
  const vertical = dx * sy * sp + dy * cp + dz * cy * sp;
  return depth > 0 && Math.abs(horizontal) <= depth * HALF_FOV_TANGENT * aspect && Math.abs(vertical) <= depth * HALF_FOV_TANGENT;
}

/** Only confirmed local changes produce cues; a missed/rejoined raid is never replayed. */
export function dungeonAudioCues(previous: Snapshot | null, next: Snapshot, aspect = 1): DungeonAudioCue[] {
  if (!previous || previous.you !== next.you || previous.raid !== next.raid || previous.phase !== 'raid' || next.tick < previous.tick || next.elapsed < previous.elapsed || next.elapsed - previous.elapsed > 1) return [];
  const before = previous.actors.find(actor => actor.id === previous.you);
  const after = next.actors.find(actor => actor.id === next.you);
  if (!before || !after || before.status !== 'alive') return [];
  const cues: DungeonAudioCue[] = [];
  if (after.status === 'extracted') cues.push('return');
  if (after.damageTaken > before.damageTaken || after.hp < before.hp) cues.push('hurt');
  if (after.status !== 'alive' || next.phase !== 'raid') return cues;
  if (after.bag.some(item => !before.bag.some(old => old.id === item.id))) cues.push('pickup');
  const viewportAspect = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, aspect) : 1;
  if (next.containers.some(container => container.kind === 'chest' && container.opened
    && previous.containers.some(old => old.id === container.id && !old.opened)
    && visibleChest(next, after, container.position, viewportAspect))) cues.push('chest');
  if (after.phase === 'windup' && before.phase !== 'windup') cues.push('swing');
  return cues;
}

const SOUNDS: Record<DungeonAudioCue, { type: OscillatorType; start: number; end: number; duration: number; gain: number; cooldown: number }> = {
  swing: { type: 'triangle', start: 230, end: 85, duration: .1, gain: .022, cooldown: .16 },
  hurt: { type: 'sawtooth', start: 145, end: 55, duration: .14, gain: .026, cooldown: .12 },
  chest: { type: 'triangle', start: 290, end: 510, duration: .16, gain: .024, cooldown: .25 },
  pickup: { type: 'sine', start: 740, end: 1120, duration: .1, gain: .022, cooldown: .12 },
  return: { type: 'sine', start: 520, end: 1040, duration: .34, gain: .027, cooldown: .75 },
};
const MAX_VOICES = 3;

/** Silent until unlock() is called by an ordinary user gesture. No assets or music. */
export function createDungeonAudio() {
  let context: AudioContext | null = null;
  let disposed = false, muted = false, resuming = false, lastSnapshot = '';
  const voices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
  const lastCue = new Map<DungeonAudioCue, number>();
  function stopVoices() {
    for (const voice of voices) {
      voice.oscillator.onended = null;
      try { voice.oscillator.stop(); } catch { /* Already ended. */ }
      voice.oscillator.disconnect(); voice.gain.disconnect();
    }
    voices.clear();
  }
  function unlock() {
    if (disposed || muted) return;
    try {
      if (!context) {
        if (typeof globalThis.AudioContext !== 'function') return;
        context = new AudioContext();
      }
      if (context.state === 'suspended' && !resuming) {
        resuming = true;
        void context.resume().catch(() => { /* Browser denied audio; gameplay continues. */ }).finally(() => { resuming = false; });
      }
    } catch { /* Unsupported/restricted audio must never stop the game. */ }
  }
  function play(cue: DungeonAudioCue) {
    if (!context || context.state !== 'running' || voices.size >= MAX_VOICES) return;
    const sound = SOUNDS[cue], now = context.currentTime;
    if (now - (lastCue.get(cue) ?? -Infinity) < sound.cooldown) return;
    let oscillator: OscillatorNode | null = null, gain: GainNode | null = null;
    try {
      oscillator = context.createOscillator(); gain = context.createGain();
      oscillator.type = sound.type;
      oscillator.frequency.setValueAtTime(sound.start, now);
      oscillator.frequency.exponentialRampToValueAtTime(sound.end, now + sound.duration);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(sound.gain, now + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + sound.duration);
      oscillator.connect(gain); gain.connect(context.destination);
      const voice = { oscillator, gain }; voices.add(voice);
      oscillator.onended = () => { oscillator!.disconnect(); gain!.disconnect(); voices.delete(voice); };
      oscillator.start(now); oscillator.stop(now + sound.duration + .015);
      lastCue.set(cue, now);
    } catch {
      if (oscillator) {
        oscillator.onended = null;
        try { oscillator.stop(); } catch { /* A failed voice may not have started. */ }
        oscillator.disconnect();
      }
      gain?.disconnect();
      for (const voice of voices) if (voice.oscillator === oscillator) voices.delete(voice);
    }
  }
  return {
    unlock,
    update(previous: Snapshot | null, next: Snapshot) {
      if (disposed) return;
      const identity = `${next.you}:${next.raid}:${next.tick}:${next.lastAction}`;
      if (identity === lastSnapshot) return;
      lastSnapshot = identity;
      if (muted || !context || context.state !== 'running') return;
      const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 1;
      for (const cue of dungeonAudioCues(previous, next, aspect)) play(cue);
    },
    setMuted(value: boolean) { muted = value; if (muted) stopVoices(); },
    dispose() {
      if (disposed) return;
      disposed = true; stopVoices(); lastCue.clear();
      if (context) { try { void context.close().catch(() => { /* Already closed. */ }); } catch { /* Unsupported close. */ } }
      context = null;
    },
  };
}
