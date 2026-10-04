import { voxelizePrimitive } from '../voxel/primitive';
import { buildingPose,buildingVoxels } from '../../game/voxel/model';
import { voxelGroup,disposeVoxelGroup } from '../voxel/object-mesh';
import { campDetails } from './camp-details';
import { bossTells } from './boss-tells';
import { creatureKit } from './creatures';
import { pbrMaterial } from '../materials/pbr';
import { buildingKit } from './building-model';
import { createResources } from './resources';
import { terrainHeight, landscapeHeight } from '../../world/density';
import * as THREE from 'three';
import { BIOMES, BOSSES, BUILDINGS, ENEMIES } from '../../content/catalog';
import type { AdventureSnapshot } from '../../game/types';
export function createEntities(scene: THREE.Scene) {
 const details=campDetails(scene),tells=bossTells(scene), resources = createResources(scene), buildings = buildingKit(), creatures=creatureKit();
 const objects = new Map<string, THREE.Group>(), geometry = new Map<string, THREE.BufferGeometry>(), materials = new Map<string, THREE.MeshStandardMaterial>();
 const geo = (id: string, make: () => THREE.BufferGeometry) => { let g = geometry.get(id); if (!g) { g = make(); geometry.set(id, g); } return g; };
 const mat = (color: string) => { let m = materials.get(color); if (!m) { m = pbrMaterial(color, color==='#8b8c84'?'stone':['#e2baff','#b6eafa','#ffc077'].includes(color)?'crystal':'skin'); materials.set(color, m); } return m; };
 const part = (group: THREE.Group, shape: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const mesh = new THREE.Mesh(shape, mat(color)); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh); };
 const box = geo('box', () => new THREE.BoxGeometry(1, 1, 1)), sphere = geo('sphere', () => voxelizePrimitive(new THREE.IcosahedronGeometry(0.5, 0))), cone = geo('cone', () => voxelizePrimitive(new THREE.ConeGeometry(1, 2.4, 6)));
 function object(key: string, make: (g: THREE.Group) => void): THREE.Group { let group = objects.get(key); if (!group) { group = new THREE.Group(); make(group); objects.set(key, group); scene.add(group); } return group; }
 let latest: AdventureSnapshot | null = null;
 return {
  update(state: AdventureSnapshot,player?:{x:number;y:number;z:number}) {
   details.update(state,player);tells.update(state);latest = state; for (const group of objects.values()) group.visible = false;
   resources.update(state);
   for (const e of state.enemies) {
    if (e.health <= 0) continue;
    const def = e.boss ? BOSSES.find(d => d.id === e.definition)! : ENEMIES.find(d => d.id === e.definition)!;
    const far=!!player&&Math.hypot(e.x-player.x,e.z-player.z)>18;
    const group = object('enemy' + e.id+(far?'far':''), g => {
     if(['deer','boar','neck','greyling','greydwarf','greydwarfBrute','greydwarfShaman','draugr','draugrArcher','draugrElite','gull','stormstag'].includes(e.definition))g.add(far?creatures.far(e.definition):creatures.make(e.definition));
     else {
     const shape = e.boss ? ({root:'walker',tusk:'boar',mirelord:'slime',frostwing:'flyer',riftheart:'walker'} as const)[e.definition as 'root'] : ENEMIES.find(d => d.id === e.definition)!.shape;
     part(g, sphere, def.color, 0, 0.7, 0, shape === 'slime' ? 1.5 : 1.1, shape === 'slime' ? 0.8 : 1.5, shape === 'boar' ? 1.8 : 1.1);
     if (shape !== 'slime') { part(g, box, def.color, 0, 1.2, -0.4, 0.6, 0.6, 0.8); part(g, sphere, '#f1d297', -0.3, 1.3, -0.7, 0.2, 0.45, 0.2); part(g, sphere, '#f1d297', 0.3, 1.3, -0.7, 0.2, 0.45, 0.2); }
     if (shape === 'flyer') { part(g, box, def.color, -0.9, 0.8, 0, 1.6, 0.08, 0.5); part(g, box, def.color, 0.9, 0.8, 0, 1.6, 0.08, 0.5); }
     if(e.boss && e.definition==='root'){part(g,cone,def.color,0,1.8,0,0.7,0.8,0.7);part(g,box,def.color,-0.8,1,0,1.2,0.25,0.3);part(g,box,def.color,0.8,1,0,1.2,0.25,0.3);}
     if(e.boss && e.definition==='riftheart')part(g,sphere,'#e2baff',0,1.4,0,0.5,0.5,0.5);
     }
     const warning = new THREE.Mesh(geo('warning',()=>new THREE.RingGeometry(1.8,2,24)),mat('#ef916a')); warning.name='warning';warning.rotation.x=-Math.PI/2;warning.position.y=0.05; g.add(warning);
     const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.09), new THREE.MeshBasicMaterial({ color: '#e4a17a', side: THREE.DoubleSide })); bar.name = 'health'; bar.position.y = 2; g.add(bar);
    });
    const scale = e.definition==='stormstag'?2:e.boss ? 2.5 : e.baby?.55:1+(e.stars??0)*.12; group.scale.setScalar(scale * (e.windup > 0 ? 1.05 : 1)); group.position.set(e.x, e.y + Math.sin(state.seconds * 5 + e.id) * 0.035, e.z); const old=group.userData.previous as {x:number;z:number}|undefined; if(old&&Math.hypot(e.x-old.x,e.z-old.z)>.005)group.rotation.y=Math.atan2(old.x-e.x,old.z-e.z);creatures.animate(group,state.seconds,!!old&&Math.hypot(e.x-old.x,e.z-old.z)>.002,e.windup);group.userData.previous={x:e.x,z:e.z}; group.visible = true;
    group.getObjectByName('health')!.visible=e.boss||e.health<def.health*(1+(e.stars??0))*(1+(e.tier-1)*.4);
    if(e.definition==='stormstag')group.rotation.y=(e.heading??0)+Math.PI;
    group.getObjectByName('warning')!.visible = e.windup > 0&&e.definition!=='stormstag';
    group.getObjectByName('health')!.scale.x = Math.max(0.01, e.health / (def.health * (e.boss ? 1 : (1+(e.stars??0))*(1 + (e.tier - 1) * 0.4))));
   }
   for(const n of state.resources)if(n.kind==='merchant'){
    const group=object('merchant'+n.id,g=>{
     part(g,box,'#8a6c4d',0,.7,0,.55,1.25,.4);part(g,sphere,'#d1ac81',0,1.6,0,.55,.55,.55);part(g,cone,'#7d5147',0,1.98,0,.37,.22,.37);
     for(const side of [-1,1]){part(g,box,'#8a6c4d',side*.36,.85,0,.16,.6,.17);part(g,box,'#574632',side*.16,.18,0,.2,.35,.26);}
     part(g,box,'#a58a5d',0,.65,1.2,2,.15,.8);part(g,box,'#76553d',-1.6,.5,-.6,.8,1,.7);part(g,box,'#c7b483',1.8,.6,-.8,1.2,1.2,1.3);
     for(const x of [-2,2])part(g,box,'#8a6c4d',x,1.4,0,.1,2.8,.1);part(g,box,'#b99e69',0,2.75,0,4.3,.15,3);
    });group.position.set(n.x,n.y,n.z);group.visible=true;
   }
   for (const b of state.buildings) {
    const def = BUILDINGS.find(d => d.id === b.definition)!;
    const key='building'+b.id,signature=(b.removed??[]).join(';');const previous=objects.get(key);if(previous&&previous.userData.voxels!==signature){disposeVoxelGroup(previous);scene.remove(previous);objects.delete(key);}const group=object(key,g=>{g.add(voxelGroup(buildingVoxels(b.definition),b.removed));g.userData.voxels=signature;g.userData.buildingId=b.id;}); const pose=buildingPose(b);group.position.set(pose.x,pose.y,pose.z);group.rotation.y=pose.rotation;group.visible=true;
    const flame=group.getObjectByName('flame');if(flame){flame.scale.y=.6+Math.sin(state.seconds*8)*.09;flame.visible=!state.meadows||!!b.fuel&&!b.open;}
   }
   for (const biome of state.meadows?[]:BIOMES) {
    const group = object('altar' + biome.id, g => { part(g, box, '#8b8c84', 0, 0.3, 0, 2.5, 0.6, 2.5); part(g, sphere, biome.grass, 0, 1.1, 0, 0.65, 1, 0.65); });
    group.position.set(biome.center.x, (state.generator===2?landscapeHeight:terrainHeight)(biome.center.x, biome.center.z - 14), biome.center.z - 14); group.visible = state.biome === biome.id;
   }
   for(const [i,grave] of [state.death,...(state.meadows?.graves??[])].entries())if(grave){const g=object('grave'+i,g=>{part(g,box,'#8b8c84',0,.6,0,.65,1.2,.25);part(g,sphere,'#e2baff',0,1.8,0,.14,.3,.14);});g.position.set(grave.x,grave.y,grave.z);g.visible=true;}
   for (const shot of state.projectiles) { const group = object('shot' + shot.id, g => {if(shot.kind){part(g,box,'#8a6c4d',0,0,0,.025,.025,shot.kind==='spear'?1.5:.65);part(g,cone,'#8b8c84',0,0,.4,.04,.08,.04);}else part(g, sphere, shot.element === 'frost' ? '#b6eafa' : '#ffc077', 0, 0, 0, shot.radius, shot.radius, shot.radius);}); group.position.set(shot.x, shot.y, shot.z);if(shot.kind)group.lookAt(shot.x+shot.vx,shot.y+shot.vy,shot.z+shot.vz); group.visible = true; }

   // Retire departed entities; shared geometries/materials remain owned by this renderer.
   for (const [key, group] of objects) if (!group.visible) { scene.remove(group);if(key.startsWith('building'))disposeVoxelGroup(group); group.traverse(o => { if (o instanceof THREE.Mesh) { if (o.name === 'health') o.geometry.dispose(); if (o.name === 'health') (o.material as THREE.Material).dispose(); } }); objects.delete(key); }
  },
  faceCamera(camera:THREE.Camera){for(const [key,g] of objects)if(key.startsWith('enemy'))g.getObjectByName('health')?.lookAt(camera.position);},
  dispose(){for(const [key,g] of objects)if(key.startsWith('building'))disposeVoxelGroup(g);details.dispose();tells.dispose();resources.dispose();buildings.dispose();creatures.dispose();for(const g of geometry.values())g.dispose();for(const m of materials.values())m.dispose();},
  raycast(ray: THREE.Raycaster) { return ray.intersectObjects([...objects.entries()].filter(([key]) => key.startsWith('building')).map(([, group]) => group), true)[0]; },
  collision(player: THREE.Vector3) {
   if (!latest) return;
   for (const b of latest.buildings) {
    if (b.definition === 'fire' || b.definition === 'bed' || b.definition === 'portal') continue;
    const def = BUILDINGS.find(d => d.id === b.definition)!;
    if (player.y > b.y + def.size[1] || player.y + 1.45 < b.y) continue;
    const rx = def.size[0] / 2 + 0.3, rz = def.size[2] / 2 + 0.3, dx = player.x - b.x, dz = player.z - b.z;
    if (Math.abs(dx) < rx && Math.abs(dz) < rz) { if (rx - Math.abs(dx) < rz - Math.abs(dz)) player.x = b.x + Math.sign(dx || 1) * rx; else player.z = b.z + Math.sign(dz || 1) * rz; }
   }
  },
 };
}

