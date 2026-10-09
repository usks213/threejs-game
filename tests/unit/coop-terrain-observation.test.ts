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
import {stepDrops} from '../../src/game/interaction/drops';

const recordedExcavations=[
 {name:'37393247103 host attempts',creator:{x:6.806666666666648,y:1.6499790127139884,z:8},edit:{x:7.406450722044865,y:1.5144888743166636,z:5.828685949267576},poses:[{x:7.695847920573666,y:-.04126616785846,z:5.281523820655183},{x:7.695848002765097,y:-.11727615443932775,z:5.508190453502011}]},
 {name:'37396450818 public stone-pickup obstruction',creator:{x:6.693333333333316,y:1.6402458236646402,z:8},edit:{x:7.293273457064443,y:1.5047378019129827,z:5.828644074643427},poses:[{x:7.692486563350911,y:-.021052941333357885,z:5.2826668097728815}]},
];
it.each(recordedExcavations)('finds a low-floor view without ignoring settled debris or pickups: $name',({creator,edit,poses})=>{
 // Source-level reproductions of the recorded poses, not browser passes.
 const sim=new GameSimulation();Object.assign(sim.player,creator);sim.act('dig',edit);expect(sim.bodies).toHaveLength(20);
 // Both the fragments AND the loot settle with production rules. Leaving the
 // drop at its creation height misses the later stone-pickup ray obstruction.
 for(let tick=0;tick<600;tick++){
  for(const body of sim.bodies)stepSphere(body,sim.world,1/30);
  for(let pass=0;pass<2;pass++){collideRocks(sim.bodies);for(const body of sim.bodies)stepSphere(body,sim.world,0);}
  stepDrops(sim.adventure,1/30);
 }
 const terrain=createFieldTerrain(new THREE.Scene()),state=sim.adventure.snapshot();
 try{
  for(let x=0;x<=8;x+=8)for(let y=-8;y<=0;y+=8)for(let z=0;z<=8;z+=8)terrain.update(sampleFieldBrick(sim.world,{id:`${x}:${y}:${z}`,origin:{x,y,z},step:.5}).field!);
  const view=(player:THREE.Vector3,yaw:number,pitch=1.2)=>{
   const camera=new THREE.PerspectiveCamera(55,16/9,.1,110),focus=new THREE.Vector3(),backward=new THREE.Vector3(),obstruction=new THREE.Raycaster();
   orbitPose(player,yaw,pitch,focus,backward,camera.up);
   const boom=createCameraBoom((origin,direction,limit)=>{obstruction.set(origin,direction);obstruction.far=limit;return objectOcclusion(state,origin,direction,terrain.raycast(obstruction)?.distance??limit);});
   boom(player,focus,backward,camera.up,5,1/30,camera.position);camera.lookAt(camera.position.clone().sub(backward));camera.updateMatrixWorld();
   const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(),camera);ray.far=32;const hit=terrain.raycast(ray)!;
   expect(hit).toBeDefined();const interaction=interactionTarget(state,player,ray.ray.origin,ray.ray.direction,hit.distance);
   const distance=reticleObjectDistance(state,ray.ray.origin,ray.ray.direction,Math.min(hit.distance,interaction?.distance??32),sim.bodies);
   return {hit,distance,interaction,blocked:hit.distance>distance+.06,reticle:ray.ray.at(distance,new THREE.Vector3())};
  };
  for(const pose of poses){
   const player=new THREE.Vector3().copy(pose),blocked=view(player,0);expect(blocked.blocked).toBe(true);expect(blocked.reticle.y).toBeGreaterThan(3);
   const loot=view(player,3.12);expect(loot.blocked).toBe(true);expect(loot.interaction?.label).toBe('石 ×5を拾う');
   const candidates=[1.2,1.44].flatMap(pitch=>[0,3.12,2.34,3.9,1.56,4.68,.78,5.46].map(yaw=>({yaw,pitch})));expect(candidates).toHaveLength(16);
   const clear=candidates.map(({yaw,pitch})=>view(player,yaw,pitch)).find(result=>!result.blocked&&result.hit.point.y<edit.y-.3&&Math.hypot(result.hit.point.x-edit.x,result.hit.point.z-edit.z)<2.3)!;
   expect(clear).toBeDefined();expect(clear.blocked).toBe(false);expect(clear.distance).toBe(clear.hit.distance);
   expect(clear.hit.point.y).toBeLessThan(edit.y-.3);expect(Math.hypot(clear.hit.point.x-edit.x,clear.hit.point.z-edit.z)).toBeLessThan(2.3);
   expect(clear.hit.point.distanceTo(player.clone().add(new THREE.Vector3(0,.7,0)))).toBeLessThan(7);
  }
 }finally{terrain.dispose();}
});
