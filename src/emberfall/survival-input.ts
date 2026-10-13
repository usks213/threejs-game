import { idleInput } from './simulation';
import type { Input } from './simulation';

export type SurvivalControl = 'move' | 'aim' | 'use' | 'fly' | 'spray' | 'thumb' | 'weapon';
export type ThumbMode = 'travel' | 'work';
export type ControlLayout = 'one-hand' | 'two-hand';
export type ControlHand = 'right' | 'left';
export interface ControlPreferences { layout: ControlLayout; hand: ControlHand }
export interface ControlVector { x: number; y: number }
interface Contact { kind: SurvivalControl; vector: ControlVector; mouseUse: boolean; dwell: number; used: boolean; workStartedAt: number | null }
export const THUMB_RADIUS = 48;
export const THUMB_WORK_DEADZONE = 0.28;
export const THUMB_WORK_DWELL = 0.22;
export const THUMB_COMBAT_GRACE = 0.12;
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const validVector = (vector: ControlVector) => Number.isFinite(vector.x) && Number.isFinite(vector.y);

/** Optional fields extend the existing version-1 UI record without touching world saves. */
export function readControlPreferences(value: unknown): ControlPreferences {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) return { layout: 'one-hand', hand: 'right' };
  return {
    layout: 'layout' in value && value.layout === 'two-hand' ? 'two-hand' : 'one-hand',
    hand: 'hand' in value && value.hand === 'left' ? 'left' : 'right',
  };
}

/** A floating origin with an elastic outer leash. Finger positions are local CSS pixels. */
export class SoftThumbStick {
  readonly anchor: ControlVector;
  readonly pointer: ControlVector;
  constructor(point: ControlVector) { this.anchor = { ...point }; this.pointer = { ...point }; }
  move(point: ControlVector): void { if (validVector(point)) Object.assign(this.pointer, point); }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const dx = this.pointer.x - this.anchor.x, dy = this.pointer.y - this.anchor.y, distance = Math.hypot(dx, dy);
    if (distance <= THUMB_RADIUS) return;
    // Exponential following is stable at 30/60/120 Hz, and never crosses the finger.
    const follow = (distance - THUMB_RADIUS) * (1 - Math.exp(-18 * Math.min(dt, 0.1))) / distance;
    this.anchor.x += dx * follow; this.anchor.y += dy * follow;
  }
  get vector(): ControlVector {
    const x = (this.pointer.x - this.anchor.x) / THUMB_RADIUS, y = (this.pointer.y - this.anchor.y) / THUMB_RADIUS;
    const length = Math.max(1, Math.hypot(x, y)); return { x: x / length, y: y / length };
  }
}

