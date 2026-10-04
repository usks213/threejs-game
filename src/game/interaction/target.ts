import { buildingVoxels,treeVoxels,localPoint,rayVoxel } from '../voxel/model';
import type { AdventureSnapshot } from '../types';
import type { Vec3 } from '../../world/types';
import { BUILDINGS,ITEM_NAMES } from '../../content/catalog';
import { TREE_KINDS } from '../../content/meadows/data';
export interface InteractionTarget { id:string; label:string; point:Vec3; distance:number; panel?:'bag'|'craft'|'magic' }
export function rayBox(origin:Vec3,direction:Vec3,min:Vec3,max:Vec3):number|null {
 let near=0,far=100;
 for(const axis of ['x','y','z'] as const){const d=direction[axis];if(Math.abs(d)<1e-7){if(origin[axis]<min[axis]||origin[axis]>max[axis])return null;}else{const a=(min[axis]-origin[axis])/d,b=(max[axis]-origin[axis])/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}}
 return near<=far?near:null;
}
export function interactionTarget(s:AdventureSnapshot,player:Vec3,origin:Vec3,direction:Vec3,terrainDistance=Infinity):InteractionTarget|null {
 let best:InteractionTarget|null=null,blocker=terrainDistance;
 const consider=(id:string,label:string,min:Vec3,max:Vec3,panel?:InteractionTarget['panel'],voxelDistance?:number)=>{const distance=voxelDistance??rayBox(origin,direction,min,max);if(distance===null||distance>blocker+.06)return;const point={x:origin.x+direction.x*distance,y:origin.y+direction.y*distance,z:origin.z+direction.z*distance};if(Math.hypot(point.x-player.x,point.y-player.y-.7,point.z-player.z)>3.5)return;if(!best||distance<best.distance)best={id,label,point,distance,panel};};
 for(const n of s.resources)if(TREE_KINDS.has(n.kind)&&n.ready<=s.seconds&&Math.hypot(n.x-player.x,n.z-player.z)<15){const d=rayVoxel(treeVoxels(n.kind,n.id),localPoint(origin,n),direction,n.removed);if(d!==null)blocker=Math.min(blocker,d);}
 for(const b of s.buildings){const d=BUILDINGS.find(d=>d.id===b.definition);if(!d)continue;const c=Math.abs(Math.cos(b.rotation)),r=Math.abs(Math.sin(b.rotation)),hx=(d.size[0]*c+d.size[2]*r)/2,hz=(d.size[0]*r+d.size[2]*c)/2;
 const min={x:b.x-hx,y:b.y,z:b.z-hz},max={x:b.x+hx,y:b.y+d.size[1],z:b.z+hz};
 const label=s.equipment==='hammer'&&!['door','gate','chest','bench','cook','fire','bed'].includes(b.definition)?'修理 / Xで解体':({door:b.open?'閉める':'開ける',gate:b.open?'閉める':'開ける',chest:'箱を開く',bench:'制作・修理',cook:'料理を取り出す／焼く',fire:'薪を入れる',standingTorch:'燃料を入れる',beehive:'蜂蜜を採る',bed:'休む・復活地点',raft:s.meadows?.riding?'降りる':'乗る',sign:b.label||'看板'} as Record<string,string>)[b.definition];
 if(rayBox(origin,direction,min,max)===null)continue;const zero={x:0,y:0,z:0},localDirection=localPoint(direction,zero,b.rotation),distance=rayVoxel(buildingVoxels(b.definition),localPoint(origin,b,b.rotation),localDirection,b.removed);if(distance===null)continue;blocker=Math.min(blocker,distance);if((best as InteractionTarget|null)?.distance!>blocker+.06)best=null;if(label)consider('b:'+b.id,label,min,max,b.definition==='chest'?'bag':b.definition==='bench'?'craft':undefined,distance);
 }
 for(const n of s.resources){if(n.ready>s.seconds||TREE_KINDS.has(n.kind)||['fallenLog','stump','sapling','dolmen','stoneCircle','graveyard','bodyPile','beeNest'].includes(n.kind))continue;
 const large=['altar','sacrifice','runestone','merchant'].includes(n.kind),r=large?1:.45,h=large?2:.7;
 const label=n.drop?`${ITEM_NAMES[n.kind]??n.kind} ×${n.amount}を拾う`:({altar:'供物でボスを呼ぶ',sacrifice:'証を奉納する',runestone:'碑文を読む',merchant:'商人と話す'} as Record<string,string>)[n.kind]??`${ITEM_NAMES[n.kind]??n.kind}を採る`;
 consider('r:'+n.id,label,{x:n.x-r,y:n.y-.15,z:n.z-r},{x:n.x+r,y:n.y+h,z:n.z+r},n.kind==='merchant'?'magic':undefined);
 }
 if(s.death)consider('grave','墓標から回収',{x:s.death.x-.5,y:s.death.y,z:s.death.z-.5},{x:s.death.x+.5,y:s.death.y+1.4,z:s.death.z+.5});
 return best;
}
