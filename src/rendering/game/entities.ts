import { terrainHeight } from '../../world/density';
import * as THREE from 'three';
import { BIOMES, BOSSES, BUILDINGS, ENEMIES } from '../../content/catalog';
import type { AdventureSnapshot } from '../../game/types';
export function createEntities(scene: THREE.Scene) {
 const objects = new Map<string, THREE.Group>(), geometry = new Map<string, THREE.BufferGeometry>(), materials = new Map<string, THREE.MeshStandardMaterial>();
 const geo = (id: string, make: () => THREE.BufferGeometry) => { let g = geometry.get(id); if (!g) { g = make(); geometry.set(id, g); } return g; };
 const mat = (color: string) => { let m = materials.get(color); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }); materials.set(color, m); } return m; };
 const part = (group: THREE.Group, shape: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const mesh = new THREE.Mesh(shape, mat(color)); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); };
 const box = geo('box', () => new THREE.BoxGeometry(1, 1, 1)), sphere = geo('sphere', () => new THREE.IcosahedronGeometry(0.5, 0)), cone = geo('cone', () => new THREE.ConeGeometry(1, 2.4, 6));
 function object(key: string, make: (g: THREE.Group) => void): THREE.Group { let group = objects.get(key); if (!group) { group = new THREE.Group(); make(group); objects.set(key, group); scene.add(group); } return group; }
 let latest: AdventureSnapshot | null = null;
 return {
  update(state: AdventureSnapshot) {
   latest = state; for (const group of objects.values()) group.visible = false;
   for (const n of state.resources) {
    if (n.ready > state.seconds) continue;
    const group = object('resource' + n.id, g => {
     if (n.kind === 'wood') { part(g, box, '#775d43', 0, 1.4, 0, 0.3, 2.8, 0.3); part(g, cone, '#5c814f', 0, 3, 0); }
     else if (n.kind === 'berry') { part(g, sphere, '#56714d', 0, 0.45, 0, 1.4, 1.1, 1.4); part(g, sphere, '#cc896e', 0.2, 0.8, 0.2, 0.3, 0.3, 0.3); }
     else part(g, sphere, n.kind === 'copper' ? '#b99466' : n.kind === 'iron' ? '#809199' : n.kind === 'crystal' ? '#b0dce1' : n.kind === 'aether' ? '#b08ad0' : '#a8a796', 0, 0.4, 0, 1.5, 1.5, 1.5);
    }); group.position.set(n.x, n.y, n.z); group.visible = true;
   }
   for (const e of state.enemies) {
    if (e.health <= 0) continue;
    const def = e.boss ? BOSSES.find(d => d.id === e.definition)! : ENEMIES.find(d => d.id === e.definition)!;
    const group = object('enemy' + e.id, g => {
     const shape = e.boss ? ({root:'walker',tusk:'boar',mirelord:'slime',frostwing:'flyer',riftheart:'walker'} as const)[e.definition as 'root'] : ENEMIES.find(d => d.id === e.definition)!.shape;
     part(g, sphere, def.color, 0, 0.7, 0, shape === 'slime' ? 1.5 : 1.1, shape === 'slime' ? 0.8 : 1.5, shape === 'boar' ? 1.8 : 1.1);
     if (shape !== 'slime') { part(g, box, def.color, 0, 1.2, -0.4, 0.6, 0.6, 0.8); part(g, sphere, '#f1d297', -0.3, 1.3, -0.7, 0.2, 0.45, 0.2); part(g, sphere, '#f1d297', 0.3, 1.3, -0.7, 0.2, 0.45, 0.2); }
     if (shape === 'flyer') { part(g, box, def.color, -0.9, 0.8, 0, 1.6, 0.08, 0.5); part(g, box, def.color, 0.9, 0.8, 0, 1.6, 0.08, 0.5); }
     if(e.boss && e.definition==='root'){part(g,cone,def.color,0,1.8,0,0.7,0.8,0.7);part(g,box,def.color,-0.8,1,0,1.2,0.25,0.3);part(g,box,def.color,0.8,1,0,1.2,0.25,0.3);}
     if(e.boss && e.definition==='riftheart')part(g,sphere,'#e2baff',0,1.4,0,0.5,0.5,0.5);
     const warning = new THREE.Mesh(geo('warning',()=>new THREE.RingGeometry(1.8,2,24)),mat('#ef916a')); warning.name='warning';warning.rotation.x=-Math.PI/2;warning.position.y=0.05; g.add(warning);
     const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.09), new THREE.MeshBasicMaterial({ color: '#e4a17a', side: THREE.DoubleSide })); bar.name = 'health'; bar.position.y = 2; g.add(bar);
    });
    const scale = e.boss ? 2.5 : 1; group.scale.setScalar(scale * (e.windup > 0 ? 1.05 : 1)); group.position.set(e.x, e.y + Math.sin(state.seconds * 5 + e.id) * 0.035, e.z); group.rotation.y = Math.atan2(e.homeX - e.x, e.homeZ - e.z); group.visible = true;
    group.getObjectByName('warning')!.visible = e.windup > 0;
    group.getObjectByName('health')!.scale.x = Math.max(0.01, e.health / (def.health * (e.boss ? 1 : 1 + (e.tier - 1) * 0.4)));
   }
   for (const b of state.buildings) {
    const def = BUILDINGS.find(d => d.id === b.definition)!;
    const group = object('building' + b.id, g => { if(b.definition==='portal'){part(g,box,def.color,-0.85,1.5,0,0.3,3,0.4);part(g,box,def.color,0.85,1.5,0,0.3,3,0.4);part(g,box,def.color,0,2.85,0,2,0.3,0.4);}
     else part(g, box, def.color, 0, def.size[1] / 2, 0, ...def.size); if (b.definition === 'fire') { const flame = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: '#ffc77a' })); flame.position.y = 0.4; flame.scale.set(0.2, 0.35, 0.2); g.add(flame); } }); group.position.set(b.x, b.y, b.z); group.rotation.y = b.rotation; group.visible = true;
   }
   for (const biome of BIOMES) {
    const group = object('altar' + biome.id, g => { part(g, box, '#8b8c84', 0, 0.3, 0, 2.5, 0.6, 2.5); part(g, sphere, biome.grass, 0, 1.1, 0, 0.65, 1, 0.65); });
    group.position.set(biome.center.x, terrainHeight(biome.center.x, biome.center.z - 14), biome.center.z - 14); group.visible = state.biome === biome.id;
   }
   for (const shot of state.projectiles) { const group = object('shot' + shot.id, g => part(g, sphere, shot.element === 'frost' ? '#b6eafa' : '#ffc077', 0, 0, 0, shot.radius, shot.radius, shot.radius)); group.position.set(shot.x, shot.y, shot.z); group.visible = true; }
   // Retire departed entities; shared geometries/materials remain owned by this renderer.
   for (const [key, group] of objects) if (!group.visible) { scene.remove(group); group.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'health') { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); objects.delete(key); }
  },
  dispose(){for(const g of geometry.values())g.dispose();for(const m of materials.values())m.dispose();},
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
