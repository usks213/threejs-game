export function gameSound(signal: AbortSignal) {
 let context: AudioContext | null = null, muted = false;
 const unlock = () => { if (!context) context = new AudioContext(); void context.resume().catch(() => {}); };
 window.addEventListener('pointerdown', unlock, { signal, once: true }); window.addEventListener('keydown', unlock, { signal, once: true });
 signal.addEventListener('abort', () => { void context?.close(); }, { once: true });
 return {
  toggle() { muted = !muted; return muted; },
  effect(message: string) {
   if (!context || muted || document.hidden || context.state !== 'running') return;
   const oscillator = context.createOscillator(), gain = context.createGain(), time = context.currentTime;
   oscillator.type = /攻撃|岩|掘/.test(message) ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(/魔法|火球|癒/.test(message) ? 600 : /作りました|回復|倒/.test(message) ? 520 : 190, time); oscillator.frequency.exponentialRampToValueAtTime(90, time + 0.12);
   gain.gain.setValueAtTime(0.035, time); gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(time + 0.2); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  },
 };
}
