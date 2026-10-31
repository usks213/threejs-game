import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Profile, Vec3, Quaternion } from '../core/types';
import { getCenterOfMass, getBitGeometry, getBladeMaterialGeometry, getBladeOutline, getRatchetOutline, getRatchetGeometry, canonicalBladeCenterHeightAt } from '../core/physics';

export type TopMeshFactory = (geometry: THREE.BufferGeometry, color: number, roughness?: number, metalness?: number, clearcoat?: number) => THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/**
 * Rendering-only contour resolution. Physics contact/mass sampling uses its
 * own paths, so raising this sharpens the silhouette without changing any
 * simulated shape; the contour coordinates themselves are unchanged.
 */
const RENDER_CONTOUR_SAMPLES = 128;

/**
 * Layered solid from stacked contour rings (round 3 model rebuild,
 * 2026-10-31). The previous model was a flat two-ring band, which read as a
 * washer; real blades have a beveled metal contact band, a sloped plastic
 * deck and a raised center. Each ring is the physics outline at a scale and
 * height offset, so the simulated silhouette is preserved exactly at the
 * contact band (scale 1) while the vertical profile gains depth. Caps fan
 * to a single center point.
 */
function stackedSolid(rings: Vec3[][], capTop?: Vec3, capBottom?: Vec3): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (const ring of rings) for (const v of ring) positions.push(v.x, v.y, v.z);
  const n = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = r * n + i, b = r * n + j, c = (r + 1) * n + i, d = (r + 1) * n + j;
    indices.push(a, c, d, a, d, b);
  }
  if (capBottom) {
    const center = positions.length / 3; positions.push(capBottom.x, capBottom.y, capBottom.z);
    for (let i = 0; i < n; i++) indices.push(center, (i + 1) % n, i);
  }
  if (capTop) {
    const center = positions.length / 3, base = (rings.length - 1) * n; positions.push(capTop.x, capTop.y, capTop.z);
    for (let i = 0; i < n; i++) indices.push(center, base + i, base + (i + 1) % n);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return toCreasedNormals(geometry, Math.PI / 3);
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
  const materialGeometry = getBladeMaterialGeometry(profile);
  const { coreRadius } = materialGeometry;
  const outline = getBladeOutline(profile, RENDER_CONTOUR_SAMPLES);
  const half = (profile.bladeThickness ?? .009) / 2;
  const ringAt = (scale: number, dy: (center: number) => number) => outline.map((p, i) => {
    const center = canonicalBladeCenterHeightAt(profile, i / outline.length * Math.PI * 2);
    return { x: p.x * scale, y: dy(center), z: p.z * scale };
  });
  const minCenter = Math.min(...outline.map((_, i) => canonicalBladeCenterHeightAt(profile, i / outline.length * Math.PI * 2)));
  const deckY = profile.height * .82 + (profile.bitHeightOffset ?? 0) + half + .0018;

  // Die-cast metal contact band: inset bottom, full contour through the
  // contact zone. The outline coordinates are the physics silhouette.
  const metal = mesh(stackedSolid([
    ringAt(.94, c => c - half),
    ringAt(1, c => c - half + .0010),
    ringAt(1, c => c + half * .30),
  ], undefined, { x: 0, y: minCenter - half, z: 0 }), palette.metal, .27, .92, .25);
  metal.material.flatShading = true; group.add(metal);

  // Coloured plastic deck: bevels in from the band to a flat raised top,
  // like the real two-material blade construction.
  const deck = mesh(stackedSolid([
    ringAt(1, c => c + half * .30),
    ringAt(.885, c => c + half),
    ringAt(.68, () => deckY),
  ], { x: 0, y: deckY + .0010, z: 0 }), palette.core, .3, .18, .6);
  group.add(deck);

  // Metal petal plates (2026-11-01 model pass): on real blades the metal
  // wraps up over the deck at each blade, with the coloured plastic
  // showing in the gaps between blades. One plate per contact lobe,
  // hugging the deck slope (three rows offset +.0007 above the deck
  // profile), so from above the bey reads as metal blades over a
  // coloured core instead of a two-tone cone.
  {
    const lobeCount = Math.max(1, Math.min(12, Math.round(profile.contactLobes)));
    const N = outline.length, halfSpan = Math.max(3, Math.round(N / lobeCount * .46)), steps = Math.min(14, halfSpan * 2);
    for (let lobe = 0; lobe < lobeCount; lobe++) {
      const peak = lobe / lobeCount * Math.PI * 2, rows: Vec3[][] = [[], [], []];
      for (let s = 0; s <= steps; s++) {
        const idx = ((Math.round(lobe * N / lobeCount) - halfSpan + Math.round(s / steps * halfSpan * 2)) % N + N) % N;
        const p = outline[idx], a = peak - Math.PI * 2 / lobeCount * .46 + (s / steps) * Math.PI * 2 / lobeCount * .92;
        const c = canonicalBladeCenterHeightAt(profile, a);
        rows[0].push({ x: p.x, y: c + half * .30 + .0007, z: p.z });
        rows[1].push({ x: p.x * .885, y: c + half + .0007, z: p.z * .885 });
        rows[2].push({ x: p.x * .72, y: deckY + .0007, z: p.z * .72 });
      }
      const petal = mesh(stackedSolid(rows), palette.metal, .27, .92, .25);
      petal.material.flatShading = true; group.add(petal);
    }
  }

  // Deck furniture: recessed center inset and three assembly screws, the
  // visual grammar of the real parts (no logos or copied artwork).
  const inset = mesh(new THREE.CylinderGeometry(coreRadius * .60, coreRadius * .66, .0009, 40), new THREE.Color(palette.core).multiplyScalar(.55).getHex(), .32, .25);
  inset.position.y = deckY + .0009; group.add(inset);
  const emblem = mesh(new THREE.CylinderGeometry(coreRadius * .30, coreRadius * .34, .0008, 32), new THREE.Color(palette.core).lerp(new THREE.Color(0xffffff), .35).getHex(), .3, .3, .5);
  emblem.position.y = deckY + .0016; group.add(emblem);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + .5, screw = mesh(new THREE.CylinderGeometry(.0011, .0011, .0007, 12), 0xd7dee9, .25, .9);
    screw.position.set(Math.cos(a) * coreRadius * .40, deckY + .0011, Math.sin(a) * coreRadius * .40); group.add(screw);
  }

  const count = Math.max(1, Math.min(12, Math.round(profile.contactLobes)));
  const accent = new THREE.Color(palette.core).lerp(new THREE.Color(0xffffff), .28).getHex();
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2, direction = profile.bladeHandedness ?? profile.spin;
    const inner = coreRadius * .76, outer = profile.radius * .60;
    const half2 = Math.min(.32, Math.PI / count * .34), sweep = profile.bladeStyle === 'round-wing' ? .03 : .18 * direction;
    const polar = (r: number, a: number) => new THREE.Vector2(r * Math.cos(a), -r * Math.sin(a));
    const points = [polar(inner, angle - half2), polar(outer, angle + sweep), polar(inner * 1.18, angle + half2), polar(inner * .86, angle + half2 * .2)];
    const shape = new THREE.Shape(points), geometry = new THREE.ExtrudeGeometry(shape, { depth: .0011, bevelEnabled: true, bevelThickness: .0002, bevelSize: .0002, bevelSegments: 1 });
    geometry.rotateX(-Math.PI / 2); geometry.translate(0, deckY + .0004, 0);
    group.add(mesh(geometry, accent, .35, .22, .5));
    // Broad perimeter assemblies keep their recessed mechanical pads, now
    // seated on the upper bevel instead of a flat washer top.
    if (profile.bladeStyle === 'round-wing') {
      const pad = mesh(new THREE.CylinderGeometry(.0017, .0022, .0008, 14), 0x425267, .4, .5);
      pad.position.set(Math.cos(angle) * profile.radius * .80, canonicalBladeCenterHeightAt(profile, angle) + half + .0003, Math.sin(angle) * profile.radius * .80); group.add(pad);
    }
  }

  group = content.ratchet;
  // Ratchet resin is translucent coloured plastic on real parts; clearcoat
  // over a lighter tint approximates that without a transmission pass. The
  // body is now a beveled stack over its lobed outline, not a flat slab.
  const ratchetGeometry = getRatchetGeometry(profile), ratchetOutline = getRatchetOutline(profile, RENDER_CONTOUR_SAMPLES);
  const ratchetRing = (scale: number, y: number) => ratchetOutline.map(p => ({ x: p.x * scale, y, z: p.z * scale }));
  const rc = ratchetGeometry.centerHeight, rh = ratchetGeometry.halfThickness;
  const ratchet = mesh(stackedSolid([
    ratchetRing(.93, rc - rh), ratchetRing(1, rc - rh + .0007), ratchetRing(1, rc + rh - .0007), ratchetRing(.93, rc + rh),
  ], { x: 0, y: rc + rh, z: 0 }, { x: 0, y: rc - rh, z: 0 }), palette.ratchet, .34, .05, .7);
  // Frosted-resin read: slight transparency with depth writing kept on,
  // so the ratchet looks like translucent plastic without sorting artefacts.
  ratchet.material.transparent = true; ratchet.material.opacity = .88;
  group.add(ratchet);
  // Thin darker waist ring: the shadow gap between ratchet and blade.
  const waist = mesh(new THREE.CylinderGeometry(ratchetGeometry.radius * .97, ratchetGeometry.radius * .99, .0008, 64), new THREE.Color(palette.ratchet).multiplyScalar(.72).getHex(), .4, .05);
  waist.position.y = rc + rh + .0004; group.add(waist);

  group = content.bit;
  const bit = getBitGeometry(profile), gearThickness = 2 * bit.engagementBand;
  // A true gear outline (root and tip radii per tooth) extruded, replacing
  // the old cylinder with glued-on boxes.
  const gearShape = new THREE.Shape();
  for (let tooth = 0; tooth < bit.gearTeeth; tooth++) {
    const pitch = Math.PI * 2 / bit.gearTeeth, a0 = tooth * pitch;
    const corners: [number, number][] = [
      [a0, bit.gearRadius * .80], [a0 + pitch * .20, bit.gearRadius * .80],
      [a0 + pitch * .34, bit.gearRadius], [a0 + pitch * .66, bit.gearRadius],
      [a0 + pitch * .80, bit.gearRadius * .80],
    ];
    for (const [a, r] of corners) {
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (tooth === 0 && a === a0 && gearShape.curves.length === 0) gearShape.moveTo(x, y); else gearShape.lineTo(x, y);
    }
  }
  gearShape.closePath();
  const gearGeometry = new THREE.ExtrudeGeometry(gearShape, { depth: gearThickness, bevelEnabled: true, bevelThickness: .0002, bevelSize: .0002, bevelSegments: 1 });
  gearGeometry.rotateX(-Math.PI / 2); gearGeometry.translate(0, bit.gearHeight - gearThickness / 2, 0);
  // The shaft gear reads as darker steel than the coloured tip resin.
  group.add(mesh(gearGeometry, new THREE.Color(palette.bit).multiplyScalar(.62).getHex(), .42, .35));
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
  // Gear Flat (round 4): the gear teeth run all the way down to the tip
  // face, so the tip itself is a star prism instead of a clean disc --
  // the real GF's most recognisable silhouette feature.
  if (profile.bitGearToTip) {
    const starShape = new THREE.Shape();
    for (let tooth = 0; tooth < bit.gearTeeth; tooth++) {
      const pitch = Math.PI * 2 / bit.gearTeeth, a0 = tooth * pitch;
      const corners: [number, number][] = [[a0, bit.tipRadius * .78], [a0 + pitch * .34, bit.tipRadius], [a0 + pitch * .66, bit.tipRadius], [a0 + pitch * .80, bit.tipRadius * .78]];
      for (const [a, r] of corners) { const x = Math.cos(a) * r, y = Math.sin(a) * r; if (tooth === 0 && a === a0 && starShape.curves.length === 0) starShape.moveTo(x, y); else starShape.lineTo(x, y); }
    }
    starShape.closePath();
    const starGeometry = new THREE.ExtrudeGeometry(starShape, { depth: .0018, bevelEnabled: false });
    starGeometry.rotateX(-Math.PI / 2); starGeometry.translate(0, .0018, 0);
    group.add(mesh(starGeometry, palette.bit, .42, .1));
  }
  // Shaft and tip as one lathe per tip family, from the floor up to the gear.
  const gearBottom = bit.gearHeight - gearThickness / 2, L = bit.tipLength, tipR = bit.tipRadius, bodyR = bit.bodyRadius;
  if (bit.tipShape === 'ball') {
    const ball = mesh(new THREE.SphereGeometry(bit.tipRadius, 32, 20), palette.bit, .37, .08); ball.position.y = bit.tipRadius; group.add(ball);
    const neck = mesh(new THREE.CylinderGeometry(bit.bodyRadius, bit.tipRadius * .75, Math.max(.0005, gearBottom - bit.tipRadius * .8), 28), palette.bit, .4, .08); neck.position.y = (gearBottom + bit.tipRadius * .8) / 2; group.add(neck);
  } else {
    const profiles: Record<string, [number, number][]> = {
      flat: profile.bitGearToTip ? [[tipR * .8, .0018], [tipR * .8, .0026], [bodyR * .8, L * .6], [bodyR, L], [bodyR, gearBottom]] : [[tipR, 0], [tipR, .0015], [bodyR * .8, L * .6], [bodyR, L], [bodyR, gearBottom]],
      needle: [[.00035, 0], [tipR * .9, .0018], [bodyR * .72, L * .7], [bodyR, L], [bodyR, gearBottom]],
      taper: [[tipR, 0], [tipR * 1.1, L * .3], [bodyR * .82, L * .75], [bodyR, L], [bodyR, gearBottom]],
    };
    const points = (profiles[bit.tipShape] ?? profiles.taper).map(([r, y]) => new THREE.Vector2(r, y));
    group.add(mesh(new THREE.LatheGeometry(points, 48), palette.bit, .4, .08));
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
