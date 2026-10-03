import type { SdfWorld } from '../world/density';
import type { Vec3 } from '../world/types';

export const CHARACTER_RADIUS = 0.3;
export const CHARACTER_HEIGHT = 1.45;
const SKIN = 0.003, WALKABLE_NORMAL = 0.65, STEP_HEIGHT = 0.3, GROUND_SNAP = 0.18;
interface CharacterBody extends Vec3 { vy: number; grounded: boolean }

// A sampled upright capsule, separate from rendering and object rigid-body physics.
export class CharacterMotor {
  private readonly point: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly normal: Vec3 = { x: 0, y: 1, z: 0 };
  private jumpBuffer = 0;
  private groundGrace = 0;
  constructor(private readonly world: SdfWorld) {}

  private distance(body: Vec3, height: number): number {
    this.point.x = body.x; this.point.y = body.y + height; this.point.z = body.z;
    const density = this.world.density(this.point);
    // All current generator/edit gradients are bounded; skip distant air samples.
    if (density > CHARACTER_RADIUS * 3) return density;
    return this.world.surfaceDistance(this.point, this.normal);
  }
  private clear(body: Vec3): boolean {
    for (let i = 0; i < 5; i++) {
      const height = CHARACTER_RADIUS + (CHARACTER_HEIGHT - 2 * CHARACTER_RADIUS) * i / 4;
      if (this.distance(body, height) < CHARACTER_RADIUS - SKIN) return false;
    }
    return true;
  }
  private tryStep(body: CharacterBody): void {
    const foot = this.distance(body, CHARACTER_RADIUS);
    if (foot >= CHARACTER_RADIUS - SKIN || this.normal.y >= WALKABLE_NORMAL || this.normal.y < -0.1) return;
    const originalY = body.y;
    body.y += STEP_HEIGHT;
    if (this.clear(body) && this.snap(body, STEP_HEIGHT + SKIN) && this.clear(body)) return;
    body.y = originalY;
  }
  private snap(body: CharacterBody, maximum: number): boolean {
    const distance = this.distance(body, CHARACTER_RADIUS);
    if (distance > CHARACTER_RADIUS + maximum + SKIN || this.normal.y < WALKABLE_NORMAL) return false;
    const drop = (distance - CHARACTER_RADIUS) / this.normal.y;
    if (drop < -SKIN || drop > maximum) return false;
    body.y -= Math.max(0, drop); body.vy = 0; body.grounded = true;
    return true;
  }
  private resolve(body: CharacterBody): void {
    for (let pass = 0; pass < 4; pass++) {
      let corrected = false;
      for (let i = 0; i < 5; i++) {
        const height = CHARACTER_RADIUS + (CHARACTER_HEIGHT - 2 * CHARACTER_RADIUS) * i / 4;
        const distance = this.distance(body, height);
        if (distance > CHARACTER_RADIUS + SKIN) continue;
        const n = this.normal, correction = Math.min(0.35, CHARACTER_RADIUS - distance);
        if (correction > 0.00001) {
          if (n.y >= WALKABLE_NORMAL) {
            // Support on walkable ground resolves vertically, avoiding idle slope drift.
            body.y += correction / n.y;
          } else if (n.y >= 0) {
            // Steep walls push sideways, rather than lifting the player up the wall.
            const horizontal = n.x * n.x + n.z * n.z;
            if (horizontal > 0.1) { body.x += n.x * correction / horizontal; body.z += n.z * correction / horizontal; }
          } else { body.x += n.x * correction; body.y += n.y * correction; body.z += n.z * correction; }
          corrected = true;
        }
        if (i === 0 && n.y >= WALKABLE_NORMAL && body.vy <= 0) { body.grounded = true; body.vy = 0; }
        if (n.y < -0.5 && body.vy > 0) body.vy = 0;
      }
      if (!corrected) break;
    }
  }
  step(body: CharacterBody, dx: number, dz: number, jump: boolean, dt: number): boolean {
    this.jumpBuffer = jump ? 0.15 : Math.max(0, this.jumpBuffer - dt);
    this.groundGrace = body.grounded ? 0.1 : Math.max(0, this.groundGrace - dt);
    const jumped = this.jumpBuffer > 0 && this.groundGrace > 0;
    if (jumped) { body.vy = 6; body.grounded = false; this.jumpBuffer = this.groundGrace = 0; }
    const steps = 3, subDt = dt / steps;
    for (let substep = 0; substep < steps; substep++) {
      const wasGrounded = body.grounded;
      body.vy = Math.max(-12, body.vy - 14 * subDt);
      body.x += dx / steps; body.z += dz / steps; body.y += body.vy * subDt;
      body.grounded = false;
      if (wasGrounded && body.vy <= 0 && (dx || dz)) this.tryStep(body);
      this.resolve(body);
      if (!body.grounded && wasGrounded && body.vy <= 0) this.snap(body, GROUND_SNAP);
    }
    return jumped;
  }
  reset(): void { this.jumpBuffer = this.groundGrace = 0; }
  reconcile(body: CharacterBody): void { this.resolve(body); }
}
