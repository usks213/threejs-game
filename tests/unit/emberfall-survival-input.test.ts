import { describe, expect, it } from 'vitest';
import { SurvivalInputModel } from '../../src/emberfall/survival-input';

describe('portrait survival input composition', () => {
  it('aims and preserves direction without destroying anything until use is held', () => {
    const input = new SurvivalInputModel();
    input.press(1, 'aim', { x: -0.8, y: -0.6 });
    expect(input.state.fire).toBe(false);
    input.press(2, 'use'); expect(input.state.fire).toBe(true);
    input.move(1, { x: 0.4, y: 0.9 });
    input.release(1);
    expect(input.state.aimX).toBe(0.4); expect(input.state.aimY).toBe(0.9);
    expect(input.state.fire).toBe(true);
    input.release(2); expect(input.state.fire).toBe(false);
  });
  it('supports simultaneous walking, thumb-slide flight, aim and tool use', () => {
    const input = new SurvivalInputModel();
    input.press(1, 'move', { x: 0.8, y: -0.8 });
    input.press(2, 'aim', { x: 1, y: 1 }); input.press(3, 'use');
    expect(input.state).toMatchObject({ move: 0.8, fly: true, fire: true, aimX: 1, aimY: 1 });
    input.move(1, { x: -2, y: 0 });
    expect(input.state.move).toBe(-1); expect(input.state.fly).toBe(false);
    input.release(1); expect(input.state.move).toBe(0); expect(input.state.fire).toBe(true);
    input.release(3); expect(input.state.fire).toBe(false);
  });
  it('keeps independent flight/water/button fingers active when another is canceled', () => {
    const input = new SurvivalInputModel();
    input.press(1, 'move', { x: 1, y: 0 }); input.press(2, 'fly'); input.press(3, 'spray'); input.press(4, 'use');
    input.release(4);
    expect(input.state).toMatchObject({ move: 1, fly: true, fire: false, spray: true });
    input.release(2); expect(input.state.fly).toBe(false); expect(input.state.spray).toBe(true);
  });
  it('does not reset another use source or leave held input after a lifecycle clear', () => {
    const input = new SurvivalInputModel();
    input.key('KeyD', true); input.key('Space', true); input.key('KeyX', true);
    input.press(1, 'use'); input.release(1); expect(input.state.fire).toBe(true);
    input.aim({ x: -7, y: 2 }); input.clear();
    expect(input.state).toMatchObject({ move: 0, fly: false, fire: false, spray: false, aimX: -7, aimY: 2 });
    input.move(1, { x: 1, y: 0 }); expect(input.state.fire).toBe(false);
  });
  it('supports desktop mouse-use and keyboard aiming without treating touch aim as use', () => {
    const input = new SurvivalInputModel();
    input.press(1, 'aim', { x: 20, y: -4 }, true); expect(input.state.fire).toBe(true);
    input.release(1); expect(input.state.fire).toBe(false);
    input.press(2, 'aim', { x: -20, y: 4 }); expect(input.state.fire).toBe(false);
    input.key('KeyX', true); expect(input.state.fire).toBe(true);
    input.key('KeyX', false); expect(input.state.fire).toBe(false);
  });
  it('ignores invalid and dead-zone aim while keyboard and touch movement combine safely', () => {
    const input = new SurvivalInputModel(); input.aim({ x: 3, y: 4 });
    for (const vector of [{ x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 0, y: 0 }]) input.aim(vector);
    expect(input.state).toMatchObject({ aimX: 3, aimY: 4 });
    input.key('ArrowLeft', true); input.press(1, 'move', { x: 0.01, y: 0 }); expect(input.state.move).toBe(-1);
    input.press(2, 'fly'); input.release(1); expect(input.state.fly).toBe(true);
  });
});

import { readControlPreferences, SoftThumbStick, THUMB_RADIUS, THUMB_WORK_DWELL } from '../../src/emberfall/survival-input';

const dwell = (input: SurvivalInputModel, seconds = THUMB_WORK_DWELL + 0.02) => {
  for (let time = 0; time < seconds; time += 0.01) input.update(0.01);
};

