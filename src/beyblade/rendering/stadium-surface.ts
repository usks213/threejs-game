import * as THREE from 'three';
import { STADIUM, bowlHeightAt, bowlNormalAt, getRailPath, getBankSampleRadii } from '../core/physics';
import type { Vec3 } from '../core/types';

type Face = [number, number, number];
const xtremeFloorColor = new THREE.Color(0xff795c), overFloorColor = new THREE.Color(0x8da4bf);
/** Finish-zone tint only; the shared physical surface supplies every vertex and normal. */
export function floorTint(color: THREE.Color, x: number, z: number) {
  color.setHex(0xe8edf5);
  let best = 0, finish: 'over' | 'xtreme' = 'over';
  for (const pocket of STADIUM.pockets) {
    const along = x * Math.cos(pocket.angle) + z * Math.sin(pocket.angle);
    const across = -x * Math.sin(pocket.angle) + z * Math.cos(pocket.angle);
    const width = STADIUM.radius * Math.sin(pocket.halfWidth);
    const a = THREE.MathUtils.clamp((along - STADIUM.pocketEntryRadius) / STADIUM.pocketRampLength, 0, 1);
    const c = THREE.MathUtils.clamp((Math.abs(across) - (width - .012)) / .016, 0, 1);
    const blend = a * a * (3 - 2 * a) * (1 - c * c * (3 - 2 * c));
    if (blend > best) { best = blend; finish = pocket.finish; }
  }
  return color.lerp(finish === 'xtreme' ? xtremeFloorColor : overFloorColor, best);
}

/**
 * Feature-aligned, conforming adaptive tessellation of the unchanged physical height field.
 * All marked edges split on both adjacent faces, preventing cracks/T-junctions. Refinement
 * considers edge/centroid height error and surface normals, not just exact vertex heights.
 * Physics never reads this render mesh. There is no per-frame tessellation or LOD switch.
 */
