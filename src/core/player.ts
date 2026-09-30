export interface Axis { x: number; z: number }
export interface Player { x: number; z: number; heading: number }
export const SPEED = 4;
export const WORLD_LIMIT = 13;
export function createPlayer(): Player { return { x: 0, z: 0, heading: 0 }; }
export function stepPlayer(player: Player, input: Axis, delta: number): void {
  if (!Number.isFinite(delta) || delta <= 0 || !Number.isFinite(input.x) || !Number.isFinite(input.z)) return;
  const magnitude = Math.hypot(input.x, input.z);
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  const dt = Math.min(delta, 0.05);
  player.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, player.x + input.x * scale * SPEED * dt));
  player.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, player.z + input.z * scale * SPEED * dt));
  if (magnitude > 0.01) player.heading = Math.atan2(input.x, input.z);
}
