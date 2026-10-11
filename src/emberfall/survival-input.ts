import { idleInput } from './simulation';
import type { Input } from './simulation';

export type SurvivalControl = 'move' | 'aim' | 'use' | 'fly' | 'spray';
export interface ControlVector { x: number; y: number }
interface Contact { kind: SurvivalControl; vector: ControlVector; mouseUse: boolean }
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

/** DOM-free input composition: aiming never implicitly uses a touch tool. */
export class SurvivalInputModel {
  readonly state: Input = idleInput();
  private readonly keys = new Set<string>();
  private readonly contacts = new Map<number, Contact>();

  key(code: string, down: boolean): void {
    if (down) this.keys.add(code); else this.keys.delete(code);
    this.refresh();
  }
  press(id: number, kind: SurvivalControl, vector: ControlVector = { x: 0, y: 0 }, mouseUse = false): void {
    this.contacts.set(id, { kind, vector, mouseUse });
    if (kind === 'aim') this.aim(vector);
    this.refresh();
  }
  move(id: number, vector: ControlVector): void {
    const contact = this.contacts.get(id);
    if (!contact) return;
    contact.vector = vector;
    if (contact.kind === 'aim') this.aim(vector);
    this.refresh();
  }
  aim(vector: ControlVector): void {
    if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || Math.hypot(vector.x, vector.y) < 0.001) return;
    this.state.aimX = vector.x; this.state.aimY = vector.y;
  }
  release(id: number): void { this.contacts.delete(id); this.refresh(); }
  clear(): void {
    this.keys.clear(); this.contacts.clear();
    const { aimX, aimY } = this.state;
    Object.assign(this.state, idleInput(), { aimX, aimY });
  }
  private refresh(): void {
    let move = 0, fly = false, use = false, spray = false;
    for (const contact of this.contacts.values()) {
      if (contact.kind === 'move') {
        move = Math.abs(contact.vector.x) > 0.14 ? clamp(contact.vector.x) : 0;
        // Sliding the movement thumb upward flies without giving up steering.
        fly ||= contact.vector.y < -0.45;
      }
      fly ||= contact.kind === 'fly';
      use ||= contact.kind === 'use' || contact.mouseUse;
      spray ||= contact.kind === 'spray';
    }
    this.state.move = move || Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    this.state.fly = fly || this.keys.has('Space') || this.keys.has('KeyW') || this.keys.has('ArrowUp');
    this.state.fire = use || this.keys.has('KeyX');
    this.state.spray = spray || this.keys.has('KeyF');
  }
}

/** Survival-specific pointer adapter. The expedition controls remain unchanged. */
export class SurvivalControls {
  private readonly model = new SurvivalInputModel();
  readonly state = this.model.state;
  private readonly targets = new Map<number, HTMLElement>();
  private readonly abort = new AbortController();
  private active = false;
  lastClearReason = 'initial';
  get enabled(): boolean { return this.active; }
  set enabled(value: boolean) { this.active = value; if (!value) this.clear('disabled'); }

  constructor(root: HTMLElement, aim: (x: number, y: number) => ControlVector, private readonly command: (key: string) => void) {
    const signal = this.abort.signal;
    const listen = (target: EventTarget, name: string, fn: EventListener) => target.addEventListener(name, fn, { signal, passive: false });
    const vector = (event: PointerEvent, target: HTMLElement): ControlVector => {
      const kind = target.dataset.control, rect = target.getBoundingClientRect();
      if (kind === 'move') return { x: (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.32), y: (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.4) };
      if (kind === 'aim' && target.classList.contains('aim-pad')) {
        const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2), y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        return Math.hypot(x, y) < 0.14 ? { x: 0, y: 0 } : { x, y };
      }
      return kind === 'aim' ? aim(event.clientX, event.clientY) : { x: 0, y: 0 };
    };
    listen(window, 'keydown', ((event: KeyboardEvent) => {
      if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); this.command('Escape'); return; }
      if (!this.enabled || (event.target as HTMLElement)?.closest('select,input,textarea,button')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyX'].includes(event.code)) event.preventDefault();
      if (!event.repeat && ['KeyE', 'Tab', 'Digit1', 'Digit2', 'KeyQ', 'Digit3', 'Digit4', 'Digit5'].includes(event.code)) this.command(event.code);
      // A command can synchronously open the menu and disable controls.
      if (this.enabled) this.model.key(event.code, true);
    }) as EventListener);
    listen(window, 'keyup', ((event: KeyboardEvent) => this.model.key(event.code, false)) as EventListener);
    listen(root, 'pointerdown', ((event: PointerEvent) => {
      if (!this.enabled) return;
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-control]');
      if (!target) return;
      const kind = target.dataset.control as SurvivalControl;
      if (!['move', 'aim', 'use', 'fly', 'spray'].includes(kind)) return;
      event.preventDefault();
      this.targets.set(event.pointerId, target);
      target.setPointerCapture(event.pointerId);
      target.classList.add('pressed');
      this.model.press(event.pointerId, kind, vector(event, target), kind === 'aim' && event.pointerType === 'mouse' && event.button === 0);
    }) as EventListener);
    listen(root, 'pointermove', ((event: PointerEvent) => {
      if (!this.enabled) return;
      const target = this.targets.get(event.pointerId);
      if (target) this.model.move(event.pointerId, vector(event, target));
      else if (event.pointerType === 'mouse' && (event.target as HTMLElement).dataset.control === 'aim') this.model.aim(aim(event.clientX, event.clientY));
    }) as EventListener);
    const release = (event: PointerEvent) => {
      const target = this.targets.get(event.pointerId);
      this.targets.delete(event.pointerId); this.model.release(event.pointerId);
      if (target && ![...this.targets.values()].includes(target)) target.classList.remove('pressed');
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(root, name, release as EventListener);
    for (const name of ['blur', 'resize', 'orientationchange', 'pagehide']) listen(window, name, () => this.clear(name));
    listen(document, 'visibilitychange', () => { if (document.hidden) { this.clear('hidden'); this.command('hidden'); } });
    listen(root, 'contextmenu', event => event.preventDefault());
  }
  clear(reason = 'explicit'): void {
    this.lastClearReason = reason; this.model.clear();
    // Clear bookkeeping before releasing capture: lostpointercapture can fire synchronously.
    const targets = [...this.targets.entries()]; this.targets.clear();
    for (const [id, target] of targets) {
      target.classList.remove('pressed');
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    }
  }
  dispose(): void { this.enabled = false; this.abort.abort(); }
}
