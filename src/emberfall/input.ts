import { idleInput } from './simulation';
import type { Input } from './simulation';
export class Controls {
  readonly state: Input = idleInput();
  private keys = new Set<string>();
  private pointers = new Map<number, 'move' | 'aim' | 'fly' | 'spray'>();
  private moveX = 0; private mouseFire = false;
  private abort = new AbortController();
  enabled = false;
  constructor(root: HTMLElement, aim: (x: number, y: number) => { x: number; y: number }, public command: (key: string) => void) {
    const signal = this.abort.signal;
    const listen = (target: EventTarget, name: string, fn: EventListener) => target.addEventListener(name, fn, { signal, passive: false });
    listen(window, 'keydown', ((e: KeyboardEvent) => { if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); this.command('Escape'); return; } if ((e.target as HTMLElement)?.closest('select,input,textarea')) return; if (!this.enabled) return; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault(); if (!e.repeat && ['KeyE','Tab','Escape','Digit1','Digit2','KeyQ'].includes(e.code)) this.command(e.code); this.keys.add(e.code); this.refresh(); }) as EventListener);
    listen(window, 'keyup', ((e: KeyboardEvent) => { this.keys.delete(e.code); this.refresh(); }) as EventListener);
    const release = (e: PointerEvent) => { this.pointers.delete(e.pointerId); if (e.pointerType === 'mouse') this.mouseFire = false; if (!Array.from(this.pointers.values()).includes('move')) this.moveX = 0; this.refresh(); };
    listen(root, 'pointerdown', ((e: PointerEvent) => {
      if (!this.enabled) return;
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-control]');
      if (!target) return;
      const kind = target.dataset.control as 'move' | 'aim' | 'fly' | 'spray';
      e.preventDefault(); target.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, kind);
      if (kind === 'move') { const r = target.getBoundingClientRect(); this.moveX = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width * 0.3))); }
      if (kind === 'aim') { const r = target.getBoundingClientRect(); const vector = e.pointerType !== 'mouse' && target.classList.contains('aim-pad') ? { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 } : aim(e.clientX, e.clientY); this.state.aimX = Math.abs(vector.x) + Math.abs(vector.y) < 3 ? 1 : vector.x; this.state.aimY = vector.y; if (e.pointerType === 'mouse') this.mouseFire = true; }
      this.refresh();
    }) as EventListener);
    listen(root, 'pointermove', ((e: PointerEvent) => {
      if (!this.enabled) return;
      const kind = this.pointers.get(e.pointerId);
      if (kind === 'move') { const target = e.target as HTMLElement, r = target.getBoundingClientRect(); this.moveX = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width * 0.3))); }
      if (kind === 'aim' || (e.pointerType === 'mouse' && (e.target as HTMLElement).dataset.control === 'aim')) { const target = e.target as HTMLElement, r = target.getBoundingClientRect(); const vector = e.pointerType !== 'mouse' && target.classList.contains('aim-pad') ? { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 } : aim(e.clientX, e.clientY); this.state.aimX = Math.abs(vector.x) + Math.abs(vector.y) < 3 ? 1 : vector.x; this.state.aimY = vector.y; }
      this.refresh();
    }) as EventListener);
    for (const name of ['pointerup','pointercancel','lostpointercapture']) listen(root, name, release as EventListener);
    for (const name of ['blur','resize','orientationchange']) listen(window, name, () => this.clear());
    listen(document, 'visibilitychange', () => { if (document.hidden) { this.clear(); this.command('hidden'); } });
    listen(root, 'contextmenu', e => e.preventDefault());
  }
  refresh() {
    const values = [...this.pointers.values()];
    this.state.move = this.moveX || Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    this.state.fly = this.keys.has('Space') || this.keys.has('KeyW') || this.keys.has('ArrowUp') || values.includes('fly');
    this.state.fire = this.mouseFire || values.includes('aim'); this.state.spray = this.keys.has('KeyF') || values.includes('spray');
  }
  clear() { this.keys.clear(); this.pointers.clear(); this.mouseFire = false; this.moveX = 0; Object.assign(this.state, idleInput(), { aimX: this.state.aimX, aimY: this.state.aimY }); }
  dispose() { this.clear(); this.abort.abort(); }
}