export function buildStadiumSurfaceGeometry() {
  const vertices: Vec3[] = [], initialFaces: Face[] = [], tau = Math.PI * 2;
  const railAngles = getRailPath().map(point => (Math.atan2(point.z, point.x) + tau) % tau);
  const pocketAngles = STADIUM.pockets.flatMap(pocket => [-1, 1].flatMap(sign => [-.012, .004].map(offset =>
    pocket.angle + sign * Math.asin((STADIUM.radius * Math.sin(pocket.halfWidth) + offset) / STADIUM.coverRadius))));
  const angles = [...Array.from({ length: 65 }, (_, i) => i / 64 * tau), ...railAngles, ...pocketAngles]
    .sort((a, b) => a - b).filter((angle, i, all) => i === 0 || angle - all[i - 1] > 1e-8);
  const point = (x: number, z: number) => { vertices.push({ x, y: bowlHeightAt(x, z), z }); return vertices.length - 1; };
  let levels = 0;
  for (const angle of angles) {
    const bank = getBankSampleRadii(angle), end = bank[bank.length - 1];
    const outerBank = getBankSampleRadii(angle, [0, .0015, .003, .0045, .006].map(offset => STADIUM.bankOuterSlopeStart + offset));
    const radii = [
      ...Array.from({ length: 9 }, (_, i) => bank[0] * i / 8), ...bank.slice(1),
      ...Array.from({ length: 8 }, (_, i) => end + (STADIUM.coverRadius - end) * (i + 1) / 8), ...outerBank,
    ].sort((a, b) => a - b);
    levels = radii.length;
    for (const radius of radii) point(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  for (let column = 0; column < angles.length - 1; column++) for (let ring = 0; ring < levels - 1; ring++) {
    const a = column * levels + ring, b = a + levels;
    initialFaces.push([a, b + 1, a + 1], [a, b, b + 1]);
  }
  function sampleFace(face: Face) {
    const [a, b, c] = face.map(index => vertices[index]);
    const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3, y = (a.y + b.y + c.y) / 3;
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
    const normal = bowlNormalAt(x, z);
    return { error: Math.abs(y - bowlHeightAt(x, z)), area: length / 2,
      cosine: length > 1e-14 ? (nx * normal.x + ny * normal.y + nz * normal.z) / length : 1 };
  }
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const planarLength = (a: number, b: number) => (vertices[a].x - vertices[b].x) ** 2 + (vertices[a].z - vertices[b].z) ** 2;
  const tolerance = .0002, normalCosine = Math.cos(7 * Math.PI / 180);
  let faces = initialFaces;
  for (let pass = 0; pass < 5; pass++) {
    const marked = new Map<string, [number, number]>();
    for (const face of faces) {
      const sample = sampleFace(face); if (sample.area < 1e-14) continue;
      let refine = sample.error > tolerance || (sample.area > 1e-8 && sample.cosine < normalCosine);
      for (let side = 0; side < 3; side++) {
        const a = vertices[face[side]], b = vertices[face[(side + 1) % 3]], x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
        if (Math.abs((a.y + b.y) / 2 - bowlHeightAt(x, z)) > tolerance * .8) refine = true;
      }
      if (refine) for (let side = 0; side < 3; side++) {
        const a = face[side], b = face[(side + 1) % 3]; marked.set(edgeKey(a, b), [a, b]);
      }
    }
    if (marked.size === 0) break;
    // Seam symmetry: the polar grid closes on itself (the angle-0 and
    // angle-2pi columns are geometrically coincident but index-distinct),
    // so an edge on the seam has a twin edge with identical endpoints.
    // Refinement decisions can differ across the seam (the adjacent strips
    // have different widths), and splitting only one twin leaves a crack
    // along the seam -- exposed when the deepened center dish (2026-10-31)
    // started refining the innermost faces. Mark every geometric twin of
    // a marked edge so both sides split together.
    const posKey = (index: number) => `${Math.round(vertices[index].x * 1e7)}:${Math.round(vertices[index].z * 1e7)}`;
    const byPosition = new Map<string, [number, number][]>();
    for (const face of faces) for (let side = 0; side < 3; side++) {
      const a = face[side], b = face[(side + 1) % 3], pa = posKey(a), pb = posKey(b);
      if (pa === pb) continue;
      const key = pa < pb ? `${pa}/${pb}` : `${pb}/${pa}`, list = byPosition.get(key);
      if (list) list.push([a, b]); else byPosition.set(key, [[a, b]]);
    }
    for (const [a, b] of [...marked.values()]) {
      const pa = posKey(a), pb = posKey(b), key = pa < pb ? `${pa}/${pb}` : `${pb}/${pa}`;
      for (const [ta, tb] of byPosition.get(key) ?? []) marked.set(edgeKey(ta, tb), [ta, tb]);
    }
    const midpoints = new Map<string, number>();
    for (const [key, [a, b]] of marked) midpoints.set(key, point((vertices[a].x + vertices[b].x) / 2, (vertices[a].z + vertices[b].z) / 2));
    const next: Face[] = [];
    for (const face of faces) {
      const [a, b, c] = face, ab = midpoints.get(edgeKey(a, b)), bc = midpoints.get(edgeKey(b, c)), ca = midpoints.get(edgeKey(c, a));
      const mids = [ab, bc, ca], count = mids.filter(index => index !== undefined).length;
      if (count === 0) { next.push(face); continue; }
      if (ab !== undefined && bc !== undefined && ca !== undefined) {
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); continue;
      }
      if (count === 1) {
        const side = mids.findIndex(index => index !== undefined), u = face[side], v = face[(side + 1) % 3], w = face[(side + 2) % 3], mid = mids[side]!;
        next.push([u, mid, w], [mid, v, w]); continue;
      }
      const gap = mids.findIndex(index => index === undefined), u = face[(gap + 1) % 3], v = face[(gap + 2) % 3], w = face[gap];
      const uv = midpoints.get(edgeKey(u, v))!, vw = midpoints.get(edgeKey(v, w))!;
      next.push([uv, v, vw]);
      if (planarLength(u, vw) < planarLength(uv, w)) next.push([u, uv, vw], [u, vw, w]);
      else next.push([u, uv, w], [uv, vw, w]);
    }
    faces = next;
  }
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], color = new THREE.Color();
  for (const vertex of vertices) {
    positions.push(vertex.x, vertex.y, vertex.z);
    const normal = bowlNormalAt(vertex.x, vertex.z); normals.push(normal.x, normal.y, normal.z);
    floorTint(color, vertex.x, vertex.z); colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(faces.flat()); return geometry;
}
