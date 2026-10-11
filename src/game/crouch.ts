import {CHARACTER_HEIGHT,CHARACTER_RADIUS,characterHeight} from '../physics/character-shape';
import {skyPartOverlapsCapsule} from './skybound/assembly-contacts';
import {touchesBuildingVoxels} from './meadows/obstacles';
import {bodyTouchesVoxels,treeVoxels,localPoint} from './voxel/model';
import {TREE_KINDS} from '../content/meadows/data';
import type {Adventure} from './adventure';
/** Expanding a body is an authority decision against live world geometry, never an upward teleport. */
export function canStand(game:Adventure):boolean{
 const sim=game.sim,p=sim.player,r=CHARACTER_RADIUS,h=CHARACTER_HEIGHT,normal={x:0,y:1,z:0};if(p.y+h>=sim.world.bounds.maxY-.01)return false;
 for(let i=0;i<5;i++){const y=p.y+r+(h-2*r)*i/4;if(sim.world.surfaceDistance({x:p.x,y,z:p.z},normal)<r-.003)return false;}
 if(game.state.buildings.some(b=>touchesBuildingVoxels(b,p.x,p.y,p.z,r,h)))return false;
 if(game.state.resources.some(n=>TREE_KINDS.has(n.kind)&&n.ready<=game.state.seconds&&Math.hypot(n.x-p.x,n.z-p.z)<3&&bodyTouchesVoxels(treeVoxels(n.kind,n.id),localPoint(p,n),n.removed,h)))return false;
 if(sim.skybound.state.parts.some(part=>skyPartOverlapsCapsule(part,p,r,h)))return false;
 if(sim.bodies.some(body=>Math.hypot(body.position.x-p.x,body.position.z-p.z,body.position.y-Math.max(p.y+r,Math.min(p.y+h-r,body.position.y)))<body.radius+r-1e-6))return false;
 return !sim.targets.some(actor=>actor.adventure.owner!==game.owner&&Math.hypot(actor.player.x-p.x,actor.player.z-p.z)<2*r&&p.y+h>actor.player.y&&actor.player.y+characterHeight(actor.player)>p.y);
}
