import * as THREE from 'three';
import {createRig} from './rig';
import {attackPose} from '../core/motion';
import type {ActorFrame} from '../network/game-frame';
/** One reusable remote companion rig; no guest objects are created per packet. */
export function createCoopAvatar(scene:THREE.Scene,armor:()=>0|6|10=()=>0){const rig=createRig(),holder=new THREE.Group();holder.name='cooperative-companion';holder.add(rig.root);holder.visible=false;scene.add(holder);let target:ActorFrame|null=null,disposed=false;
 return {set(value:ActorFrame|null){target=value?{...value,position:{...value.position}}:null;if(!target)holder.visible=false;},update(dt:number){if(disposed||!target){holder.visible=false;return;}rig.syncDamage([],target.environment?.burning??0,target.environment?.wet??0,target.environment?.shock??0);rig.setArmorStyle(armor(),target.environment?.wet??0);const wasVisible=holder.visible;holder.visible=true;const p=new THREE.Vector3(target.position.x,target.position.y,target.position.z);if(!wasVisible||holder.position.distanceTo(p)>4)holder.position.copy(p);else holder.position.lerp(p,1-Math.exp(-Math.min(dt,.1)*22));holder.rotation.y=target.yaw;const phase=['idle','windup','strike','recover'].includes(target.phase)?target.phase as 'idle'|'windup'|'strike'|'recover':'idle';rig.update(attackPose(target.attack,phase,target.time),target.stride,Math.hypot(target.vx,target.vz),target.guard,target.tool,0,target.hp<=0?1:0);},dispose(){if(disposed)return;disposed=true;scene.remove(holder);rig.dispose();}};
}
