import type { Vec3 } from '../../world/types';
import type { SkyPart } from './types';
import { PART_HALF, SKY_LIMITS } from './types';
import { cross, dot, local, orientation, plus, rotate, scale } from './orientation';
import { massProperties, RIGID_BUDGET } from './rigid';

/** An authority-only prepass. Unavailable groups retain the existing static collision path. */
export interface ContactAssembly { parts: SkyPart[]; unavailable?: boolean }
export interface AssemblyContactStats { bodyPairs: number; boxPairs: number; contacts: number; impulses: number; woken: number }
export const ASSEMBLY_CONTACT_BUDGET = {
  parts: SKY_LIMITS.parts,
  contactsPerAssembly: RIGID_BUDGET.contacts,
  iterations: RIGID_BUDGET.iterations,
  maxHorizon: 1 / 30,
  maxLinearSpeed: 12,
  maxAngularSpeed: RIGID_BUDGET.maxAngularSpeed,
} as const;
const ZERO = { x: 0, y: 0, z: 0 };
const AXES: readonly Vec3[] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
const SKIN = .002;
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const finite = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
type Properties = ReturnType<typeof massProperties>;
const apply = (m: Properties['inverseInertia'], v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
});
type BoxPose = Pick<SkyPart, 'kind' | 'position' | 'q' | 'rotation'>;
interface Bounds { min: Vec3; max: Vec3 }
interface Box { center: Vec3; axes: Vec3[]; half: Vec3; bounds: Bounds }
interface Body {
  parts: SkyPart[]; boxes: Box[]; properties: Properties; bounds: Bounds;
  linear: Vec3; angular: Vec3; linearLimit: number; angularLimit: number; contacts: number; changed: boolean;
}
interface Contact { a: Body; b: Body; point: Vec3; normal: Vec3 }

