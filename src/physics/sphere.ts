import type { SdfWorld } from '../world/density';
import type { Vec3 } from '../world/types';
export interface SphereBody { id: number; position: Vec3; velocity: Vec3; radius: number; sleeping: boolean }
const normal: Vec3 = { x: 0, y: 0, z: 0 };
export function stepSphere(body: SphereBody, world: SdfWorld, dt: number): void {
  if (body.sleeping) return;
  body.velocity.y = Math.max(-12, body.velocity.y - 14 * dt);
  for (let i = 0; i < 3; i++) {
    body.position.x += body.velocity.x * dt / 3;
    body.position.y += body.velocity.y * dt / 3;
    body.position.z += body.velocity.z * dt / 3;
    const distance = world.surfaceDistance(body.position, normal);
    if (distance <= body.radius + 0.002) {
      const correction = Math.max(0, Math.min(1, body.radius - distance));
      body.position.x += normal.x * correction; body.position.y += normal.y * correction; body.position.z += normal.z * correction;
      const speed = body.velocity.x * normal.x + body.velocity.y * normal.y + body.velocity.z * normal.z;
      const bounce = speed < -1 ? 1.12 : 1;
      if (speed < 0) { body.velocity.x -= normal.x * speed * bounce; body.velocity.y -= normal.y * speed * bounce; body.velocity.z -= normal.z * speed * bounce; }
      if (dt > 0) { body.velocity.x *= 0.9; body.velocity.z *= 0.9; }
      if (dt > 0 && Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z) < 0.24 && normal.y > 0.9) { body.sleeping = true; body.velocity.x = body.velocity.y = body.velocity.z = 0; }
    }
  }
}
