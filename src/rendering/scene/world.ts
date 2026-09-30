import * as THREE from 'three';
export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#111d29');
  scene.fog = new THREE.Fog('#111d29', 22, 50);
  scene.add(new THREE.HemisphereLight('#ecfaff', '#4d7063', 2.5));
  const sun = new THREE.DirectionalLight('#fff4d8', 3); sun.position.set(8, 15, 5); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#30554e', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.GridHelper(30, 30, '#7caa96', '#416c60'); grid.position.y = 0.01; scene.add(grid);
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.65, 4, 8), new THREE.MeshStandardMaterial({ color: '#ffce70', roughness: 0.8 })); body.position.y = 0.65; player.add(body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: '#263b43' })); face.position.set(0, 0.95, 0.3); player.add(face); scene.add(player);
  const geometry = new THREE.ConeGeometry(0.7, 2.5, 5);
  const material = new THREE.MeshStandardMaterial({ color: '#82b295', roughness: 1 });
  const markers = new THREE.InstancedMesh(geometry, material, 16);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) { const angle = i / 16 * Math.PI * 2; matrix.makeTranslation(Math.sin(angle) * 14, 1.25, Math.cos(angle) * 14); markers.setMatrixAt(i, matrix); } scene.add(markers);
  return { scene, player, dispose: () => {
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
    scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { geometries.add(object.geometry); for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); markers.dispose();
  } };
}
