import type { Snapshot } from '../simulation/protocol';
import type { SessionAuthority } from '../simulation/session';
export function sessionFrame(authority: SessionAuthority, peer: string): Snapshot {
 const sim = authority.sim, view = authority.view(peer), p = view.player;
 return { tick: sim.tick, ...view, edits: sim.world.edits.length, fluids: sim.fluid.snapshot().filter(c => Math.hypot(c.x - p.x, c.z - p.z) < 48), bodies: sim.bodies.filter(b => Math.hypot(b.position.x - p.x, b.position.z - p.z) < 65).map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })), metrics: { ...sim.metrics, meshMs: 0, editMs: 0, bricks: 0, pending: 0, triangles: 0 } };
}