function makeBox(part: BoxPose, velocity: Vec3, horizon: number): Box {
  const axes = AXES.map(axis => rotate(axis, orientation(part))), half = PART_HALF[part.kind];
  const extent = { x: 0, y: 0, z: 0 };
  for (const key of ['x', 'y', 'z'] as const) extent[key] = Math.abs(axes[0][key]) * half.x + Math.abs(axes[1][key]) * half.y + Math.abs(axes[2][key]) * half.z;
  const min = { ...part.position }, max = { ...part.position };
  for (const key of ['x', 'y', 'z'] as const) {
    min[key] += Math.min(0, velocity[key] * horizon) - extent[key] - SKIN;
    max[key] += Math.max(0, velocity[key] * horizon) + extent[key] + SKIN;
  }
  return { center: part.position, axes, half, bounds: { min, max } };
}
function overlaps(a: Bounds, b: Bounds): boolean {
  return a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.y <= b.max.y && b.min.y <= a.max.y && a.min.z <= b.max.z && b.min.z <= a.max.z;
}
function makeBody(input: ContactAssembly, horizon: number): Body | undefined {
  if (input.unavailable || !input.parts.length || input.parts.length > SKY_LIMITS.assembly) return;
  const parts = [...input.parts].sort((a, b) => a.id - b.id);
  // Defense in depth: leased/recalling/ridden/towed/far-sleeping status is supplied by the authority.
  if (parts.some(p => p.anchored || p.trial !== undefined || p.loan !== undefined || (p.frozen ?? 0) > 0)) return;
  if (parts.some(p => {
    const q = orientation(p), angular = p.angularVelocity ?? ZERO;
    return !Number.isSafeInteger(p.id) || p.id < 1 || !Object.hasOwn(PART_HALF, p.kind)
      || !Number.isFinite(p.mass) || p.mass <= 0 || p.mass > 1000 || !finite(p.position) || length(p.position) > 1e6
      || !finite(p.velocity) || length(p.velocity) > 50 || !finite(angular) || length(angular) > RIGID_BUDGET.maxAngularSpeed + .001
      || ![q.x, q.y, q.z, q.w].every(Number.isFinite) || Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > .001;
  })) return;
  const linear = { ...parts[0].velocity }, angular = { ...(parts[0].angularVelocity ?? ZERO) };
  // A malformed/non-rigid group must not acquire energy by choosing a different root.
  if (parts.some(p => length(subtract(p.velocity, linear)) > 1e-6 || length(subtract(p.angularVelocity ?? ZERO, angular)) > 1e-6)) return;
  const properties = massProperties(parts);
  if (!Number.isFinite(properties.mass) || !finite(properties.center) || !properties.inverseInertia.every(Number.isFinite)) return;
  const boxes = parts.map(p => makeBox(p, linear, horizon));
  const bounds: Bounds = { min: { ...boxes[0].bounds.min }, max: { ...boxes[0].bounds.max } };
  for (const box of boxes) for (const key of ['x', 'y', 'z'] as const) {
    bounds.min[key] = Math.min(bounds.min[key], box.bounds.min[key]);
    bounds.max[key] = Math.max(bounds.max[key], box.bounds.max[key]);
  }
  return { parts, boxes, properties, bounds, linear, angular, linearLimit: Math.max(ASSEMBLY_CONTACT_BUDGET.maxLinearSpeed, length(linear)), angularLimit: Math.max(ASSEMBLY_CONTACT_BUDGET.maxAngularSpeed, length(angular)), contacts: 0, changed: false };
}
function mayTransfer(a: Body, b: Body): boolean {
  const parts = [...a.parts, ...b.parts];
  // A shared projectile must not be a way to push a different creator's private assembly.
  return new Set(parts.map(p => p.creator)).size <= 1 || parts.every(p => p.shared === true);
}
function projection(box: Box, axis: Vec3): number {
  return Math.abs(dot(box.axes[0], axis)) * box.half.x + Math.abs(dot(box.axes[1], axis)) * box.half.y + Math.abs(dot(box.axes[2], axis)) * box.half.z;
}
function support(box: Box, normal: Vec3, velocity: Vec3, time: number): Vec3 {
  let point = plus(box.center, scale(velocity, time));
  const sizes = [box.half.x, box.half.y, box.half.z];
  for (let i = 0; i < 3; i++) {
    const alignment = dot(box.axes[i], normal);
    // Use the face/edge center when exactly parallel; a corner would cause artificial centered-hit spin.
    if (Math.abs(alignment) > 1e-8) point = plus(point, scale(box.axes[i], Math.sign(alignment) * sizes[i]));
  }
  return point;
}
function separatingAxes(a: Box, b: Box): Vec3[] {
  const axes = [...a.axes, ...b.axes];
  for (const axisA of a.axes) for (const axisB of b.axes) {
    const axis = cross(axisA, axisB), size = length(axis);
    if (size > 1e-7) axes.push(scale(axis, 1 / size));
  }
  return axes;
}
/** Strict static OBB guard. Touching faces are allowed; no ownership or dynamic-state filtering. */
export function skyPartsOverlap(a: SkyPart, b: SkyPart, tolerance = 1e-6): boolean {
  const epsilon = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 1e-6;
  const boxA = makeBox(a, ZERO, 0), boxB = makeBox(b, ZERO, 0);
  if (!overlaps(boxA.bounds, boxB.bounds)) return false;
  const delta = subtract(boxB.center, boxA.center);
  return separatingAxes(boxA, boxB).every(axis => Math.abs(dot(delta, axis)) < projection(boxA, axis) + projection(boxB, axis) - epsilon);
}
/**
 * Exact segment-to-OBB distance for an upright actor capsule, with at most eight interval cuts.
 * Touching is allowed. Invalid geometry fails closed so callers reject the proposed part pose.
 */
