import * as THREE from 'three';
import type { Profile } from '../core/types';
import { comHeight } from '../core/physics';
import { buildTopMesh } from './top-mesh';

/** Static inspection uses exactly the arena assembly, fixed camera/scale, and no animation loop. */
export function createTopPreview(canvas: HTMLCanvasElement, onError: (message: string) => void) {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
  catch { onError('パーツの3Dプレビューを表示できません。'); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor(0xf6f8fc, 1);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-.05, .05, .0375, -.0375, .001, 1);
  camera.position.set(.060, .065, .100); camera.lookAt(0, .001, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x60728b, 2.6));
  const light = new THREE.DirectionalLight(0xffffff, 3.2); light.position.set(-.1, .16, .1); scene.add(light);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  function mesh(geometry: THREE.BufferGeometry, color: number, roughness = .5, metalness = .1) {
    geometries.add(geometry); const material = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.add(material); return new THREE.Mesh(geometry, material);
  }
  const stage = new THREE.Group(); stage.rotation.y = .55; scene.add(stage);
  const floor = mesh(new THREE.CircleGeometry(.033, 64), 0xe3e9f2, .85, 0); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const markGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.029, 0, .024), new THREE.Vector3(-.019, 0, .024)]);
  const markMaterial = new THREE.LineBasicMaterial({ color: 0x708199 }); geometries.add(markGeometry); materials.add(markMaterial);
  const scaleMark = new THREE.Line(markGeometry, markMaterial); scene.add(scaleMark); // Exactly 10 mm in the assembly's SI coordinate system.
  let disposed = false, key = '', view: 'top' | 'underside' = 'top';
  function draw() { if (!disposed) renderer.render(scene, camera); }
  function removeAssembly() {
    for (const child of [...stage.children]) {
      stage.remove(child); child.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.delete(object.geometry); object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.delete(material); material.dispose(); }
        }
      });
    }
  }
  function setProfile(profile: Profile) {
    const next = JSON.stringify(profile); if (key === next) return; key = next; removeAssembly(); stage.add(buildTopMesh(profile, mesh));
    floor.position.y = -comHeight(profile) - .0005; scaleMark.position.y = floor.position.y + .0002; draw();
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(), aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    const halfHeight = .0375; camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix(); draw();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function lost(event: Event) { event.preventDefault(); onError('3Dプレビューが中断されました。画面を再読み込みしてください。'); }
  canvas.addEventListener('webglcontextlost', lost);
  return {
    setProfile,
    setView(next: 'top' | 'underside') {
      view = next; camera.position.set(.060, view === 'underside' ? -.065 : .065, .100); camera.lookAt(0, view === 'underside' ? -.004 : .001, 0); floor.visible = view === 'top'; draw();
    },
    rotate(deltaRadians: number) { if (Number.isFinite(deltaRadians)) { stage.rotation.y += deltaRadians; draw(); } },
    setAngle(yaw: number) { if (Number.isFinite(yaw)) { stage.rotation.y = yaw; draw(); } },
    dispose() { disposed = true; observer.disconnect(); canvas.removeEventListener('webglcontextlost', lost); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); renderer.dispose(); },
  };
}
