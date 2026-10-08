import { describe, expect, it } from 'vitest';
import { gameplayNoticePosition, rectanglesOverlap, type NoticeRect } from '../../src/dungeon/notice-placement';
const landscape: NoticeRect[] = [{ x: 0, y: 0, width: 844, height: 58 }, { x: 22, y: 68, width: 230, height: 92 }, { x: 730, y: 68, width: 99, height: 75 }, { x: 22, y: 275, width: 100, height: 100 }, { x: 494, y: 275, width: 100, height: 100 }, { x: 608, y: 274, width: 212, height: 101 }, { x: 250, y: 197, width: 340, height: 60 }];
describe('gameplay notice collision-safe placement', () => {
  it('keeps visible notifications clear of landscape HUD, pads, actions and nearby controls', () => {
    const position = gameplayNoticePosition({ width: 844, height: 390 }, { width: 340, height: 72 }, landscape);
    expect(position).not.toBeNull(); expect(position!.y).toBeLessThan(197);
    expect(landscape.some(rect => rectanglesOverlap(position!, rect, 8))).toBe(false);
  });
  it.each([844, 740, 667, 600])('finds a safe slot for portrait height %d, even with three nearby targets', height => {
    const obstacles = [{ x: 0, y: 0, width: 390, height: 68 }, { x: 14, y: 83, width: 214.5, height: 138 }, { x: 282, y: 87, width: 93, height: 66 }, { x: 14, y: height - 122, width: 92, height: 92 }, { x: 161, y: height - 122, width: 92, height: 92 }, { x: 263, y: height - 233, width: 114, height: 210 }, { x: 70, y: height - 435, width: 240, height: 180 }];
    const position = [230, 340, 280, 220, 160, 140].map(width => gameplayNoticePosition({ width: 390, height }, { width, height: 72 }, obstacles)).find(Boolean);
    expect(position).toMatchObject({ x: 14, y: height - 227, width: 230 }); expect(obstacles.some(rect => rectanglesOverlap(position!, rect, 8))).toBe(false);
  });
  it('returns no placement instead of overlapping a fully occupied viewport', () => {
    expect(gameplayNoticePosition({ width: 200, height: 100 }, { width: 140, height: 72 }, [{ x: 0, y: 0, width: 200, height: 100 }])).toBeNull();
  });
});