export function skyPartOverlapsCapsule(part: SkyPart, foot: Vec3, radius = .3, height = 1.7): boolean {
  const q = orientation(part);
  if (!Object.hasOwn(PART_HALF, part.kind) || !finite(part.position) || !finite(foot)
    || length(part.position) > 1e6 || length(foot) > 1e6
    || ![q.x, q.y, q.z, q.w, radius, height].every(Number.isFinite)
    || Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > .001 || radius <= 0 || height < radius * 2 || height > 1000) return true;
  const half = PART_HALF[part.kind], start = local({ ...foot, y: foot.y + radius }, part);
  const end = local({ ...foot, y: foot.y + height - radius }, part), delta = subtract(end, start);
  const cuts = [0, 1];
  for (const axis of ['x', 'y', 'z'] as const) if (Math.abs(delta[axis]) > 1e-12) {
    for (const sign of [-1, 1]) { const t = (sign * half[axis] - start[axis]) / delta[axis]; if (t > 0 && t < 1) cuts.push(t); }
  }
  cuts.sort((a, b) => a - b);
  let closest = Infinity;
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i], to = cuts[i + 1], middle = (from + to) / 2;
    let denominator = 0, numerator = 0;
    for (const axis of ['x', 'y', 'z'] as const) {
      const coordinate = start[axis] + delta[axis] * middle;
      if (coordinate < -half[axis] || coordinate > half[axis]) {
        const boundary = coordinate < 0 ? -half[axis] : half[axis];
        denominator += delta[axis] * delta[axis]; numerator += delta[axis] * (start[axis] - boundary);
      }
    }
    const t = denominator > 1e-20 ? Math.max(from, Math.min(to, -numerator / denominator)) : from;
    let distanceSquared = 0;
    for (const axis of ['x', 'y', 'z'] as const) { const outside = Math.max(0, Math.abs(start[axis] + delta[axis] * t) - half[axis]); distanceSquared += outside * outside; }
    closest = Math.min(closest, distanceSquared);
  }
  return closest < radius * radius - 1e-12;
}
/** SAT over the 3+3 face axes and 9 edge axes, with a linear sweep only. */
function boxContact(a: Box, b: Box, va: Vec3, vb: Vec3, horizon: number): { point: Vec3; normal: Vec3 } | undefined {
  const delta = subtract(b.center, a.center), relative = subtract(vb, va);
  const axes = separatingAxes(a, b);
  let entry = 0, exit = horizon, entryNormal: Vec3 | undefined, closestNormal = AXES[0], smallestDepth = Infinity;
  for (const axis of axes) {
    const radius = projection(a, axis) + projection(b, axis) + SKIN;
    const position = dot(delta, axis), speed = dot(relative, axis), depth = radius - Math.abs(position);
    if (depth < smallestDepth) { smallestDepth = depth; closestNormal = scale(axis, position < 0 ? -1 : 1); }
    if (Math.abs(speed) < 1e-9) { if (depth < 0) return; continue; }
    const first = (-radius - position) / speed, last = (radius - position) / speed;
    const starts = Math.min(first, last), ends = Math.max(first, last);
    if (starts > entry) { entry = starts; entryNormal = scale(axis, position + speed * starts < 0 ? -1 : 1); }
    exit = Math.min(exit, ends);
    if (entry > exit || exit < 0) return;
  }
  if (entry > horizon) return;
  const normal = entryNormal ?? closestNormal;
  const point = scale(plus(support(a, normal, va, entry), support(b, scale(normal, -1), vb, entry)), .5);
  return { point, normal };
}
/** Largest impulse fraction whose resulting vector fits its speed envelope. */
function fraction(value: Vec3, change: Vec3, limit: number): number {
  if (length(plus(value, change)) <= limit + 1e-10) return 1;
  const a = dot(change, change);
  if (a < 1e-20) return 0;
  const b = 2 * dot(value, change), c = Math.min(0, dot(value, value) - limit * limit);
  return Math.max(0, Math.min(1, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)));
}
function solve(contact: Contact): boolean {
  const { a, b, point, normal } = contact;
  const ra = subtract(point, a.properties.center), rb = subtract(point, b.properties.center);
  const relative = subtract(plus(b.linear, cross(b.angular, rb)), plus(a.linear, cross(a.angular, ra)));
  const normalSpeed = dot(relative, normal);
  if (normalSpeed >= -1e-7) return false;
  const angularA = apply(a.properties.inverseInertia, cross(ra, normal)), angularB = apply(b.properties.inverseInertia, cross(rb, normal));
  const effective = 1 / a.properties.mass + 1 / b.properties.mass + dot(normal, plus(cross(angularA, ra), cross(angularB, rb)));
  if (!Number.isFinite(effective) || effective < 1e-9) return false;
  const magnitude = -normalSpeed / effective;
  const dva = scale(normal, -magnitude / a.properties.mass), dvb = scale(normal, magnitude / b.properties.mass);
  const dwa = scale(angularA, -magnitude), dwb = scale(angularB, magnitude);
  // Scale the entire equal-and-opposite impulse together. Independent clamping would lose momentum.
  const amount = Math.min(fraction(a.linear, dva, a.linearLimit), fraction(b.linear, dvb, b.linearLimit), fraction(a.angular, dwa, a.angularLimit), fraction(b.angular, dwb, b.angularLimit));
  if (amount < 1e-9) return false;
  a.linear = plus(a.linear, scale(dva, amount)); b.linear = plus(b.linear, scale(dvb, amount));
  a.angular = plus(a.angular, scale(dwa, amount)); b.angular = plus(b.angular, scale(dwb, amount));
  a.changed = b.changed = true;
  return true;
}

