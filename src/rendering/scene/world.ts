import { createFeedback } from '../effects/feedback';
import { createBuildingPreview } from '../game/preview';
import { createAvatarAssets } from '../game/avatar';
import { createContactShadows } from '../game/shadows';
import { createBodies } from '../game/bodies';
import { createAtmosphere } from '../environment/atmosphere';
import { createEntities } from '../game/entities';
import * as THREE from 'three';
import { meadow } from '../../content/biomes';
import { waterSurface, WATER_VERTEX_CAPACITY } from '../../fluid/surface';
import type { Snapshot } from '../../simulation/protocol';
export function createWorld(renderer:THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(meadow.sky); scene.fog = new THREE.Fog(meadow.fog, 28, 61);
  const feedback=createFeedback(scene), preview=createBuildingPreview(scene);
  const atmosphere = createAtmosphere(scene,renderer), entities = createEntities(scene), bodies = createBodies(scene), shadows = createContactShadows(scene);
  const avatars = createAvatarAssets(), localAvatar = avatars.create(), player = localAvatar.group; scene.add(player);
  const waterColors = new Float32Array(WATER_VERTEX_CAPACITY * 3);
  const waterPositions = new Float32Array(WATER_VERTEX_CAPACITY * 3), waterNormals = new Float32Array(WATER_VERTEX_CAPACITY * 3);
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.BufferAttribute(waterPositions, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setAttribute('color', new THREE.BufferAttribute(waterColors, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setAttribute('normal', new THREE.BufferAttribute(waterNormals, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setDrawRange(0, 0);
  const water = new THREE.Mesh(waterGeometry, new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, transparent: true, opacity: .86, roughness: .16, metalness:0, ior:1.333, clearcoat:1, clearcoatRoughness:.09, depthWrite: true, side: THREE.DoubleSide }));
  // Dynamic instances cover different chunks. Avoid stale bounds from the first snapshot.
  const waterTime = { value: 0 };
  (water.material as THREE.MeshStandardMaterial).onBeforeCompile = shader => {
    shader.uniforms.waterTime = waterTime;
    shader.vertexShader = 'uniform float waterTime; varying vec3 waterPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nwaterPoint=position; transformed.y += (sin(position.x*1.7+waterTime*1.6)+sin(position.z*1.3-waterTime))*0.018*(1.0-smoothstep(0.3,0.7,color.r));');
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif(normal.y > 0.5) { float wave=1.0-smoothstep(0.3,0.7,color.r); objectNormal=normalize(vec3(-cos(position.x*1.7+waterTime*1.6)*0.0306*wave,1.0,-cos(position.z*1.3-waterTime)*0.0234*wave)); }');
    shader.fragmentShader = 'uniform float waterTime; varying vec3 waterPoint;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat ripples=0.5+0.5*sin(waterPoint.x*3.0+waterPoint.z*2.0+waterTime*2.0); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.45,0.75,0.75),ripples*0.12); float crest=smoothstep(0.96,1.0,sin(waterPoint.x*2.7+sin(waterPoint.z*2.4+waterTime)*1.1+waterTime*2.0)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.70,0.85,0.78),crest*0.16); diffuseColor.a=0.86;');
  };
  water.receiveShadow=true;water.frustumCulled = false; scene.add(water);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 5, 24), new THREE.MeshBasicMaterial({ color: '#ffeab6', depthTest: false })); marker.renderOrder = 2; marker.visible = false; scene.add(marker);
  const remotePlayers = new Map<string, { model: ReturnType<typeof avatars.create>; target: THREE.Vector3; heading: number }>();
  let waterTick = -1;
  return {
    scene, player, marker, atmosphere, preview:preview.update,faceCamera:entities.faceCamera,
    raycastBuildings: entities.raycast,
    update(state: Snapshot) {
      waterTime.value = state.adventure.seconds; feedback.update(state);
      localAvatar.setPose({ ...state.adventure, shield: !!state.adventure.inventory.shield, grounded: state.player.grounded });
      for (const [id, view] of remotePlayers) if (!state.peers?.some(peer => peer.id === id)) { scene.remove(view.model.group); remotePlayers.delete(id); }
      for (const peer of state.peers ?? []) {
        let view = remotePlayers.get(peer.id);
        if (!view) {
          const model = avatars.create(); model.group.position.set(peer.player.x, peer.player.y, peer.player.z);
          view = { model, target: model.group.position.clone(), heading: peer.player.heading }; remotePlayers.set(peer.id, view); scene.add(model.group);
        }
        view.model.setPose({ ...peer.appearance, grounded: peer.player.grounded });
        view.target.set(peer.player.x, peer.player.y, peer.player.z); view.heading = peer.player.heading;
        if (view.model.group.position.distanceToSquared(view.target) > 100) view.model.group.position.copy(view.target);
      }
      if (Math.floor(state.tick / 3) !== waterTick) {
        waterTick = Math.floor(state.tick / 3);
        const count = waterSurface(state.fluids, waterPositions, waterNormals, waterColors); waterGeometry.setDrawRange(0, count);
        for (const name of ['position', 'normal', 'color']) { const attribute = waterGeometry.getAttribute(name) as THREE.BufferAttribute; attribute.clearUpdateRanges(); if (count) attribute.addUpdateRange(0, count * 3); attribute.needsUpdate = true; }
      }
      entities.update(state.adventure); atmosphere.update(state.adventure, player.position);
      bodies.update(state); shadows.update(state);
    },
    interpolate(dt: number) {
      feedback.animate(dt); const alpha = 1 - Math.exp(-16 * dt); localAvatar.animate(dt);
      for (const view of remotePlayers.values()) {
        view.model.group.position.lerp(view.target, alpha);
        const angle = view.heading - view.model.group.rotation.y;
        view.model.group.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * alpha;
        view.model.animate(dt);
      }
    },
    dispose() {
      atmosphere.dispose();feedback.dispose();preview.dispose();bodies.dispose(); entities.dispose(); shadows.dispose(); scene.remove(player);
      for (const view of remotePlayers.values()) scene.remove(view.model.group); avatars.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); if (object instanceof THREE.InstancedMesh) object.dispose(); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
