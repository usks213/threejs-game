import {expect,it} from 'vitest';
import * as THREE from 'three';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {orbitPose,createCameraBoom} from '../../src/rendering/camera/follow';
import {reticleObjectDistance} from '../../src/rendering/camera/aim';
import {interactionTarget} from '../../src/game/interaction/target';
import {objectOcclusion} from '../../src/game/voxel/occlusion';
import {createFieldTerrain} from '../../src/rendering/voxel/field-terrain';
import {sampleFieldBrick} from '../../src/world/field-data';
import {stepSphere} from '../../src/physics/sphere';
import {collideRocks} from '../../src/physics/contacts';

it('keeps real excavation debris opaque while an opposite camera view reaches the lowered field surface',()=>{
 // Source-level reproduction of CI37393247103, not a browser rendering pass.
 const sim=new GameSimulation(),edit={x:7.406450722044865,y:1.5144888743166636,z:5.828685949267576};
 Object.assign(sim.player,{x:6.806666666666648,y:1.6499790127139884,z:8});sim.act('dig',edit);expect(sim.bodies).toHaveLength(20);
 // Settle the generated fragments with the production sphere/contact rules.
 for(let tick=0;tick<600;tick++){
  for(const body of sim.bodies)stepSphere(body,sim.world,1/30);
  for(let pass=0;pass<2;pass++){collideRocks(sim.bodies);for(const body of sim.bodies)stepSphere(body,sim.world,0);}
 }
 const terrain=createFieldTerrain(new THREE.Scene()),state=sim.adventure.snapshot();
 try{
  for(let x=0;x<=8;x+=8)for(let y=-8;y<=0;y+=8)for(let z=0;z<=8;z+=8)terrain.update(sampleFieldBrick(sim.world,{id:`${x}:${y}:${z}`,origin:{x,y,z},step:.5}).field!);
  const view=(player:THREE.Vector3,yaw:number)=>{
   const camera=new THREE.PerspectiveCamera(55,16/9,.1,110),focus=new THREE.Vector3(),backward=new THREE.Vector3(),obstruction=new THREE.Raycaster();
   orbitPose(player,yaw,1.2,focus,backward,camera.up);
   const boom=createCameraBoom((origin,direction,limit)=>{obstruction.set(origin,direction);obstruction.far=limit;return objectOcclusion(state,origin,direction,terrain.raycast(obstruction)?.distance??limit);});
   boom(player,focus,backward,camera.up,5,1/30,camera.position);camera.lookAt(camera.position.clone().sub(backward));camera.updateMatrixWorld();
   const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(),camera);ray.far=32;const hit=terrain.raycast(ray)!;
   expect(hit).toBeDefined();const interaction=interactionTarget(state,player,ray.ray.origin,ray.ray.direction,hit.distance);
   const distance=reticleObjectDistance(state,ray.ray.origin,ray.ray.direction,Math.min(hit.distance,interaction?.distance??32),sim.bodies);
   return {hit,distance,blocked:hit.distance>distance+.06,reticle:ray.ray.at(distance,new THREE.Vector3())};
  };
  for(const pose of [{x:7.695847920573666,y:-.04126616785846,z:5.281523820655183},{x:7.695848002765097,y:-.11727615443932775,z:5.508190453502011}]){
   const player=new THREE.Vector3().copy(pose),blocked=view(player,0);expect(blocked.blocked).toBe(true);expect(blocked.reticle.y).toBeGreaterThan(3);
   const clear=view(player,3.12);expect(clear.blocked).toBe(false);expect(clear.distance).toBe(clear.hit.distance);
   expect(clear.hit.point.y).toBeLessThan(edit.y-.3);expect(Math.hypot(clear.hit.point.x-edit.x,clear.hit.point.z-edit.z)).toBeLessThan(2.3);
   expect(clear.hit.point.distanceTo(player.clone().add(new THREE.Vector3(0,.7,0)))).toBeLessThan(7);
  }
 }finally{terrain.dispose();}
});
