import * as THREE from 'three';
import type { Battle, Profile } from '../core/types';
import { buildTopComponents, setComponentPose } from './top-mesh';
import { STADIUM, bowlHeightAt, comHeight, getRailPath } from '../core/physics';

import { buildStadiumSurfaceGeometry, floorTint } from './stadium-surface';
export { buildStadiumSurfaceGeometry } from './stadium-surface';

/** Render the solver's geometry and pose. No invented wobble, rail boost or burst motion. */
export function createArena(canvas: HTMLCanvasElement, onError: (message: string) => void) {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch { onError('WebGLを利用できません。対応ブラウザーで開き直してください。'); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0xeff2f8, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, .01, 5);
  camera.position.set(0, .58, .65); camera.lookAt(0, .018, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x687b9d, 3));
  const sun = new THREE.DirectionalLight(0xffffff, 3.2); sun.position.set(-.8, 1.5, .4); scene.add(sun);
  const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  function mesh(geometry: THREE.BufferGeometry, color: number, roughness = .5, metalness = .1) {
    geometries.add(geometry);
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.add(material);
    return new THREE.Mesh(geometry, material);
  }
  function freeTree(object: THREE.Object3D) {
    object.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        geometries.delete(child.geometry); child.geometry.dispose();
        const list = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of list) { materials.delete(material); material.dispose(); }
      }
    });
  }
  const trayShape = new THREE.Shape();
  const extent = STADIUM.pocketOuterRadius + .006, corner = .07;
  trayShape.moveTo(-extent + corner, -extent); trayShape.lineTo(extent - corner, -extent); trayShape.lineTo(extent, -extent + corner); trayShape.lineTo(extent, extent - corner); trayShape.lineTo(extent - corner, extent); trayShape.lineTo(-extent + corner, extent); trayShape.lineTo(-extent, extent - corner); trayShape.lineTo(-extent, -extent + corner); trayShape.closePath();
  const tray = mesh(new THREE.ExtrudeGeometry(trayShape, { depth: .025, bevelEnabled: true, bevelSegments: 1, bevelSize: .006, bevelThickness: .005, steps: 1 }), 0x27364f, .55, .25);
  tray.rotation.x = Math.PI / 2; tray.position.y = -.018; scene.add(tray);
  // One continuous shared bowl/bank/apron/ramp surface; no free-standing decorative backing.
  const floorSurface = mesh(buildStadiumSurfaceGeometry(), 0xffffff, .48, .1); floorSurface.material.vertexColors = true; scene.add(floorSurface);
  const pocketAt = (angle: number) => STADIUM.pockets.find(p => Math.cos(angle - p.angle) > 0 && Math.abs(Math.sin(angle - p.angle) * STADIUM.coverRadius) < STADIUM.radius * Math.sin(p.halfWidth) + .004);
  // Wall panels omit exactly the solver's pocket angular openings.
  const wallHeight = 'wallHeight' in STADIUM && typeof STADIUM.wallHeight === 'number' ? STADIUM.wallHeight : .034;
  const wallPositions: number[] = [], wallIndices: number[] = [];
  for (let i = 0; i < 180; i++) {
    const a = i / 180 * Math.PI * 2, b = (i + 1) / 180 * Math.PI * 2;
    if (pocketAt((a + b) / 2)) continue;
    const ax = Math.cos(a) * STADIUM.coverRadius, az = Math.sin(a) * STADIUM.coverRadius, bx = Math.cos(b) * STADIUM.coverRadius, bz = Math.sin(b) * STADIUM.coverRadius;
    const ay = bowlHeightAt(ax, az), by = bowlHeightAt(bx, bz), offset = wallPositions.length / 3;
    wallPositions.push(ax, ay, az, bx, by, bz, bx, by + wallHeight, bz, ax, ay + wallHeight, az);
    wallIndices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  const wallGeometry = new THREE.BufferGeometry(); wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3)); wallGeometry.setIndex(wallIndices); wallGeometry.computeVertexNormals(); geometries.add(wallGeometry);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x8da6c9, roughness: .22, metalness: .05, transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false }); materials.add(wallMaterial);
  scene.add(new THREE.Mesh(wallGeometry, wallMaterial));
  const roof = mesh(new THREE.RingGeometry(STADIUM.launchOpeningRadius, STADIUM.coverRadius, 96), 0xb5c6e0, .18, .05);
  roof.rotation.x = -Math.PI / 2; roof.position.y = STADIUM.coverRoofHeight; roof.material.transparent = true; roof.material.opacity = .035; roof.material.side = THREE.DoubleSide; roof.material.depthWrite = false; scene.add(roof);
  const openingPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; openingPoints.push(new THREE.Vector3(Math.cos(a) * STADIUM.launchOpeningRadius, STADIUM.coverRoofHeight, Math.sin(a) * STADIUM.launchOpeningRadius)); }
  const openingGeometry = new THREE.BufferGeometry().setFromPoints(openingPoints), openingMaterial = new THREE.LineBasicMaterial({ color: 0xc5d0e1, transparent: true, opacity: .28, depthWrite: false }); geometries.add(openingGeometry); materials.add(openingMaterial); scene.add(new THREE.Line(openingGeometry, openingMaterial));
  const dummy = new THREE.Object3D();
  const rail = getRailPath();
  // Visual tooth pitch is an explicit estimate, consistent with the 12-tooth / 6 mm bit model.
  // Points lie on the same piecewise-linear path used by the contact solver.
  const lengths = rail.map((point, i) => { const next = rail[(i + 1) % rail.length]; return Math.hypot(next.x - point.x, next.z - point.z); });
  const circumference = lengths.reduce((sum, length) => sum + length, 0), toothCount = Math.max(1, Math.round(circumference / (Math.PI * .012 / 12)));
  let segment = 0, segmentStart = 0;
  const railPoints = Array.from({ length: toothCount }, (_, i) => {
    const distance = i * circumference / toothCount;
    while (segment < rail.length - 1 && distance > segmentStart + lengths[segment]) segmentStart += lengths[segment++];
    const point = rail[segment], next = rail[(segment + 1) % rail.length], t = (distance - segmentStart) / lengths[segment];
    return { x: point.x + (next.x - point.x) * t, y: point.y + (next.y - point.y) * t, z: point.z + (next.z - point.z) * t };
  });
  const railGeometry = new THREE.BoxGeometry(.0018, .002, .004); geometries.add(railGeometry);
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x355af5, roughness: .38, metalness: .35 }); materials.add(railMaterial);
  const teeth = new THREE.InstancedMesh(railGeometry, railMaterial, railPoints.length);
  railPoints.forEach((point, i) => {
    const next = railPoints[(i + 1) % railPoints.length];
    dummy.position.set(point.x, point.y, point.z); dummy.rotation.set(0, -Math.atan2(next.z - point.z, next.x - point.x), 0); dummy.updateMatrix(); teeth.setMatrixAt(i, dummy.matrix);
  }); scene.add(teeth);
  for (const pocket of STADIUM.pockets) {
    const nx = Math.cos(pocket.angle), nz = Math.sin(pocket.angle), tx = -nz, tz = nx;
    const half = STADIUM.radius * Math.sin(pocket.halfWidth);
    const color = pocket.finish === 'xtreme' ? 0xff795c : 0x8da4bf;
    const floorPositions: number[] = [], floorIndices: number[] = [], floorColors: number[] = [], tint = new THREE.Color(), acrossSegments = 16;
    for (let i = 0; i <= 32; i++) {
      for (let j = 0; j <= acrossSegments; j++) {
        const side = (half + .004) * (2 * j / acrossSegments - 1);
        // The shared floor already covers the circle; continue exactly from its boundary.
        const start = Math.sqrt(STADIUM.coverRadius ** 2 - side ** 2);
        const along = start + (STADIUM.pocketOuterRadius - start) * i / 32;
        const x = nx * along + tx * side, z = nz * along + tz * side;
        floorPositions.push(x, bowlHeightAt(x, z), z); floorTint(tint, x, z); floorColors.push(tint.r, tint.g, tint.b);
      }
      if (i < 32) for (let j = 0; j < acrossSegments; j++) { const a = i * (acrossSegments + 1) + j, b = a + acrossSegments + 1; floorIndices.push(a, b + 1, b, a, a + 1, b + 1); }
    }
    const floorGeometry = new THREE.BufferGeometry(); floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(floorPositions, 3)); floorGeometry.setAttribute('color', new THREE.Float32BufferAttribute(floorColors, 3)); floorGeometry.setIndex(floorIndices); floorGeometry.computeVertexNormals(); const pocketFloor = mesh(floorGeometry, 0xffffff); pocketFloor.material.vertexColors = true; scene.add(pocketFloor);
    const back = mesh(new THREE.BoxGeometry(.006, wallHeight, half * 2 + .012), color, .5, .15); back.position.set(nx * (STADIUM.pocketOuterRadius + .003), STADIUM.pocketFloorHeight + wallHeight / 2, nz * (STADIUM.pocketOuterRadius + .003)); back.rotation.y = -pocket.angle; back.material.transparent = true; back.material.opacity = .28; back.material.depthWrite = false; scene.add(back);
    const sideStart = STADIUM.radius - .006, sideLength = STADIUM.pocketOuterRadius - sideStart, sideCenter = (sideStart + STADIUM.pocketOuterRadius) / 2;
    for (const sign of [-1, 1]) {
      const side = mesh(new THREE.BoxGeometry(sideLength, wallHeight, .006), 0x7288a9, .35, .1); side.material.transparent = true; side.material.opacity = .27; side.material.depthWrite = false;
      side.position.set(nx * sideCenter + tx * (half + .003) * sign, STADIUM.pocketFloorHeight + wallHeight / 2, nz * sideCenter + tz * (half + .003) * sign); side.rotation.y = -pocket.angle; scene.add(side);
    }
  }
  // Concentric reference marks follow the actual bowl surface, never float above it.
  for (const radius of [.06, .12, .18]) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 100; i++) { const a = i / 100 * Math.PI * 2, x = Math.cos(a) * radius, z = Math.sin(a) * radius; points.push(new THREE.Vector3(x, bowlHeightAt(x, z) + .00025, z)); }
    const geometry = new THREE.BufferGeometry().setFromPoints(points), material = new THREE.LineBasicMaterial({ color: 0xc1ccdf }); geometries.add(geometry); materials.add(material); scene.add(new THREE.Line(geometry, material));
  }
  const groups: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()]; groups.forEach(group => scene.add(group));
  const shadows = groups.map(() => {
    const shadow = mesh(new THREE.CircleGeometry(.025, 32), 0x52647b); shadow.rotation.x = -Math.PI / 2; shadow.material.transparent = true; shadow.material.opacity = .13; shadow.material.depthWrite = false; scene.add(shadow); return shadow;
  });
  const ownershipRings = groups.map((_, i) => {
    const ring = mesh(new THREE.TorusGeometry(.026, .0007, 5, 40), i === 0 ? 0x335dff : 0xf5785a); ring.rotation.x = Math.PI / 2; ring.material.transparent = true; ring.material.opacity = .62; ring.material.depthWrite = false; scene.add(ring); return ring;
  });
  const contactMarkers = groups.map((_, i) => {
    const marker = mesh(new THREE.TorusGeometry(.008, .001, 5, 24), i === 0 ? 0x335dff : 0xf5785a); marker.rotation.x = Math.PI / 2; marker.material.emissive.setHex(i === 0 ? 0x335dff : 0xf5785a); marker.material.emissiveIntensity = .4; marker.visible = false; scene.add(marker); return marker;
  });
  const trailLength = 64;
  const trails = groups.map((_, i) => {
    const positions = new Float32Array(trailLength * 3), geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setDrawRange(0, 0); geometries.add(geometry);
    const material = new THREE.LineBasicMaterial({ color: i === 0 ? 0x527bff : 0xff8e70, transparent: true, opacity: .42, depthWrite: false }); materials.add(material);
    const line = new THREE.Line(geometry, material); line.frustumCulled = false; scene.add(line); return { positions, geometry, line, count: 0 };
  });
  type ComponentName = 'blade' | 'ratchet' | 'bit';
  const componentNames: ComponentName[] = ['blade', 'ratchet', 'bit'];
  const componentMeshes: Array<Partial<Record<ComponentName, { pose: THREE.Group; shape: THREE.Group }>>> = [{}, {}];
  let profileKey = '', profiles: [Profile, Profile] | null = null, lastTick = -1;
  function setProfiles(next: [Profile, Profile]) {
    const key = JSON.stringify(next); if (key === profileKey) return; profileKey = key; profiles = next;
    groups.forEach((group, index) => {
      for (const child of [...group.children]) { group.remove(child); freeTree(child); }
      const shapes = buildTopComponents(next[index], mesh);
      for (const component of componentNames) {
        const pose = new THREE.Group(), shape = shapes[component];
        pose.add(shape); group.add(pose); componentMeshes[index][component] = { pose, shape };
      }
    });
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    const distance = Math.max(.56 / camera.aspect, .49) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(0, distance * .665, distance * .747); camera.lookAt(0, .018, 0); camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function lost(event: Event) { event.preventDefault(); onError('描画が中断されました。画面を再読み込みしてください。'); }
  canvas.addEventListener('webglcontextlost', lost);
  return {
    setProfiles,
    draw(battle: Battle | null, time: number) {
      const resetTrail = !battle || battle.tick < lastTick, addTrail = Boolean(battle && battle.tick !== lastTick);
      groups.forEach((group, i) => {
        const top = battle?.tops[i], profile = top?.profile ?? profiles?.[i];
        if (!profile) { group.visible = false; shadows[i].visible = false; return; }
        group.visible = true;
        if (top) { group.position.set(top.x, top.y, top.z); group.quaternion.set(top.orientation.x, top.orientation.y, top.orientation.z, top.orientation.w); }
        else { const x = i === 0 ? -.085 : .085; group.position.set(x, bowlHeightAt(x, 0) + comHeight(profile), 0); group.rotation.set(0, time * (i === 0 ? .35 : -.35), 0); }
        // Each fragment inherits a solver COM and quaternion. Reuse the assembled mesh with
        // precisely its component COM offset removed; never invent a burst trajectory.
        const separated = Boolean(top?.separated);
        for (const component of componentNames) {
          const visual = componentMeshes[i][component]; if (!visual) continue;
          const fragment = separated ? battle?.fragments.find(part => part.sourceTop === i && part.component === component) : undefined;
          setComponentPose(visual.pose, visual.shape, separated, fragment);
        }
        const x = group.position.x, z = group.position.z, floor = bowlHeightAt(x, z);
        if (separated) { group.position.set(0, 0, 0); group.quaternion.identity(); }
        shadows[i].visible = !separated && Math.hypot(x, z) <= STADIUM.pocketOuterRadius; shadows[i].position.set(x, floor + .0005, z);
        shadows[i].scale.setScalar(profile.radius / .025); shadows[i].material.opacity = Math.max(.025, .15 - Math.max(0, group.position.y - floor - comHeight(profile)) * 1.6);
        ownershipRings[i].position.set(x, floor + .0008, z); ownershipRings[i].scale.setScalar(profile.radius / .024); ownershipRings[i].visible = !top?.eliminated;
        const trail = trails[i];
        if (resetTrail) { trail.count = 0; trail.geometry.setDrawRange(0, 0); }
        if (addTrail && top && !top.eliminated) {
          if (trail.count === trailLength) trail.positions.copyWithin(0, 3); else trail.count++;
          const offset = (trail.count - 1) * 3; trail.positions[offset] = top.x; trail.positions[offset + 1] = Math.max(floor + .001, top.y - top.centerOfMassHeight); trail.positions[offset + 2] = top.z;
          trail.geometry.attributes.position.needsUpdate = true; trail.geometry.setDrawRange(0, trail.count);
        }
        const marker = contactMarkers[i];
        marker.visible = !separated && Boolean(top?.rail.engaged && top.rail.contactPoint);
        if (marker.visible && top?.rail.contactPoint) { const contact = top.rail.contactPoint; marker.position.set(contact.x, contact.y + .001, contact.z); }
      });
      lastTick = battle?.tick ?? -1; renderer.render(scene, camera);
    },
    dispose() { observer.disconnect(); canvas.removeEventListener('webglcontextlost', lost); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); renderer.dispose(); },
  };
}
