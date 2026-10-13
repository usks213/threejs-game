import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalControls, THUMB_COMBAT_GRACE } from '../../src/emberfall/survival-input';

/** Small event/capture harness: adapter semantics need no browser or WebGL. */
class ControlTarget extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly classNames = new Set<string>();
  readonly classList = {
    add: (name: string) => { this.classNames.add(name); },
    remove: (name: string) => { this.classNames.delete(name); },
    contains: (name: string) => this.classNames.has(name),
  };
  readonly style = { setProperty: (_key: string, _value: string) => {} };
  readonly captures = new Set<number>();
  captureReleases = 0;
  disabled = false;
  constructor(kind?: string, slot?: string) {
    super(); if (kind) this.dataset.control = kind; if (slot) this.dataset.wandSlot = slot;
  }
  closest(selector: string): ControlTarget | null {
    if (selector === '[data-control]') return this.dataset.control ? this : null;
    if (selector === '[data-control="weapon"]') return this.dataset.control === 'weapon' ? this : null;
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 48, bottom: 48, width: 48, height: 48 }; }
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); this.captureReleases++; }
}

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(onCommand?: (key: string, controls: SurvivalControls) => void) {
  let now = 10;
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
  const windowTarget = new EventTarget(), documentTarget = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('window', windowTarget); vi.stubGlobal('document', documentTarget);
  const root = new ControlTarget(), slot0 = new ControlTarget('weapon', '0'), slot1 = new ControlTarget('weapon', '1'), thumb = new ControlTarget('thumb');
  const commands: string[] = [];
  const controls = new SurvivalControls(root as unknown as HTMLElement, (x, y) => ({ x, y }), key => {
    commands.push(key); onCommand?.(key, controls);
  });
  controls.enabled = true; disposers.push(() => controls.dispose());
  const event = (type: string, target: ControlTarget, values: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries({ target, pointerId: 1, pointerType: 'touch', button: 0, clientX: 24, clientY: 24, detail: 1, ...values })) Object.defineProperty(event, key, { value });
    root.dispatchEvent(event);
  };
  const advance = (seconds: number) => { now += seconds; controls.update(seconds); };
  return { controls, event, advance, commands, slot0, slot1, thumb, windowTarget, documentTarget };
}

