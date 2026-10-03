import * as THREE from 'three';
import { meadow } from '../../content/biomes';
import { terrainHeight } from '../../world/density';
import { MAX_FLUID_CELLS } from '../../fluid/fluid';
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
  const water = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 1, 0.98), new THREE.MeshStandardMaterial({ color: meadow.water, transparent: true, opacity: 0.7, roughness: 0.35 }), MAX_FLUID_CELLS); water.count = 0;
  // Dynamic instances cover different chunks. Avoid stale bounds from the first snapshot.
  water.frustumCulled = false; scene.add(water);
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: '#8f9287', roughness: 1 }), 12); rocks.count = 0; rocks.frustumCulled = false; scene.add(rocks);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 5, 24), new THREE.MeshBasicMaterial({ color: '#ffeab6', depthTest: false })); marker.renderOrder = 2; marker.visible = false; scene.add(marker);
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3();
  return {
    scene, player, marker,
    update(state: Snapshot) {
      water.count = state.fluids.length;
      for (let i = 0; i < state.fluids.length; i++) { const c = state.fluids[i]; position.set(c.x + 0.5, c.y + c.volume / 2, c.z + 0.5); scale.set(1, c.volume, 1); matrix.compose(position, rotation, scale); water.setMatrixAt(i, matrix); }
      water.instanceMatrix.needsUpdate = true;
      rocks.count = state.bodies.length;
      for (let i = 0; i < state.bodies.length; i++) { const p = state.bodies[i].position; matrix.makeTranslation(p.x, p.y, p.z); rocks.setMatrixAt(i, matrix); }
      rocks.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); if (object instanceof THREE.InstancedMesh) object.dispose(); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
