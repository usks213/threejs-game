import { interactionTarget } from '../../src/game/interaction/target';
import { expect,it } from 'vitest';
import * as THREE from 'three';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { journeyGoal } from '../../src/game/journey';
import { addPersonModel } from '../../src/rendering/game/person';
import { storyPerson } from '../../src/content/adventure-people';
import { voxelizePrimitive } from '../../src/rendering/voxel/primitive';
import { objectOcclusion } from '../../src/game/voxel/occlusion';
import { createCameraBoom,orbitPose } from '../../src/rendering/camera/follow';
import { DEFAULT_CAMERA_PITCH } from '../../src/input/touch/look';

it('guides the actual beacon loop without making optional practice a prerequisite',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot();
 for(let step=0;step<=5;step++){s.progressionView!.tutorial.step=step;expect(journeyGoal(s,sim.player)).toMatchObject({title:'木材で最初の灯をつなごう',tab:'bag'});}
 s.inventory.wood=4;expect(journeyGoal(s,sim.player)).toMatchObject({title:'木の梁を二つ作ろう',tab:'powers'});
 s.resources.find(n=>n.id===810001)!.ready=1e10;
 expect(journeyGoal(s,sim.player)).toMatchObject({title:'空へ続く斜路へ',target:{x:10,z:14}});
});

it('renders the practice dummy and guides without the camera-sized market stalls, preserving actual merchants',()=>{
 const shapes={box:new THREE.BoxGeometry(1,1,1),sphere:voxelizePrimitive(new THREE.IcosahedronGeometry(.5,0)),cone:voxelizePrimitive(new THREE.ConeGeometry(1,2.4,6))},material=new THREE.MeshBasicMaterial();
 const size=(id:number)=>{const group=new THREE.Group();addPersonModel(storyPerson(id),(shape,_color,x,y,z,sx,sy,sz)=>{const mesh=new THREE.Mesh(shapes[shape],material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);group.add(mesh);});return new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());};
 expect(size(857001).x).toBeLessThanOrEqual(1);expect(size(857001).y).toBeLessThan(1.6);
 expect(size(830001).x).toBeLessThan(1);expect(size(3000999).x).toBeGreaterThan(4);
 for(const shape of Object.values(shapes))shape.dispose();material.dispose();
});

it('retracts the real camera boom before occupied tree cells, and clears the unchanged arrival position',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot(),player=new THREE.Vector3(sim.player.x,sim.player.y,sim.player.z),focus=new THREE.Vector3(),back=new THREE.Vector3(),up=new THREE.Vector3(),position=new THREE.Vector3();
 const resolve=createCameraBoom((o,d,n)=>objectOcclusion(s,o,d,n));
 orbitPose(player,0,DEFAULT_CAMERA_PITCH,focus,back,up);expect(resolve(player,focus,back,up,5,.1,position)).toBeCloseTo(5);
 s.resources.push({id:3000998,kind:'beech',x:.25,y:player.y,z:10.5,amount:1,ready:0});
 orbitPose(player,0,DEFAULT_CAMERA_PITCH,focus,back,up);expect(resolve(player,focus,back,up,5,.1,position)).toBeLessThan(2.6);
 expect(position.z).toBeLessThan(10.5);
});

it('camera collision matches actual merchant booth poles but never invents a booth for a guide or dummy',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot();s.buildings=[];
 const person={id:3000999,kind:'merchant',x:0,y:0,z:3,amount:1,ready:0};s.resources=[person];
 const origin={x:2,y:1.4,z:0},direction={x:0,y:0,z:1};
 expect(objectOcclusion(s,origin,direction,5)).toBeCloseTo(2.95);
 person.id=857001;expect(objectOcclusion(s,origin,direction,5)).toBe(5);
 person.id=830001;expect(objectOcclusion(s,origin,direction,5)).toBe(5);
});

it('labels the compact rescue mannequin correctly and never opens a trading menu for it',()=>{
 const sim=new GameSimulation(),s=sim.adventure.snapshot(),dummy=s.resources.find(n=>n.id===857001)!;
 s.resources=[dummy];s.buildings=[];
 const player={x:dummy.x,y:dummy.y,z:dummy.z-2},origin={...player,y:player.y+1},direction={x:0,y:0,z:1};
 expect(interactionTarget(s,player,origin,direction)).toMatchObject({id:'r:857001',label:'練習人形を調べる',panel:undefined});
 s.progressionView!.tutorial.step=4;
 expect(interactionTarget(s,player,origin,direction)).toMatchObject({id:'r:857001',label:'練習人形を助ける',panel:undefined});
});
