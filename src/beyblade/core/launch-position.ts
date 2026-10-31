export interface LaunchPosition { x: number; z: number }
// Separate launch lanes prevent interpenetration before the first physics step.
// Centers stay inside the opening, leaving room for the blade.
export const LAUNCH_RADIUS = .12;
export const LAUNCH_GAP = .04;
export function defaultLaunchPosition(player: 0 | 1): LaunchPosition {
  const side = player === 0 ? -1 : 1;
  return { x: side * .105, z: side * .053 };
}
export function validLaunchPosition(value: unknown, player: 0 | 1): value is LaunchPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const { x, z } = value as Partial<LaunchPosition>;
  return typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z)
    && Math.hypot(x, z) <= LAUNCH_RADIUS + 1e-10 && (player === 0 ? x <= -LAUNCH_GAP : x >= LAUNCH_GAP);
}