describe('one-hand quick weapon pointer adapter', () => {
  it('selects an explicit slot once on tap, never on press or synthetic click', () => {
    const f = setup((_key, controls) => { controls.clear('tool-change'); controls.setThumbMode('travel'); });
    f.event('pointerdown', f.slot1); f.advance(2); expect(f.commands).toEqual([]); expect(f.controls.state.fire).toBe(false);
    f.event('pointerup', f.slot1); f.event('click', f.slot1);
    expect(f.commands).toEqual(['Wand1']); expect(f.controls.state.fire).toBe(false); expect(f.controls.thumbMode).toBe('travel');
    f.event('pointerdown', f.slot0); f.event('pointerup', f.slot0); expect(f.commands).toEqual(['Wand1', 'Wand0']);
  });
  it('does not select or shoot from canceled, lost-capture, moved-out or disabled taps', () => {
    const f = setup();
    f.controls.setThumbMode('work');
    for (const cancel of ['pointercancel', 'lostpointercapture']) {
      f.event('pointerdown', f.slot1); f.event(cancel, f.slot1); f.event('pointerup', f.slot1);
    }
    f.event('pointerdown', f.slot1); f.event('pointerup', f.slot1, { clientX: 80 });
    f.slot1.disabled = true; f.event('pointerdown', f.slot1); f.event('pointerup', f.slot1);
    expect(f.commands).toEqual([]); expect(f.controls.state.fire).toBe(false); expect(f.controls.thumbMode).toBe('work');
  });
  it('reconstructs only the deliberate slot drag after selection clears and gives it fresh grace', () => {
    const f = setup((_key, controls) => { controls.clear('tool-change'); controls.setSingleUse(false); controls.setThumbMode('travel'); });
    f.controls.setThumbMode('work'); f.controls.setSingleUse(true);
    f.event('pointerdown', f.thumb, { pointerId: 9 }); f.event('pointermove', f.thumb, { pointerId: 9, clientX: 60 }); f.advance(1);
    expect(f.controls.state.fire).toBe(true);
    f.event('pointerdown', f.slot1); expect(f.controls.state.fire).toBe(false);
    f.advance(4); f.event('pointermove', f.slot1, { clientX: 60, clientY: 0 });
    expect(f.commands).toEqual(['Wand1']); expect(f.controls.state).toMatchObject({ move: 0, fly: false, fire: false, aimX: 0.75, aimY: -0.5 });
    expect(f.slot1.hasPointerCapture(1)).toBe(true); expect(f.slot1.captureReleases).toBe(0); expect(f.thumb.hasPointerCapture(9)).toBe(false);
    f.advance(THUMB_COMBAT_GRACE - 0.001); expect(f.controls.state.fire).toBe(false);
    f.advance(0.002); expect(f.controls.state.fire).toBe(true);
    f.event('pointermove', f.thumb, { pointerId: 9, clientX: 0 }); expect(f.controls.state.aimX).toBe(0.75);
    f.event('pointerup', f.slot1, { clientX: 60, clientY: 0 }); f.event('lostpointercapture', f.slot1);
    expect(f.commands).toEqual(['Wand1']); expect(f.controls.state).toMatchObject({ move: 0, fly: false, fire: false });
    expect(f.controls.thumbMode).toBe('travel'); expect(f.controls.thumbPhase).toBe('idle');
    expect(f.slot1.captureReleases).toBe(1);
  });
  it('never shoots a quick drag released before grace, and requires a fresh press after cancellation', () => {
    const f = setup(); f.event('pointerdown', f.slot0); f.event('pointermove', f.slot0, { clientX: 60 });
    f.advance(0.05); f.event('pointercancel', f.slot0); f.advance(5);
    f.event('pointermove', f.slot0, { clientX: 100 }); expect(f.controls.state.fire).toBe(false);
    f.event('pointerdown', f.slot0); f.advance(5); expect(f.controls.state.fire).toBe(false);
    f.event('pointermove', f.slot0, { clientX: 60 }); expect(f.controls.state.fire).toBe(false);
    f.advance(THUMB_COMBAT_GRACE + 0.001); expect(f.controls.state.fire).toBe(true);
  });
  it('clears manual combat for menu/tool/mode/blur/resize/orientation and never revives its pointer', () => {
    const clearers = [
      (f: ReturnType<typeof setup>) => { f.controls.enabled = false; f.controls.enabled = true; },
      (f: ReturnType<typeof setup>) => f.controls.clear('tool-change'),
      (f: ReturnType<typeof setup>) => f.controls.setThumbMode('work'),
      ...['blur', 'resize', 'orientationchange', 'pagehide'].map(name => (f: ReturnType<typeof setup>) => f.windowTarget.dispatchEvent(new Event(name))),
      (f: ReturnType<typeof setup>) => { f.documentTarget.hidden = true; f.documentTarget.dispatchEvent(new Event('visibilitychange')); },
    ];
    for (const clear of clearers) {
      const f = setup(); f.event('pointerdown', f.slot0); f.event('pointermove', f.slot0, { clientX: 60 }); f.advance(1);
      expect(f.controls.state.fire).toBe(true); clear(f); expect(f.controls.state.fire).toBe(false);
      f.event('pointermove', f.slot0, { clientX: 100 }); f.advance(1); expect(f.controls.state.fire).toBe(false);
      expect(f.slot0.hasPointerCapture(1)).toBe(false); f.controls.dispose();
    }
  });
  it('does not reconstruct a slot gesture if its selection command disables gameplay', () => {
    const f = setup((_key, controls) => { controls.enabled = false; });
    f.event('pointerdown', f.slot0); f.event('pointermove', f.slot0, { clientX: 60 }); f.advance(1);
    expect(f.commands).toEqual(['Wand0']); expect(f.controls.state.fire).toBe(false); expect(f.slot0.hasPointerCapture(1)).toBe(false);
  });
  it('retains per-slot single-cast safety across command clears while ordinary weapons repeat', () => {
    const f = setup((key, controls) => { controls.clear('tool-change'); controls.setSingleUse(key === 'Wand1'); controls.setThumbMode('travel'); });
    f.event('pointerdown', f.slot1); f.event('pointermove', f.slot1, { clientX: 60 }); f.advance(THUMB_COMBAT_GRACE + 0.001);
    expect(f.controls.state.fire).toBe(true); f.controls.consumeUse(); f.advance(10); expect(f.controls.state.fire).toBe(false);
    f.event('pointermove', f.slot1, { clientX: 24 }); f.event('pointermove', f.slot1, { clientX: 60 });
    f.advance(0.1); expect(f.controls.state.fire).toBe(false); f.advance(0.021); expect(f.controls.state.fire).toBe(true);
    f.controls.consumeUse(); f.event('pointerup', f.slot1, { clientX: 60 }); expect(f.controls.state.fire).toBe(false);
    f.event('pointerdown', f.slot0); f.event('pointermove', f.slot0, { clientX: 60 }); f.advance(THUMB_COMBAT_GRACE + 0.001);
    for (let cast = 0; cast < 3; cast++) { expect(f.controls.state.fire).toBe(true); f.controls.consumeUse(); f.advance(1); }
    expect(f.commands).toEqual(['Wand1', 'Wand0']);
  });
  it('supports native keyboard slot selection without arming a shot', () => {
    const f = setup(); f.event('click', f.slot1, { detail: 0 }); expect(f.commands).toEqual(['Wand1']); expect(f.controls.state.fire).toBe(false);
    f.controls.enabled = false; f.event('click', f.slot0, { detail: 0 }); expect(f.commands).toEqual(['Wand1']);
  });
});
