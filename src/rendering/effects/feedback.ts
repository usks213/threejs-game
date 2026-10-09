import {SkyContactCursor} from '../../game/skybound/contact-events';
import * as THREE from 'three';
import type { Snapshot } from '../../simulation/protocol';
export function createFeedback(scene:THREE.Scene){
 const count=120,positions=new Float32Array(count*3),colors=new Float32Array(count*3),velocity=new Float32Array(count*3),life=new Float32Array(count);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 const material=new THREE.PointsMaterial({size:.12,vertexColors:true,transparent:true,opacity:.9,depthWrite:false});const points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);
 const contacts=new SkyContactCursor(),enemies=new Map<number,number>(),resources=new Map<number,number>();let cursor=0;
 const burst=(x:number,y:number,z:number,r:number,g:number,b:number)=>{for(let j=0;j<12;j++){const i=cursor++%count,k=i*3;positions[k]=x;positions[k+1]=y;positions[k+2]=z;colors[k]=r;colors[k+1]=g;colors[k+2]=b;velocity[k]=Math.sin(j*2.4)*2;velocity[k+1]=1.2+j*.12;velocity[k+2]=Math.cos(j*2.4)*2;life[i]=.5;}};
 positions.fill(-10000);
 return {
 setReducedMotion(value:boolean){points.visible=!value;},
 update(s:Snapshot){for(const event of contacts.take(s.adventure.skybound?.contactEvents,s.tick)){const p=event.position;if(Math.hypot(p.x-s.player.x,p.y-s.player.y,p.z-s.player.z)<40){const color=event.kind==='explosion'?[1,.45,.12]:event.material==='metal'?[.55,.8,1]:[.75,.65,.5];burst(p.x,p.y,p.z,color[0],color[1],color[2]);}}for(const e of s.adventure.enemies){const before=enemies.get(e.id);if(before!==undefined&&e.health<before)burst(e.x,e.y+1,e.z,1,.76,.38);enemies.set(e.id,e.health);}
 for(const n of s.adventure.resources){const before=resources.get(n.id);if(before!==undefined&&n.ready>before)burst(n.x,n.y+1,n.z,.65,.83,.46);resources.set(n.id,n.ready);}
 if(enemies.size>200)for(const id of enemies.keys())if(!s.adventure.enemies.some(e=>e.id===id))enemies.delete(id);
 if(resources.size>500)for(const id of resources.keys())if(!s.adventure.resources.some(e=>e.id===id))resources.delete(id);
 },animate(dt:number){for(let i=0;i<count;i++){const k=i*3;if(life[i]>0){life[i]-=dt;velocity[k+1]-=7*dt;for(let a=0;a<3;a++)positions[k+a]+=velocity[k+a]*dt;}else positions[k+1]=-10000;}
 geometry.getAttribute('position').needsUpdate=true;geometry.getAttribute('color').needsUpdate=true;},dispose(){scene.remove(points);geometry.dispose();material.dispose();}};
}