/** DOM-free input composition. Work requires a new displaced thumb and a short dwell. */
export class SurvivalInputModel {
  constructor(private readonly clock?: () => number) {}
  readonly state: Input = idleInput();
  private readonly keys = new Set<string>();
  private readonly contacts = new Map<number, Contact>();
  private aimDirection: ControlVector = { x: 1, y: 0 };
  // One bounded direct-use edge survives a complete click between physics ticks.
  // Thumb work still requires its dwell and never enters this buffer.
  private pendingUse: { id: number; released: boolean; aim: ControlVector } | null = null;
  private mode: ThumbMode = 'travel';
  private singleUse = false;
  private combatAim: ControlVector | null = null;
  private combatAutoFire = false;
  get thumbMode(): ThumbMode { return this.mode; }
  get thumbPhase(): 'idle' | 'travel' | 'aiming' | 'using' {
    const contact = [...this.contacts.values()].find(item => item.kind === 'weapon' || item.kind === 'thumb');
    if (!contact) return 'idle';
    return this.state.fire ? 'using' : contact.kind === 'thumb' && this.mode === 'travel' ? 'travel' : 'aiming';
  }
  /** The caller owns target visibility/range and whether ammunition is safe to spend. */
  setCombatAim(vector: ControlVector | null, autoFire = false): void {
    this.combatAim = vector && validVector(vector) && Math.hypot(vector.x, vector.y) >= 0.001 ? { ...vector } : null;
    this.combatAutoFire = this.combatAim !== null && autoFire;
    this.refresh();
  }
  setThumbMode(mode: ThumbMode): void { this.clear(); this.mode = mode; }
  setSingleUse(value: boolean): void { if (value !== this.singleUse) this.clear(); this.singleUse = value; }
  consumeUse(weaponCastCompleted = true): void {
    this.pendingUse = null;
    if (!this.singleUse) { this.refresh(); return; }
    for (const contact of this.contacts.values()) {
      if (contact.kind === 'thumb' && contact.dwell >= THUMB_WORK_DWELL && weaponCastCompleted || contact.kind === 'weapon' && contact.dwell >= THUMB_COMBAT_GRACE && weaponCastCompleted) contact.used = true;
    }
    this.refresh();
  }
  key(code: string, down: boolean): void {
    if (down) this.keys.add(code); else this.keys.delete(code);
    this.refresh();
  }
  press(id: number, kind: SurvivalControl, vector: ControlVector = { x: 0, y: 0 }, mouseUse = false): void {
    this.contacts.set(id, { kind, vector: validVector(vector) ? vector : { x: 0, y: 0 }, mouseUse, dwell: 0, used: false, workStartedAt: null });
    if (kind === 'aim') this.aim(vector);
    if ((kind === 'use' || mouseUse) && !this.pendingUse) this.pendingUse = { id, released: false, aim: { ...this.aimDirection } };
    this.refresh();
  }
  move(id: number, vector: ControlVector): void {
    const contact = this.contacts.get(id);
    if (!contact || !validVector(vector)) return;
    contact.vector = vector;
    if (contact.kind === 'aim') this.aim(vector);
    if (contact.kind === 'thumb' || contact.kind === 'weapon') {
      if (Math.hypot(vector.x, vector.y) > THUMB_WORK_DEADZONE) {
        if (contact.kind === 'weapon' || this.mode === 'work') this.aim(vector);
        if (contact.workStartedAt === null && this.clock) contact.workStartedAt = this.clock();
      } else { contact.dwell = 0; contact.used = false; contact.workStartedAt = null; }
    }
    this.refresh();
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const contact of this.contacts.values()) {
      if (contact.kind !== 'thumb' && contact.kind !== 'weapon') continue;
      if (Math.hypot(contact.vector.x, contact.vector.y) > THUMB_WORK_DEADZONE) {
        if (contact.kind === 'weapon' || this.mode === 'work') this.aim(contact.vector);
        // Browser contacts start their grace at the actual displacement event,
        // never at the beginning of a potentially long preceding render frame.
        if (this.clock) {
          const now = this.clock(); contact.workStartedAt ??= now;
          contact.dwell = Math.max(0, now - contact.workStartedAt);
        } else contact.dwell += Math.min(dt, 0.1);
      } else { contact.dwell = 0; contact.used = false; contact.workStartedAt = null; }
    }
    this.refresh();
  }
  aim(vector: ControlVector): void {
    if (!validVector(vector) || Math.hypot(vector.x, vector.y) < 0.001) return;
    this.aimDirection = { ...vector }; this.refresh();
  }
  release(id: number, canceled = false): void {
    if (this.contacts.has(id) && this.pendingUse?.id === id && !this.pendingUse.released) {
      if (canceled) this.pendingUse = null;
      else { this.pendingUse.released = true; this.pendingUse.aim = { ...this.aimDirection }; }
    }
    this.contacts.delete(id); this.refresh();
  }
  clear(): void {
    this.keys.clear(); this.contacts.clear(); this.pendingUse = null; this.combatAim = null; this.combatAutoFire = false;
    Object.assign(this.state, idleInput(), { aimX: this.aimDirection.x, aimY: this.aimDirection.y });
  }
  private refresh(): void {
    let move = 0, fly = false, use = this.pendingUse !== null, spray = false;
    const aim = this.pendingUse?.released ? this.pendingUse.aim : this.aimDirection;
    this.state.aimX = aim.x; this.state.aimY = aim.y;
    // Explicit mouse/two-hand/keyboard use always wins over the travel helper.
    let manualAim = this.pendingUse !== null || this.keys.has('KeyX');
    for (const contact of this.contacts.values()) {
      if (contact.kind === 'aim' || contact.kind === 'use' || contact.kind === 'weapon' || contact.kind === 'thumb' && this.mode === 'work') { manualAim = true; break; }
    }
    for (const contact of this.contacts.values()) {
      if (contact.kind === 'move' || contact.kind === 'thumb' && this.mode === 'travel') {
        move = Math.abs(contact.vector.x) > 0.14 ? clamp(contact.vector.x) : 0;
        fly ||= contact.vector.y < -0.45;
      }
      fly ||= contact.kind === 'fly';
      use ||= contact.kind === 'use' || contact.mouseUse || contact.kind === 'thumb' && this.mode === 'work' && contact.dwell >= THUMB_WORK_DWELL && (!this.singleUse || !contact.used);
      use ||= contact.kind === 'weapon' && contact.dwell >= THUMB_COMBAT_GRACE && (!this.singleUse || !contact.used);
      if (contact.kind === 'thumb' && this.mode === 'travel' && contact.dwell >= THUMB_COMBAT_GRACE && this.combatAim && !manualAim) {
        this.state.aimX = this.combatAim.x; this.state.aimY = this.combatAim.y;
        use ||= this.combatAutoFire;
      }
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
  private readonly model = new SurvivalInputModel(() => performance.now() / 1000);
  readonly state = this.model.state;
  private readonly targets = new Map<number, HTMLElement>();
  private readonly thumbs = new Map<number, SoftThumbStick>();
  private readonly weapons = new Map<number, { slot: 0 | 1; armed: boolean }>();
  private selectingWeapon: { id: number; target: HTMLElement } | null = null;
  private readonly abort = new AbortController();
  private active = false;
  private preferences: ControlPreferences = { layout: 'one-hand', hand: 'right' };
  lastClearReason = 'initial';
  get enabled(): boolean { return this.active; }
  set enabled(value: boolean) { this.active = value; if (!value) this.clear('disabled'); }
  get thumbMode(): ThumbMode { return this.model.thumbMode; }
  get weaponGestureActive(): boolean { return this.weapons.size > 0; }
  get thumbPhase(): string { return this.model.thumbPhase; }
  setCombatAim(vector: ControlVector | null, autoFire = false): void { this.model.setCombatAim(vector, autoFire); }
  setSingleUse(value: boolean): void { this.model.setSingleUse(value); }
  consumeUse(weaponCastCompleted = true): void { this.model.consumeUse(weaponCastCompleted); }
  setThumbMode(mode: ThumbMode): void { this.clear('mode-change'); this.model.setThumbMode(mode); }
  configure(preferences: ControlPreferences): void { this.clear('controls-change'); this.preferences = { ...preferences }; }

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
    const localPoint = (event: PointerEvent, target: HTMLElement) => { const rect = target.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    listen(window, 'keydown', ((event: KeyboardEvent) => {
      if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); this.command('Escape'); return; }
      if (!this.enabled || (event.target as HTMLElement)?.closest('select,input,textarea,button')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyX'].includes(event.code)) event.preventDefault();
      if (!event.repeat && ['KeyE', 'Tab', 'Digit1', 'Digit2', 'KeyQ', 'Digit3', 'Digit4', 'Digit5'].includes(event.code)) this.command(event.code);
      if (this.enabled) this.model.key(event.code, true);
    }) as EventListener);
    listen(window, 'keyup', ((event: KeyboardEvent) => this.model.key(event.code, false)) as EventListener);
    listen(root, 'pointerdown', ((event: PointerEvent) => {
      if (!this.enabled) return;
      const source = event.target as HTMLElement, target = source.closest<HTMLElement>('[data-control]');
      // A second finger on UI never lets a previous hold mine/place behind the menu.
      if (!target) { if (source.closest('button,select')) this.clear('ui'); return; }
      const kind = target.dataset.control as SurvivalControl;
      if (!['move', 'aim', 'use', 'fly', 'spray', 'thumb', 'weapon'].includes(kind)) return;
      if (kind === 'thumb' && (this.preferences.layout !== 'one-hand' || this.thumbs.size > 0)) return;
      if (kind === 'weapon' && (this.preferences.layout !== 'one-hand' || !['0', '1'].includes(target.dataset.wandSlot ?? '') || (target as HTMLButtonElement).disabled)) return;
      if (kind === 'aim' && event.pointerType !== 'mouse' && this.preferences.layout === 'one-hand') return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      if (kind === 'weapon') this.clear('weapon-contact');
      this.targets.set(event.pointerId, target);
      target.setPointerCapture(event.pointerId);
      target.classList.add('pressed');
      if (kind === 'thumb' || kind === 'weapon') this.thumbs.set(event.pointerId, new SoftThumbStick(localPoint(event, target)));
      if (kind === 'weapon') this.weapons.set(event.pointerId, { slot: target.dataset.wandSlot === '0' ? 0 : 1, armed: false });
      else this.model.press(event.pointerId, kind, vector(event, target), kind === 'aim' && event.pointerType === 'mouse');
      this.paintThumb(event.pointerId);
    }) as EventListener);
    listen(root, 'pointermove', ((event: PointerEvent) => {
      if (!this.enabled) return;
      const target = this.targets.get(event.pointerId), thumb = this.thumbs.get(event.pointerId);
      if (target && thumb) {
        thumb.move(localPoint(event, target));
        const weapon = this.weapons.get(event.pointerId);
        if (weapon && !weapon.armed) {
          if (Math.hypot(thumb.vector.x, thumb.vector.y) > THUMB_WORK_DEADZONE) this.armWeapon(event.pointerId);
        } else this.model.move(event.pointerId, thumb.vector);
        this.paintThumb(event.pointerId);
      }
      else if (target) this.model.move(event.pointerId, vector(event, target));
      else if (event.pointerType === 'mouse' && (event.target as HTMLElement).dataset.control === 'aim') this.model.aim(aim(event.clientX, event.clientY));
    }) as EventListener);
    const release = (event: PointerEvent) => {
      const target = this.targets.get(event.pointerId), weapon = this.weapons.get(event.pointerId), thumb = this.thumbs.get(event.pointerId);
      let select = false;
      if (target && thumb && weapon && !weapon.armed && !(target as HTMLButtonElement).disabled && event.type === 'pointerup') {
        thumb.move(localPoint(event, target));
        const rect = target.getBoundingClientRect();
        select = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom && Math.hypot(thumb.vector.x, thumb.vector.y) <= THUMB_WORK_DEADZONE;
      }
      this.targets.delete(event.pointerId); this.thumbs.delete(event.pointerId); this.weapons.delete(event.pointerId); this.model.release(event.pointerId, event.type !== 'pointerup');
      if (target && ![...this.targets.values()].includes(target)) { target.classList.remove('pressed'); target.dataset.phase = 'idle'; }
      if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      if (weapon) {
        this.clear(select ? 'weapon-tap' : 'weapon-release');
        if (select || weapon.armed) this.model.setThumbMode('travel');
        if (select && this.enabled) this.command(`Wand${weapon.slot}`);
      }
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(root, name, release as EventListener);
    // Native button activation from Enter/Space/assistive technology is a selection,
    // while the click synthesized after a pointer tap must not select twice.
    listen(root, 'click', ((event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-control="weapon"]');
      if (!this.enabled || event.detail !== 0 || !target || (target as HTMLButtonElement).disabled || !['0', '1'].includes(target.dataset.wandSlot ?? '')) return;
      event.preventDefault(); this.clear('weapon-keyboard'); this.model.setThumbMode('travel'); this.command(`Wand${target.dataset.wandSlot}`);
    }) as EventListener);
    for (const name of ['blur', 'resize', 'orientationchange', 'pagehide']) listen(window, name, () => this.clear(name));
    listen(document, 'visibilitychange', () => { if (document.hidden) { this.clear('hidden'); this.command('hidden'); } });
    listen(root, 'contextmenu', event => event.preventDefault());
  }
  update(dt: number): void {
    if (!this.enabled) return;
    for (const [id, thumb] of this.thumbs) {
      thumb.update(dt);
      if (this.weapons.get(id)?.armed !== false) this.model.move(id, thumb.vector);
    }
    this.model.update(dt);
    for (const id of this.thumbs.keys()) this.paintThumb(id);
  }
  private armWeapon(id: number): void {
    const target = this.targets.get(id), thumb = this.thumbs.get(id), weapon = this.weapons.get(id);
    if (!target || !thumb || !weapon || weapon.armed) return;
    // Selecting a tool may synchronously clear all controls. Preserve only this
    // newly displaced gesture, never the prior thumb/key/use state or dwell.
    // Keep capture throughout synchronous tool selection. Releasing and then
    // recapturing could deliver a delayed lostpointercapture to the new contact.
    this.selectingWeapon = { id, target };
    try {
      this.clear('weapon-switch'); this.command(`Wand${weapon.slot}`);
      if (!this.enabled || this.preferences.layout !== 'one-hand') return;
      this.model.setThumbMode('travel');
      this.targets.set(id, target); this.thumbs.set(id, thumb); this.weapons.set(id, { ...weapon, armed: true });
      if (!target.hasPointerCapture(id)) target.setPointerCapture(id);
      target.classList.add('pressed');
      this.model.press(id, 'weapon'); this.model.move(id, thumb.vector);
    } finally {
      this.selectingWeapon = null;
      if (!this.targets.has(id) && target.hasPointerCapture(id)) target.releasePointerCapture(id);
    }
  }
  private paintThumb(id: number): void {
    const target = this.targets.get(id), thumb = this.thumbs.get(id); if (!target || !thumb) return;
    const dx = thumb.pointer.x - thumb.anchor.x, dy = thumb.pointer.y - thumb.anchor.y;
    target.style.setProperty('--anchor-x', `${thumb.anchor.x}px`); target.style.setProperty('--anchor-y', `${thumb.anchor.y}px`);
    target.style.setProperty('--thumb-x', `${thumb.pointer.x}px`); target.style.setProperty('--thumb-y', `${thumb.pointer.y}px`);
    target.style.setProperty('--thumb-angle', `${Math.atan2(dy, dx)}rad`); target.style.setProperty('--thumb-stretch', `${Math.hypot(dx, dy)}px`);
    target.dataset.phase = this.weapons.get(id)?.armed === false ? 'selecting' : this.model.thumbPhase;
  }
  clear(reason = 'explicit'): void {
    this.lastClearReason = reason; this.model.clear(); this.thumbs.clear();
    if (this.weapons.size > 0) this.model.setThumbMode('travel');
    this.weapons.clear();
    const targets = [...this.targets.entries()]; this.targets.clear();
    for (const [id, target] of targets) {
      target.classList.remove('pressed'); target.dataset.phase = 'idle';
      const preserved = this.selectingWeapon?.id === id && this.selectingWeapon.target === target;
      if (!preserved && target.hasPointerCapture(id)) target.releasePointerCapture(id);
    }
  }
  dispose(): void { this.enabled = false; this.abort.abort(); }
}
