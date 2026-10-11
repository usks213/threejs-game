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
