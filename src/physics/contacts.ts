import type { SphereBody } from './sphere';
import { CHARACTER_HEIGHT, CHARACTER_RADIUS } from './character';
import type { PlayerState } from '../simulation/protocol';

// Equal-mass contacts, bounded to twelve rocks; no render or platform dependencies.
export function collideRocks(bodies: SphereBody[]): void {
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    let x = b.position.x - a.position.x, y = b.position.y - a.position.y, z = b.position.z - a.position.z;
    const distance = Math.hypot(x, y, z), radius = a.radius + b.radius;
    if (distance >= radius - 0.001) continue;
    if (distance < 0.00001) { x = 1; y = z = 0; } else { x /= distance; y /= distance; z /= distance; }
    const correction = (radius - distance) * 0.5;
    a.position.x -= x * correction; a.position.y -= y * correction; a.position.z -= z * correction;
    b.position.x += x * correction; b.position.y += y * correction; b.position.z += z * correction;
    const speed = (b.velocity.x - a.velocity.x) * x + (b.velocity.y - a.velocity.y) * y + (b.velocity.z - a.velocity.z) * z;
    if (speed < 0) {
      const impulse = -speed * 0.55;
      a.velocity.x -= x * impulse; a.velocity.y -= y * impulse; a.velocity.z -= z * impulse;
      b.velocity.x += x * impulse; b.velocity.y += y * impulse; b.velocity.z += z * impulse;
    }
    if (correction > 0.002 || speed < -0.2) a.sleeping = b.sleeping = false;
  }
}
export function collidePlayerRocks(player: PlayerState, bodies: SphereBody[], dx: number, dz: number, dt: number): void {
  for (const body of bodies) {
    const centerY = Math.max(player.y + CHARACTER_RADIUS, Math.min(player.y + CHARACTER_HEIGHT - CHARACTER_RADIUS, body.position.y));
    let x = player.x - body.position.x, y = centerY - body.position.y, z = player.z - body.position.z;
    const distance = Math.hypot(x, y, z), radius = body.radius + CHARACTER_RADIUS;
    if (distance >= radius) continue;
    if (distance < 0.00001) { x = 1; y = z = 0; } else { x /= distance; y /= distance; z /= distance; }
    const correction = radius - distance;
    if (y > 0.65 && player.vy <= 0) { player.y += correction / y; player.vy = 0; player.grounded = true; }
    else if (y < -0.65) { body.position.y += correction; body.velocity.y = Math.max(0, body.velocity.y); body.sleeping = false; }
    else {
      const moving = Math.hypot(dx, dz) > 0.0001, push = moving ? 0.75 : 0;
      player.x += x * correction * (1 - push); player.z += z * correction * (1 - push);
      if (moving) {
        body.position.x -= x * correction * push; body.position.z -= z * correction * push;
        body.velocity.x = Math.max(-5, Math.min(5, body.velocity.x + dx / dt * 0.15));
        body.velocity.z = Math.max(-5, Math.min(5, body.velocity.z + dz / dt * 0.15)); body.sleeping = false;
      }
    }
  }
}
