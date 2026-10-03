import { createBodies } from '../game/bodies';
import { createAtmosphere } from '../environment/atmosphere';
import { createEntities } from '../game/entities';
import * as THREE from 'three';
import { meadow } from '../../content/biomes';
import { waterSurface, WATER_VERTEX_CAPACITY } from '../../fluid/surface';
import type { Snapshot } from '../../simulation/protocol';
export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(meadow.sky); scene.fog = new THREE.Fog(meadow.fog, 28, 61);
  const atmosphere = createAtmosphere(scene), entities = createEntities(scene), bodies = createBodies(scene);
  const player = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.65, 4, 8), new THREE.MeshStandardMaterial({ color: meadow.player, roughness: 0.9 })); body.position.y = 0.63; player.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#f1dab0' })); head.position.y = 1.2; player.add(head);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.25), new THREE.MeshStandardMaterial({ color: '#425149' })); pack.position.set(0, 0.72, -0.26); player.add(pack); scene.add(player);
  const waterColors = new Float32Array(WATER_VERTEX_CAPACITY * 3);
  const waterPositions = new Float32Array(WATER_VERTEX_CAPACITY * 3), waterNormals = new Float32Array(WATER_VERTEX_CAPACITY * 3);
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.BufferAttribute(waterPositions, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setAttribute('color', new THREE.BufferAttribute(waterColors, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setAttribute('normal', new THREE.BufferAttribute(waterNormals, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setDrawRange(0, 0);
  const water = new THREE.Mesh(waterGeometry, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, transparent: true, opacity: 0.78, roughness: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  // Dynamic instances cover different chunks. Avoid stale bounds from the first snapshot.
  const waterTime = { value: 0 };
  (water.material as THREE.MeshStandardMaterial).onBeforeCompile = shader => {
    shader.uniforms.waterTime = waterTime;
    shader.vertexShader = 'uniform float waterTime; varying vec3 waterPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nwaterPoint=position; transformed.y += (sin(position.x*1.7+waterTime*1.6)+sin(position.z*1.3-waterTime))*0.018*(1.0-smoothstep(0.3,0.7,color.r));');
    shader.fragmentShader = 'uniform float waterTime; varying vec3 waterPoint;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat ripples=0.5+0.5*sin(waterPoint.x*3.0+waterPoint.z*2.0+waterTime*2.0); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.45,0.75,0.75),ripples*0.12); diffuseColor.a=0.76;');
  };
  water.frustumCulled = false; scene.add(water);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 5, 24), new THREE.MeshBasicMaterial({ color: '#ffeab6', depthTest: false })); marker.renderOrder = 2; marker.visible = false; scene.add(marker);
  const remotePlayers = new Map<string, { avatar: THREE.Group; target: THREE.Vector3; heading: number }>();
  let waterTick = -1;
  return {
    scene, player, marker,
    raycastBuildings: entities.raycast,
    update(state: Snapshot) {
      waterTime.value = state.adventure.seconds;
      for (const [id, view] of remotePlayers) if (!state.peers?.some(peer => peer.id === id)) { scene.remove(view.avatar); remotePlayers.delete(id); }
      for (const peer of state.peers ?? []) {
        let view = remotePlayers.get(peer.id);
        if (!view) {
          const avatar = player.clone(); avatar.visible = true; avatar.position.set(peer.player.x, peer.player.y, peer.player.z);
          view = { avatar, target: avatar.position.clone(), heading: peer.player.heading }; remotePlayers.set(peer.id, view); scene.add(avatar);
        }
        view.target.set(peer.player.x, peer.player.y, peer.player.z); view.heading = peer.player.heading;
        if (view.avatar.position.distanceToSquared(view.target) > 100) view.avatar.position.copy(view.target);
      }
      if (Math.floor(state.tick / 3) !== waterTick) {
        waterTick = Math.floor(state.tick / 3);
        const count = waterSurface(state.fluids, waterPositions, waterNormals, waterColors); waterGeometry.setDrawRange(0, count);
        for (const name of ['position', 'normal', 'color']) { const attribute = waterGeometry.getAttribute(name) as THREE.BufferAttribute; attribute.clearUpdateRanges(); if (count) attribute.addUpdateRange(0, count * 3); attribute.needsUpdate = true; }
      }
      entities.update(state.adventure); atmosphere.update(state.adventure, player.position);
      bodies.update(state);
    },
    interpolate(dt: number) {
      const alpha = 1 - Math.exp(-16 * dt);
      for (const view of remotePlayers.values()) {
        view.avatar.position.lerp(view.target, alpha);
        const angle = view.heading - view.avatar.rotation.y;
        view.avatar.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * alpha;
      }
    },
    dispose() {
      bodies.dispose(); entities.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); if (object instanceof THREE.InstancedMesh) object.dispose(); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}

