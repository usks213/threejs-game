import {createTrailRace} from '../game/trail-race';
import {createExpeditions} from '../game/expeditions';
import {createCompanions} from '../game/companions';
import {foodEffect} from '../../content/adventure-food';
import { createLandmarks } from '../game/landmarks';
import { createSkybound } from '../game/skybound';
import { createFeedback } from '../effects/feedback';
import { createBuildingPreview } from '../game/preview';
import { createAvatarAssets } from '../game/avatar';
import { createContactShadows } from '../game/shadows';
import { createBodies } from '../game/bodies';
import { createAtmosphere } from '../environment/atmosphere';
import { createEntities } from '../game/entities';
import * as THREE from 'three';
import { meadow } from '../../content/biomes';
import { WATER_VERTEX_CAPACITY } from '../../fluid/surface';
import { WaterMeshingController } from '../water/controller';
import type { Snapshot } from '../../simulation/protocol';
export function createWorld(renderer:THREE.WebGLRenderer,direct=false) {
  const scene = new THREE.Scene();scene.userData.direct=direct;
  scene.background = new THREE.Color(meadow.sky); scene.fog = new THREE.Fog(meadow.fog, 28, 61);
  const glow=new THREE.PointLight('#c5efbd',0,3.5,2);scene.add(glow);
  const race=createTrailRace(scene),skybound=createSkybound(scene),companions=createCompanions(scene),expeditions=createExpeditions(scene),landmarks=createLandmarks(scene);
  const feedback=createFeedback(scene), preview=createBuildingPreview(scene);
  const atmosphere = createAtmosphere(scene,renderer), entities = createEntities(scene,direct), bodies = createBodies(scene), shadows = createContactShadows(scene);
  const avatars = createAvatarAssets(), localAvatar = avatars.create(), player = localAvatar.group; scene.add(player);
  const waterColors = new Float32Array(WATER_VERTEX_CAPACITY * 3);
  const waterPositions = new Float32Array(WATER_VERTEX_CAPACITY * 3), waterNormals = new Float32Array(WATER_VERTEX_CAPACITY * 3);
  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.BufferAttribute(waterPositions, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setAttribute('color', new THREE.BufferAttribute(waterColors, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setAttribute('normal', new THREE.BufferAttribute(waterNormals, 3).setUsage(THREE.DynamicDrawUsage));
  waterGeometry.setDrawRange(0, 0);
  const water = new THREE.Mesh(waterGeometry, new THREE.MeshPhysicalMaterial({ color: '#60877f', vertexColors: true, transparent: true, opacity: .86, roughness: .16, metalness:0, ior:1.333, clearcoat:1, clearcoatRoughness:.09, depthWrite: true, side: THREE.DoubleSide }));
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
  const waterMesher = new WaterMeshingController(() => new Worker(new URL('../water/worker.ts', import.meta.url), { type: 'module' }));
  const resetWater = () => { waterTick = -1; waterMesher.reset(); waterGeometry.setDrawRange(0, 0); };
  return {
    setReducedMotion(value:boolean){scene.userData.reducedMotion=value;feedback.setReducedMotion(value);},
    scene, player, marker, atmosphere, waterSurface:water, preview:preview.update,faceCamera:entities.faceCamera,
    raycastBuildings: entities.raycast,
    resetWater,selectPart:skybound.select,
    get waterStats() { return waterMesher.stats; },
    prepareWater() {
      return waterMesher.prepare(result => {
        waterPositions.set(result.positions); waterNormals.set(result.normals); waterColors.set(result.colors);
        waterGeometry.setDrawRange(0, result.count);
        for (const name of ['position', 'normal', 'color']) {
          const attribute = waterGeometry.getAttribute(name) as THREE.BufferAttribute;
          attribute.clearUpdateRanges();
          // An empty range means a full upload to Three.js, so leave empty water's attributes untouched.
          if (result.count) { attribute.addUpdateRange(0, result.count * 3); attribute.needsUpdate = true; }
        }
      });
    },
    update(state: Snapshot) {
      scene.userData.generator=state.adventure.generator;glow.intensity=foodEffect(state.adventure,'glow')?3:0;glow.position.set(state.player.x,state.player.y+1,state.player.z);
      race.update(state);skybound.update(state.adventure.skybound,state.player);companions.update(state);expeditions.update(state);
      waterTime.value = state.adventure.seconds; feedback.update(state);
      player.rotation.z=state.adventure.coop?.downedSeconds?-1.25:0;
      localAvatar.setPose({ ...state.adventure,crouching:!!state.player.crouching,riding:!!state.adventure.companions?.riding, shield: !!(state.adventure.inventory.shield||state.adventure.inventory.towerShield),tower:state.adventure.meadows?state.adventure.meadows.gear.offhand==='towerShield':!!state.adventure.inventory.towerShield,gear:state.adventure.meadows?Object.fromEntries(Object.entries(state.adventure.meadows.gear).filter(([,id])=>state.adventure.inventory[id]>0)):undefined, grounded: state.player.grounded });
      for (const [id, view] of remotePlayers) if (!state.peers?.some(peer => peer.id === id)) { scene.remove(view.model.group); remotePlayers.delete(id); }
      for (const peer of state.peers ?? []) {
        let view = remotePlayers.get(peer.id);
        if (!view) {
          const model = avatars.create(); model.group.position.set(peer.player.x, peer.player.y, peer.player.z);
          view = { model, target: model.group.position.clone(), heading: peer.player.heading }; remotePlayers.set(peer.id, view); scene.add(model.group);
        }
        view.model.group.rotation.z=peer.appearance?.downed?-1.25:0;
        view.model.setPose({ ...peer.appearance,riding:state.adventure.companions?.creatures.some(c=>c.rider===peer.id), grounded: peer.player.grounded });
        view.target.set(peer.player.x, peer.player.y, peer.player.z); view.heading = peer.player.heading;
        if (view.model.group.position.distanceToSquared(view.target) > 100) view.model.group.position.copy(view.target);
      }
      landmarks.update(state,player,remotePlayers);
      const revision = Math.floor(state.tick / 3);
      if (revision < waterTick) resetWater();
      if (revision !== waterTick) { waterTick = revision; waterMesher.request(state.fluids, revision); }
      entities.update(state.adventure,state.player); atmosphere.update(state.adventure, player.position);
      bodies.update(state); shadows.update(state);
    },
    interpolate(dt: number) {
      companions.animate(dt);expeditions.animate(dt);feedback.animate(dt); const alpha = 1 - Math.exp(-16 * dt); localAvatar.animate(dt);
      for (const view of remotePlayers.values()) {
        view.model.group.position.lerp(view.target, alpha);
        const angle = view.heading - view.model.group.rotation.y;
        view.model.group.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * alpha;
        view.model.animate(dt);
      }
    },
    dispose() {
      race.dispose();companions.dispose();expeditions.dispose();landmarks.dispose();skybound.dispose();waterMesher.dispose();
      atmosphere.dispose();feedback.dispose();preview.dispose();bodies.dispose(); entities.dispose(); shadows.dispose(); scene.remove(player);
      for (const view of remotePlayers.values()) scene.remove(view.model.group); avatars.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); if (object instanceof THREE.InstancedMesh) object.dispose(); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