/**
 * Conservative, inelastic contact transfer before the existing per-assembly step.
 * Changes velocities and wakes contacted free bodies only; never moves poses or alters permissions/save data.
 * The impulse stage conserves pair momentum. Later terrain guards/damping can dissipate it.
 * No rotating CCD, face clipping, friction, restitution, stacking or world-level conservation guarantee.
 */
export function transferAssemblyContacts(assemblies: readonly ContactAssembly[], dt: number): AssemblyContactStats {
  const stats: AssemblyContactStats = { bodyPairs: 0, boxPairs: 0, contacts: 0, impulses: 0, woken: 0 };
  if (!Number.isFinite(dt) || dt <= 0 || assemblies.length > SKY_LIMITS.parts) return stats;
  const count = assemblies.reduce((sum, a) => sum + a.parts.length, 0);
  if (count > SKY_LIMITS.parts) return stats;
  const ids = new Set<number>();
  for (const assembly of assemblies) for (const part of assembly.parts) { if (ids.has(part.id)) return stats; ids.add(part.id); }
  const horizon = Math.min(dt, ASSEMBLY_CONTACT_BUDGET.maxHorizon);
  const bodies = assemblies.map(a => makeBody(a, horizon)).filter((b): b is Body => !!b).sort((a, b) => a.parts[0].id - b.parts[0].id);
  const contacts: Contact[] = [];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j]; stats.bodyPairs++;
    if (!mayTransfer(a, b) || !overlaps(a.bounds, b.bounds)) continue;
    for (const boxA of a.boxes) for (const boxB of b.boxes) {
      if (a.contacts >= ASSEMBLY_CONTACT_BUDGET.contactsPerAssembly || b.contacts >= ASSEMBLY_CONTACT_BUDGET.contactsPerAssembly) continue;
      stats.boxPairs++;
      if (!overlaps(boxA.bounds, boxB.bounds)) continue;
      const hit = boxContact(boxA, boxB, a.linear, b.linear, horizon);
      if (hit) { contacts.push({ a, b, ...hit }); a.contacts++; b.contacts++; }
    }
  }
  stats.contacts = contacts.length;
  for (let iteration = 0; iteration < ASSEMBLY_CONTACT_BUDGET.iterations; iteration++) for (const contact of contacts) if (solve(contact)) stats.impulses++;
  for (const body of bodies) if (body.changed) {
    for (const part of body.parts) {
      if (part.sleeping) stats.woken++;
      part.velocity = { ...body.linear }; part.angularVelocity = { ...body.angular }; part.sleeping = false;
    }
  }
  return stats;
}
