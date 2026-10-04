import { BUILDINGS } from '../../content/catalog';
import { meadowBuilding } from '../../content/meadows/recipes';
import type { Adventure } from '../adventure';
import type { Vec3 } from '../../world/types';
import { TREE_KINDS } from '../../content/meadows/data';
import { buildingVoxels,treeVoxels,localPoint,carveVoxels,occupied } from './model';
import { dropItem } from '../interaction/drops';
import { fellTree,chopWood } from '../meadows/forestry';
/** Combat probes the same cell occupancy that rendering uses. No Three.js dependency. */
export function strikeVoxels(game:Adventure,aim:Vec3,reach:number,heavy:boolean):string[]{
 const p=game.sim.player,radius=heavy?.5:.3;
 for(let d=.5;d<=reach;d+=.1){const point={x:p.x+aim.x*d,y:p.y+.85+aim.y*d,z:p.z+aim.z*d};
  for(const n of game.state.resources){if(n.ready<=game.state.seconds&&['fallenLog','stump','bodyPile','beeNest'].includes(n.kind)){let distance=Math.hypot(n.x-point.x,n.y+.2-point.y,n.z-point.z);if(n.log){const a=n.log.a.position,b=n.log.b.position,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy+(point.z-a.z)*dz)/(dx*dx+dy*dy+dz*dz||1)));distance=Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t,point.z-a.z-dz*t);}if(distance<.55){if(n.kind==='fallenLog'||n.kind==='stump')chopWood(game,n);else {n.health=(n.health??40)-(heavy?30:15);if(n.health<=0){if(n.kind==='beeNest'){dropItem(game,'queenBee',1,n);dropItem(game,'honey',2,n);}else dropItem(game,'bone',3,n);n.ready=1e10;}}return [];}}if(n.ready>game.state.seconds||!TREE_KINDS.has(n.kind)||Math.hypot(n.x-point.x,n.z-point.z)>2.5)continue;const model=treeVoxels(n.kind,n.id),local=localPoint(point,n),gone=new Set(n.removed??[]);if(!occupied(model,local,gone))continue;n.removed??=[];const hits=carveVoxels(model,local,radius,n.removed);if(hits.some(c=>c.material==='wood')){dropItem(game,n.kind==='beech'?'wood':'finewood',1,point);n.health=(n.health??80)-20;if(n.health<=0){n.removed=[];fellTree(game,n,p.heading);}}return [];}
  for(const b of game.state.buildings){if(Math.hypot(b.x-point.x,b.z-point.z)>4)continue;const model=buildingVoxels(b.definition),local=localPoint(point,b,b.rotation),gone=new Set(b.removed??[]);if(!occupied(model,local,gone))continue;b.removed??=[];const hits=carveVoxels(model,local,radius,b.removed);const materials=new Set(hits.map(c=>c.material));b.salvage??={...(game.state.meadows?meadowBuilding(BUILDINGS.find(d=>d.id===b.definition)!):BUILDINGS.find(d=>d.id===b.definition)!).cost};for(const material of materials)if((b.salvage![material]??0)>0){dropItem(game,material,1,point);b.salvage![material]--;}b.health=Math.max(0,(b.health??100)-(heavy?25:10));if(b.health<=0){game.state.buildings=game.state.buildings.filter(n=>n!==b);for(const record of [b.contents,b.salvage])for(const [id,n]of Object.entries(record))if(n>0)dropItem(game,id,n,b);game.support();}return [];}
  if(game.sim.world.density(point)<0){if(game.state.equipment==='hands')return [];return game.sim.editGround('dig',point,heavy?.65:.4);}
 }
 return [];
}