describe('one-thumb travel and work', () => {
  it('uses one relative drag for proportional movement and upward levitation', () => {
    const input = new SurvivalInputModel();
    input.press(1, 'thumb'); expect(input.state.move).toBe(0);
    input.move(1, { x: 0.7, y: -0.7 });
    expect(input.state).toMatchObject({ move: 0.7, fly: true, fire: false });
    input.move(1, { x: 0, y: 0 }); expect(input.state).toMatchObject({ move: 0, fly: false, fire: false });
    input.release(1); expect(input.thumbPhase).toBe('idle');
  });
  it('requires intentional displacement and dwell, keeps aim on release and never latches use', () => {
    const input = new SurvivalInputModel(); input.setThumbMode('work');
    input.press(1, 'thumb'); dwell(input, 1); expect(input.state.fire).toBe(false);
    input.move(1, { x: 0.2, y: 0 }); dwell(input, 1); expect(input.state.fire).toBe(false);
    input.move(1, { x: -0.6, y: -0.3 }); input.update(0.1); input.update(0.1);
    expect(input.state).toMatchObject({ move: 0, fly: false, fire: false, aimX: -0.6, aimY: -0.3 });
    input.update(0.03); expect(input.state.fire).toBe(true); expect(input.thumbPhase).toBe('using');
    input.release(1); expect(input.state).toMatchObject({ fire: false, aimX: -0.6, aimY: -0.3 });
    input.press(2, 'thumb'); dwell(input, 1); expect(input.state.fire).toBe(false);
  });
  it('stops immediately in the deadzone and requires a fresh dwell to restart', () => {
    const input = new SurvivalInputModel(); input.setThumbMode('work'); input.press(1, 'thumb');
    input.move(1, { x: 0.75, y: 0 }); dwell(input); expect(input.state.fire).toBe(true);
    input.move(1, { x: 0, y: 0 }); expect(input.state.fire).toBe(false);
    input.move(1, { x: 0, y: 0.75 }); input.update(0.1); expect(input.state.fire).toBe(false);
    dwell(input); expect(input.state.fire).toBe(true); expect(input.state.aimY).toBe(0.75);
  });
  it('places only once per drag, rearming only after recenter or a new contact', () => {
    const input = new SurvivalInputModel(); input.setSingleUse(true); input.setThumbMode('work'); input.press(1, 'thumb');
    input.move(1, { x: 0.8, y: 0 }); dwell(input); expect(input.state.fire).toBe(true);
    input.consumeUse(); expect(input.state.fire).toBe(false);
    input.move(1, { x: 0.7, y: 0.2 }); dwell(input, 1); expect(input.state.fire).toBe(false);
    input.consumeUse(); expect(input.state.fire).toBe(false);
    input.move(1, { x: 0, y: 0 }); input.move(1, { x: 0.8, y: 0 }); dwell(input); expect(input.state.fire).toBe(true);
    input.consumeUse(); input.release(1); input.press(2, 'thumb'); input.move(2, { x: 0.8, y: 0 });
    input.update(0.1); expect(input.state.fire).toBe(false); dwell(input); expect(input.state.fire).toBe(true);
  });
  it('leaves mining and firing continuous and does not change desktop or optional two-hand use', () => {
    const input = new SurvivalInputModel(); input.setThumbMode('work'); input.press(1, 'thumb');
    input.move(1, { x: 0.8, y: 0 }); dwell(input); input.consumeUse(); expect(input.state.fire).toBe(true);
    input.clear(); input.setSingleUse(true); input.key('KeyX', true); input.consumeUse(); expect(input.state.fire).toBe(true);
    input.key('KeyX', false); input.press(2, 'use'); input.consumeUse(); expect(input.state.fire).toBe(true);
    input.release(2); expect(input.state.fire).toBe(false);
  });
  it('clears held keys and contacts across mode changes and ignores the former pointer', () => {
    const input = new SurvivalInputModel(); input.key('Space', true); input.press(1, 'thumb', { x: 1, y: -1 });
    input.setThumbMode('work'); input.move(1, { x: 1, y: 0 }); dwell(input, 1);
    expect(input.state).toMatchObject({ move: 0, fly: false, fire: false });
    input.press(2, 'thumb'); input.move(2, { x: 1, y: 0 }); dwell(input); expect(input.state.fire).toBe(true);
    input.setThumbMode('travel'); expect(input.state).toMatchObject({ move: 0, fly: false, fire: false });
    input.move(2, { x: 1, y: -1 }); expect(input.state.move).toBe(0);
  });
  it('never advances arming on invalid time or invalid input', () => {
    const input = new SurvivalInputModel(); input.setThumbMode('work'); input.press(1, 'thumb');
    input.move(1, { x: NaN, y: 1 }); dwell(input, 1); expect(input.state.fire).toBe(false);
    input.move(1, { x: 1, y: 0 }); for (const dt of [NaN, Infinity, -1, 0]) input.update(dt);
    expect(input.state.fire).toBe(false); input.clear(); dwell(input); expect(input.state.fire).toBe(false);
  });
});

