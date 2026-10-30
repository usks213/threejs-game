import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Profile, Vec3, Quaternion } from '../core/types';
import { getCenterOfMass, getCanonicalBladeVertices, getCanonicalRatchetVertices, getBitGeometry, getBladeMaterialGeometry } from '../core/physics';

export type TopMeshFactory = (geometry: THREE.BufferGeometry, color: number, roughness?: number, metalness?: number, clearcoat?: number) => THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/**
 * Rendering-only contour resolution. Physics contact/mass sampling uses its
 * own paths, so raising this sharpens the silhouette without changing any
 * simulated shape; the contour coordinates themselves are unchanged.
 */
const RENDER_CONTOUR_SAMPLES = 128;

/** Two contour rings from the physics model; preserve its contact surface, including handed ramps. */
function ringSolid(vertices: Vec3[]): THREE.BufferGeometry {
  const count = vertices.length / 2, positions = vertices.flatMap(v => [v.x, v.y, v.z]), indices: number[] = [];
  for (let i = 0; i < count; i++) { const next = (i + 1) % count; indices.push(i, count + i, count + next, i, count + next, next); }
  const faces = THREE.ShapeUtils.triangulateShape(vertices.slice(0, count).map(v => new THREE.Vector2(v.x, v.z)), []);
  for (const [a, b, c] of faces) indices.push(a, b, c, count + a, count + c, count + b);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return toCreasedNormals(geometry, Math.PI / 3);
}

