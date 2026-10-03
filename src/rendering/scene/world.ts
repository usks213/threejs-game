import * as THREE from 'three';
import { meadow } from '../../content/biomes';
import { terrainHeight } from '../../world/density';
import { waterSurface, WATER_VERTEX_CAPACITY } from '../../fluid/surface';
import type { Snapshot } from '../../simulation/protocol';
export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(meadow.sky); scene.fog = new THREE.Fog(meadow.fog, 28, 61);
  scene.add(new THREE.HemisphereLight(meadow.ambient, '#555543', 2.1));
  const sun = new THREE.DirectionalLight(meadow.sun, 3.2); sun.position.set(-25, 40, 15); scene.add(sun);
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.65, 4, 8), new THREE.MeshStandardMaterial({ color: meadow.player, roughness: 0.9 })); body.position.y = 0.63; player.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#f1dab0' })); head.position.y = 1.2; player.add(head);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.25), new THREE.MeshStandardMaterial({ color: '#425149' })); pack.position.set(0, 0.72, -0.26); player.add(pack); scene.add(player);
  const matrix = new THREE.Matrix4();
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 3.5, 5), new THREE.MeshStandardMaterial({ color: '#476b51', roughness: 1 }), 38);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.23, 2.5, 5), new THREE.MeshStandardMaterial({ color: '#655b40', roughness: 1 }), 38);
  for (let i = 0; i < 38; i++) {
    const angle = i * 2.399, radius = 18 + i % 7 * 2.9, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const y = terrainHeight(x, z);
    matrix.makeTranslation(x, y + 1.25, z); trunks.setMatrixAt(i, matrix);
    matrix.makeTranslation(x, y + 3.1, z); crown.setMatrixAt(i, matrix);
  }
  scene.add(crown, trunks);
  const waterPositions = new Float32Array(WATER_VERTEX_CAPACITY * 3), waterNormals = new Float32Array(WATER_VERTEX_CAPACITY * 3);
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.BufferAttribute(waterPositions, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setAttribute('normal', new THREE.BufferAttribute(waterNormals, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setDrawRange(0, 0);
  const water = new THREE.Mesh(waterGeometry, new THREE.MeshStandardMaterial({ color: meadow.water, transparent: true, opacity: 0.78, roughness: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  // Dynamic instances cover different chunks. Avoid stale bounds from the first snapshot.
  water.frustumCulled = false; scene.add(water);
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: '#8f9287', roughness: 1 }), 12); rocks.count = 0; rocks.frustumCulled = false; scene.add(rocks);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 5, 24), new THREE.MeshBasicMaterial({ color: '#ffeab6', depthTest: false })); marker.renderOrder = 2; marker.visible = false; scene.add(marker);
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3();
  const roll = new THREE.Euler(), rockViews = new Map<number, { x: number; z: number; rx: number; rz: number }>();
  let waterTick = -1;
  return {
    scene, player, marker,
    update(state: Snapshot) {
      if (Math.floor(state.tick / 3) !== waterTick) {
        waterTick = Math.floor(state.tick / 3);
        waterGeometry.setDrawRange(0, waterSurface(state.fluids, waterPositions, waterNormals));
        waterGeometry.getAttribute('position').needsUpdate = true; waterGeometry.getAttribute('normal').needsUpdate = true;
      }
      rocks.count = state.bodies.length;
      for (const id of rockViews.keys()) if (!state.bodies.some(b => b.id === id)) rockViews.delete(id);
      for (let i = 0; i < state.bodies.length; i++) {
        const b = state.bodies[i], p = b.position, view = rockViews.get(b.id) ?? { x: p.x, z: p.z, rx: 0, rz: 0 };
        view.rx += (p.z - view.z) / b.radius; view.rz -= (p.x - view.x) / b.radius; view.x = p.x; view.z = p.z; rockViews.set(b.id, view);
        position.set(p.x, p.y, p.z); rotation.setFromEuler(roll.set(view.rx, 0, view.rz)); scale.setScalar(1); matrix.compose(position, rotation, scale); rocks.setMatrixAt(i, matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); if (object instanceof THREE.InstancedMesh) object.dispose(); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