describe('soft floating thumb origin', () => {
  it('starts at the contact with a quiet deadzone and maps a 36px drag to 0.75', () => {
    const thumb = new SoftThumbStick({ x: 80, y: 70 }); expect(thumb.vector).toEqual({ x: 0, y: 0 });
    thumb.move({ x: 116, y: 70 }); thumb.update(1 / 60);
    expect(thumb.vector).toEqual({ x: 0.75, y: 0 }); expect(thumb.anchor).toEqual({ x: 80, y: 70 });
  });
  it('softly follows beyond the leash without jumping, overshooting, or slowing a held direction', () => {
    const thumb = new SoftThumbStick({ x: 0, y: 0 }); thumb.move({ x: 100, y: -100 });
    thumb.update(1 / 60); expect(thumb.anchor.x).toBeGreaterThan(0); expect(thumb.anchor.x).toBeLessThan(30);
    expect(Math.hypot(thumb.vector.x, thumb.vector.y)).toBeCloseTo(1); expect(thumb.vector.y).toBeLessThan(-0.7);
    for (let i = 0; i < 120; i++) thumb.update(1 / 60);
    expect(Math.hypot(thumb.pointer.x - thumb.anchor.x, thumb.pointer.y - thumb.anchor.y)).toBeCloseTo(THUMB_RADIUS);
    thumb.move({ ...thumb.anchor }); expect(thumb.vector).toEqual({ x: 0, y: 0 });
  });
  it('keeps normalized vectors finite and rejects malformed updates', () => {
    const thumb = new SoftThumbStick({ x: 30, y: 30 }); thumb.move({ x: Infinity, y: 0 }); thumb.update(NaN);
    expect(thumb.vector).toEqual({ x: 0, y: 0 });
    thumb.move({ x: 300, y: 30 }); expect(thumb.vector.x).toBe(1);
    thumb.update(-1); expect(thumb.anchor.x).toBe(30);
  });
});

describe('backward-compatible UI preferences', () => {
  it('defaults existing graphics-only version-1 records to right-handed one-thumb play', () => {
    expect(readControlPreferences({ version: 1, quality: 'high', pbr: false, volumetric: true, bloom: false })).toEqual({ layout: 'one-hand', hand: 'right' });
    for (const value of [null, false, 7, [], { version: 2, layout: 'two-hand' }, { version: 1, layout: 'bad', hand: 'bad' }]) {
      expect(readControlPreferences(value)).toEqual({ layout: 'one-hand', hand: 'right' });
    }
  });
  it('restores either hand and the optional two-hand layout independently', () => {
    expect(readControlPreferences({ version: 1, layout: 'two-hand', hand: 'left' })).toEqual({ layout: 'two-hand', hand: 'left' });
    expect(readControlPreferences({ version: 1, layout: 'one-hand', hand: 'left' })).toEqual({ layout: 'one-hand', hand: 'left' });
  });
});