/** Open metal perimeter: the outer coordinates remain identical to the contact rings. */
function bladeRim(vertices: Vec3[], innerScale = .63): THREE.BufferGeometry {
  const n = vertices.length / 2, all = [...vertices, ...vertices.map(v => ({ x: v.x * innerScale, y: v.y, z: v.z * innerScale }))];
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, lo = i, nextLo = j, hi = n + i, nextHi = n + j, innerLo = n * 2 + i, innerNextLo = n * 2 + j, innerHi = n * 3 + i, innerNextHi = n * 3 + j;
    indices.push(lo, hi, nextHi, lo, nextHi, nextLo);
    indices.push(innerLo, innerNextLo, innerNextHi, innerLo, innerNextHi, innerHi);
    indices.push(hi, innerHi, innerNextHi, hi, innerNextHi, nextHi);
    indices.push(lo, innerNextLo, innerLo, lo, nextLo, innerNextLo);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(all.flatMap(v => [v.x, v.y, v.z]), 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return toCreasedNormals(geometry, Math.PI / 3);
}

/** Canonical stem-frame content is translated by the complete COM exactly once. */
export function buildTopComponents(profile: Profile, mesh: TopMeshFactory) {
  const components = { blade: new THREE.Group(), ratchet: new THREE.Group(), bit: new THREE.Group() };
  const centerOfMass = getCenterOfMass(profile);
  const content = { blade: new THREE.Group(), ratchet: new THREE.Group(), bit: new THREE.Group() };
  for (const component of ['blade', 'ratchet', 'bit'] as const) {
    content[component].position.set(-centerOfMass.x, -centerOfMass.y, -centerOfMass.z);
    components[component].add(content[component]);
  }
  let group = content.blade;
  // All procedural vertices below are canonical, measured from the bit tip.
  const palette = profile.modelPalette ?? { metal: 0xa9b5c6, core: 0x52647a, ratchet: 0x8595a9, bit: 0x6b7b90 };
  const bladeVertices = getCanonicalBladeVertices(profile, RENDER_CONTOUR_SAMPLES), materialGeometry = getBladeMaterialGeometry(profile);
  const { topY, coreRadius } = materialGeometry;
  // Die-cast zinc-alloy blade: high metalness only reads as metal once the
  // scene has an environment map (see rendering/environment.ts).
  const metal = mesh(bladeRim(bladeVertices, materialGeometry.rimInnerScale), palette.metal, .27, .92, .25); metal.material.flatShading = true; group.add(metal);

  // Small material-coloured hub leaves the actual contact silhouette exposed. No logos or copied artwork.
  const coreZone = materialGeometry.core, hubZone = materialGeometry.hub;
  const core = mesh(new THREE.CylinderGeometry(coreZone.radiusTop, coreZone.radiusBottom, coreZone.yMax - coreZone.yMin, 48), palette.core, .3, .18, .6); core.position.y = (coreZone.yMin + coreZone.yMax) / 2; group.add(core);
  const hub = mesh(new THREE.CylinderGeometry(hubZone.radiusTop, hubZone.radiusBottom, hubZone.yMax - hubZone.yMin, 32), palette.core, .25, .25, .6); hub.position.y = (hubZone.yMin + hubZone.yMax) / 2; group.add(hub);
  const hubRing = mesh(new THREE.TorusGeometry(coreRadius * .66, .0007, 6, 40), 0xe2e9f3, .24, .9); hubRing.rotation.x = Math.PI / 2; hubRing.position.y = topY + .0032; group.add(hubRing);
  const inset = mesh(new THREE.CylinderGeometry(coreRadius * .39, coreRadius * .39, .0008, 28), 0x263449, .32, .25); inset.position.y = topY + .0045; group.add(inset);

  const count = Math.max(1, Math.min(12, Math.round(profile.contactLobes)));
  const accent = new THREE.Color(palette.core).lerp(new THREE.Color(0xffffff), .28).getHex();
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2, direction = profile.bladeHandedness ?? profile.spin;
    const inner = coreRadius * .76, outer = profile.radius * (profile.bladeStyle === 'single-sword' ? .78 : .70);
    const half = Math.min(.32, Math.PI / count * .34), sweep = profile.bladeStyle === 'round-wing' ? .03 : .18 * direction;
    const polar = (r: number, a: number) => new THREE.Vector2(r * Math.cos(a), -r * Math.sin(a));
    const points = [polar(inner, angle - half), polar(outer, angle + sweep), polar(inner * 1.18, angle + half), polar(inner * .86, angle + half * .2)];
    const shape = new THREE.Shape(points), geometry = new THREE.ExtrudeGeometry(shape, { depth: .0011, bevelEnabled: true, bevelThickness: .0002, bevelSize: .0002, bevelSegments: 1 }); geometry.rotateX(-Math.PI / 2); geometry.translate(0, topY + .0003, 0);
    group.add(mesh(geometry, accent, .35, .22, .5));
    // Broad perimeter assemblies have their own repeated recessed mechanical pads, not identical spokes.
    if (profile.bladeStyle === 'round-wing') {
      const pad = mesh(new THREE.CylinderGeometry(.0017, .0022, .0008, 14), 0x425267, .4, .5);
      pad.position.set(Math.cos(angle) * profile.radius * .80, topY + .0007, Math.sin(angle) * profile.radius * .80); group.add(pad);
    }
  }

  group = content.ratchet;
  // Ratchet resin is translucent coloured plastic on real parts; clearcoat
  // over a lighter tint approximates that without a transmission pass.
  const ratchet = mesh(ringSolid(getCanonicalRatchetVertices(profile, RENDER_CONTOUR_SAMPLES)), palette.ratchet, .34, .05, .7); group.add(ratchet);
  group = content.bit;
  const bit = getBitGeometry(profile), gearThickness = 2 * bit.engagementBand;
  const gear = mesh(new THREE.CylinderGeometry(bit.gearRadius * .85, bit.gearRadius * .85, gearThickness, 48), palette.bit, .42, .1); gear.position.y = bit.gearHeight; group.add(gear);
  const toothWidth = 2 * Math.PI * bit.gearRadius / bit.gearTeeth * .58;
  for (let tooth = 0; tooth < bit.gearTeeth; tooth++) {
    const angle = tooth / bit.gearTeeth * Math.PI * 2, part = mesh(new THREE.BoxGeometry(bit.gearRadius * .22, gearThickness, toothWidth), palette.bit, .43, .1);
    part.position.set(Math.cos(angle) * bit.gearRadius * .90, bit.gearHeight, Math.sin(angle) * bit.gearRadius * .90); part.rotation.y = -angle; group.add(part);
  }
  if (bit.discRadius && bit.discHeight !== undefined) {
    const discShape = new THREE.Shape(); discShape.absarc(0, 0, bit.discRadius, 0, Math.PI * 2, false);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3, hole = new THREE.Path();
      hole.moveTo(Math.cos(a - .33) * bit.discRadius * .48, Math.sin(a - .33) * bit.discRadius * .48);
      hole.lineTo(Math.cos(a - .33) * bit.discRadius * .79, Math.sin(a - .33) * bit.discRadius * .79);
      hole.absarc(0, 0, bit.discRadius * .79, a - .33, a + .33, false);
      hole.lineTo(Math.cos(a + .33) * bit.discRadius * .48, Math.sin(a + .33) * bit.discRadius * .48); hole.closePath(); discShape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(discShape, { depth: bit.discHalfThickness * 2 - .0004, bevelEnabled: true, bevelThickness: .0002, bevelSize: .0002, bevelSegments: 1, curveSegments: 24 }); geometry.rotateX(-Math.PI / 2); geometry.translate(0, bit.discHeight - bit.discHalfThickness + .0002, 0); group.add(mesh(geometry, palette.bit, .4, .1));
  }
  if (bit.tipShape === 'ball') {
    const ball = mesh(new THREE.SphereGeometry(bit.tipRadius, 32, 20), palette.bit, .37, .08); ball.position.y = bit.tipRadius; group.add(ball);
    const neck = mesh(new THREE.CylinderGeometry(bit.bodyRadius, bit.tipRadius * .8, Math.max(.0005, bit.tipLength - bit.tipRadius), 28), palette.bit, .4, .08); neck.position.y = (bit.tipLength + bit.tipRadius) / 2; group.add(neck);
  } else {
    const tip = mesh(new THREE.CylinderGeometry(bit.bodyRadius, bit.tipRadius, bit.tipLength, 32), palette.bit, .4, .08); tip.position.y = bit.tipLength / 2; group.add(tip);
  }
  return components;
}

/** Arena, static inspection and separated fragments reuse these exact component meshes. */
export function buildTopMesh(profile: Profile, mesh: TopMeshFactory): THREE.Group {
  const group = new THREE.Group(), components = buildTopComponents(profile, mesh);
  group.add(components.blade, components.ratchet, components.bit);
  return group;
}

/** Transform a component only from an authoritative rigid-body state. */
export function setComponentPose(
  pose: THREE.Group,
  shape: THREE.Group,
  separated: boolean,
  fragment?: { x: number; y: number; z: number; orientation: Quaternion; componentLocalCenter: Vec3 },
) {
  pose.visible = !separated || Boolean(fragment);
  if (separated && fragment) {
    pose.position.set(fragment.x, fragment.y, fragment.z);
    pose.quaternion.set(fragment.orientation.x, fragment.orientation.y, fragment.orientation.z, fragment.orientation.w);
    const center = fragment.componentLocalCenter;
    shape.position.set(-center.x, -center.y, -center.z);
  } else {
    pose.position.set(0, 0, 0); pose.quaternion.identity(); shape.position.set(0, 0, 0);
  }
}
