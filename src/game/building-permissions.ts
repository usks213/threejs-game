import type { Adventure } from './adventure';
import type { BuildingState } from './types';
import type { Vec3 } from '../world/types';
import { BUILDINGS } from '../content/catalog';
import { assertInteractionReach } from './interaction/reach';
import { buildingPose, buildingVoxels, localPoint, voxelBounds, worldPoint } from './voxel/model';
export function canModifyBuilding(game:Adventure,b:BuildingState):boolean{return game.sim.world.generator!==4||!b.creator||b.creator===game.owner||b.shared===true;}
function unsupported(game:Adventure,omit?:BuildingState,density=game.sim.world.density.bind(game.sim.world)):Set<number>{
 const buildings=game.state.buildings.filter(b=>b!==omit),support=new Map(buildings.map(b=>[b.id,b.definition==='raft'?4:density({x:b.x,y:b.y-.15,z:b.z})<.2?BUILDINGS.find(d=>d.id===b.definition)!.support:0]));
 for(let pass=0;pass<8;pass++)for(const b of buildings)for(const other of buildings)if(b!==other&&Math.abs(b.x-other.x)<=2.2&&Math.abs(b.y-other.y)<=2.2&&Math.abs(b.z-other.z)<=2.2)support.set(b.id,Math.max(support.get(b.id)!,support.get(other.id)!-1));
 return new Set(buildings.filter(b=>support.get(b.id)!<=0).map(b=>b.id));
}
export function assertBuildingDestruction(game:Adventure,b:BuildingState):void{
 if(game.sim.world.generator!==4)return;
 if(!canModifyBuilding(game,b))throw Error('この建築の解体・破壊は作成者か共有設定が必要です');
 const before=unsupported(game),after=unsupported(game,b);
 if(game.state.buildings.some(other=>!canModifyBuilding(game,other)&&after.has(other.id)&&!before.has(other.id)))throw Error('他の冒険者の建築を支えています。共有設定が必要です');
}
export function assertBuildingAccess(game:Adventure,b:BuildingState,mode:'modify'|'withdraw'|'cooperate'):void{
 if(game.sim.world.generator!==4)return;
 if(mode==='modify')assertBuildingDestruction(game,b);
 else if(mode==='withdraw'&&!canModifyBuilding(game,b))throw Error('この建築の取出には作成者か共有設定が必要です');
 const pose=buildingPose(b),bounds=voxelBounds(buildingVoxels(b.definition)),eye=localPoint({...game.sim.player,y:game.sim.player.y+.8},pose,pose.rotation);
 const point=worldPoint({x:Math.max(bounds.min.x,Math.min(bounds.max.x,eye.x)),y:Math.max(bounds.min.y,Math.min(bounds.max.y,eye.y)),z:Math.max(bounds.min.z,Math.min(bounds.max.z,eye.z))},pose,pose.rotation);
 assertInteractionReach(game.state,game.sim.player,'b:'+b.id,point,p=>game.sim.world.density(p));
}
export function setBuildingShared(game:Adventure,id:string):string{
 const match=/^(\d+):(on|off)$/.exec(id),b=match&&game.state.buildings.find(b=>b.id===Number(match[1]));
 if(!b||game.sim.world.generator!==4||b.creator!==game.owner)throw Error('共有設定は建築の作成者だけが変更できます');
 assertBuildingAccess(game,b,'cooperate');b.shared=match![2]==='on';return b.shared?'建築を共有しました':'建築を個人所有にしました';
}
/** Reject an edit intersecting a private structure or removing any of its support paths. */
export function assertBuildingTerrain(game:Adventure,point:Vec3,radius:number):void{
 if(game.sim.world.generator!==4)return;
 const privateBuildings=game.state.buildings.filter(b=>!canModifyBuilding(game,b));if(!privateBuildings.length)return;
 for(const b of privateBuildings){const pose=buildingPose(b),local=localPoint(point,pose,pose.rotation),bounds=voxelBounds(buildingVoxels(b.definition));if(Math.hypot(...(['x','y','z'] as const).map(axis=>Math.max(bounds.min[axis]-local[axis],local[axis]-bounds.max[axis],0)))<=radius)throw Error('他の冒険者の建築周辺は共有設定が必要です');}
 const before=unsupported(game),after=unsupported(game,undefined,p=>Math.hypot(p.x-point.x,p.y-point.y,p.z-point.z)<=radius+.2?1:game.sim.world.density(p));
 if(privateBuildings.some(b=>after.has(b.id)&&!before.has(b.id)))throw Error('他の冒険者の建築の支持地形は変更できません');
}
