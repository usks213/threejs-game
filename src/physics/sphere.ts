import type { SdfWorld } from '../world/density';
import type { Vec3 } from '../world/types';
export interface SphereBody { id: number; position: Vec3; velocity: Vec3; radius: number; sleeping: boolean }
export function stepSphere(body: SphereBody, world: SdfWorld, dt: number): void {
  if (body.sleeping) return;
  body.velocity.y = Math.max(-12, body.velocity.y - 14 * dt);
  const normal: Vec3 = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 3; i++) {
    body.position.x += body.velocity.x * dt / 3;
    body.position.y += body.velocity.y * dt / 3;
    body.position.z += body.velocity.z * dt / 3;
    const distance = world.density(body.position);
    if (distance < body.radius) {
      world.normal(body.position, normal);
      const correction = Math.min(1.5, body.radius - distance);
      body.position.x += normal.x * correction; body.position.y += normal.y * correction; body.position.z += normal.z * correction;
      const speed = body.velocity.x * normal.x + body.velocity.y * normal.y + body.velocity.z * normal.z;
      if (speed < 0) { body.velocity.x -= normal.x * speed * 1.25; body.velocity.y -= normal.y * speed * 1.25; body.velocity.z -= normal.z * speed * 1.25; }
      body.velocity.x *= 0.84; body.velocity.z *= 0.84;
      if (Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z) < 0.2 && normal.y > 0.7) { body.sleeping = true; body.velocity.x = body.velocity.y = body.velocity.z = 0; }
    }
  }
}
