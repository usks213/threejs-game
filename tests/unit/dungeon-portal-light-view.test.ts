import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import type {Snapshot} from '../../src/dungeon/types';

const h=vi.hoisted(()=>({scene:null as THREE.Scene|null}));
vi.mock('three',async importOriginal=>{
 const actual=await importOriginal<typeof import('three')>();
 return {...actual,WebGLRenderer:class {renderLists={dispose:vi.fn()};setPixelRatio(){}setSize(){}dispose(){}render(scene:THREE.Scene){h.scene=scene;}}};
});
vi.mock('../../src/dungeon/world-loader',()=>({DungeonWorldLoader:class {
 get ready(){return true;}get presentable(){return true;}request(){}show(){}rendered(){}dispose(){}clear(){}
}}));
import {createDungeonView} from '../../src/dungeon/view';

afterEach(()=>{vi.unstubAllGlobals();h.scene=null;});
const look={x:0,z:0,yaw:0,pitch:0,block:false,crouch:false};
function raid(){const sim=new DungeonSimulation(),p=sim.join('a'.repeat(64),'Tester')!;sim.command(p.actor.id,1,{kind:'ready'});sim.command(p.actor.id,2,{kind:'start'});return sim.snapshot(p.actor.id);}
function view(){vi.stubGlobal('devicePixelRatio',1);return createDungeonView(Object.assign(new EventTarget(),{dataset:{}}) as unknown as HTMLCanvasElement);}
function portal(snapshot:Snapshot,index:number){
 const position=snapshot.exits[index].position;
 const root=h.scene!.children.find(child=>child instanceof THREE.Group&&child.position.equals(new THREE.Vector3(position.x,position.y,position.z))&&child.children.some(part=>part instanceof THREE.PointLight))!;
 const light=root.children.find(part=>part instanceof THREE.PointLight) as THREE.PointLight;
 const ring=root.children.find(part=>part instanceof THREE.Mesh&&part.geometry instanceof THREE.TorusGeometry) as THREE.Mesh<THREE.TorusGeometry,THREE.MeshStandardMaterial>;
 return {root,light,ring};
}
function visiblePointLights(){let count=0;h.scene!.traverseVisible(node=>{if(node instanceof THREE.PointLight)count++;});return count;}

it('removes only zero-intensity light loops and preserves exact opening boundaries, portal surfaces and nonportal lights',()=>{
 const next=raid(),renderer=view();renderer.setSnapshot(next);renderer.render(.016,look);
 const west=portal(next,0),geometry=west.ring.geometry,closed=west.ring.material;
 expect(west.root.visible).toBe(true);expect(west.root.children).toHaveLength(3);expect(west.ring.visible).toBe(true);
 expect(west.root.position.toArray()).toEqual([-12,0,12]);
 expect(closed.color.getHexString()).toBe('506e76');expect(closed.emissive.getHexString()).toBe('23404c');expect(closed.emissiveIntensity).toBe(.2);
 expect(west.light).toMatchObject({visible:false,intensity:0,distance:5,decay:2});expect(west.light.color.getHexString()).toBe('60ffd8');expect(west.light.position.toArray()).toEqual([0,1.2,0]);
 expect(visiblePointLights()).toBe(9);
 for(const [elapsed,visible] of [[44.999,9],[45,10],[89.999,10],[90,11],[179.999,11],[180,12]]){
  next.elapsed=elapsed;const source=structuredClone(next);renderer.setSnapshot(next);renderer.render(.016,look);expect(next).toEqual(source);expect(visiblePointLights()).toBe(visible);
  for(let i=0;i<next.exits.length;i++){
   const p=portal(next,i),open=elapsed>=next.exits[i].opensAt;
   expect(p.light.visible).toBe(open);expect(p.light.intensity).toBe(open?10:0);expect(p.root.visible).toBe(true);
   expect(p.ring.material.emissiveIntensity).toBe(open?2.4:.2);
  }
  expect(portal(next,0).ring.geometry).toBe(geometry);
 }
 expect(west.ring.material.color.getHexString()).toBe('70d2cb');expect(west.ring.material.emissive.getHexString()).toBe('3ce7c4');
 renderer.dispose();expect(h.scene!.children).toHaveLength(0);
});

it('updates exhausted, future and reused exits from each snapshot without stale light visibility',()=>{
 const next=raid(),renderer=view();next.elapsed=200;renderer.setSnapshot(next);renderer.render(.016,look);
 const west=portal(next,0),geometry=west.ring.geometry;expect(visiblePointLights()).toBe(12);
 next.exits[0].remaining=1;renderer.setSnapshot(next);expect(west.light.visible).toBe(true);expect(west.light.intensity).toBe(10);expect(west.root.visible).toBe(true);expect(visiblePointLights()).toBe(12);
 next.exits[0].remaining=0;renderer.setSnapshot(next);expect(west.light.visible).toBe(false);expect(west.light.intensity).toBe(0);expect(west.root.visible).toBe(false);expect(visiblePointLights()).toBe(11);
 next.exits[0].remaining=1;next.exits[0].opensAt=240;renderer.setSnapshot(next);expect(west.root.visible).toBe(true);expect(west.light.visible).toBe(false);expect(west.ring.material.emissiveIntensity).toBe(.2);
 next.elapsed=240;renderer.setSnapshot(next);expect(west.light.visible).toBe(true);expect(west.light.intensity).toBe(10);expect(west.ring.geometry).toBe(geometry);
 const restarted={...raid(),raid:next.raid+1,seed:next.seed+7919};renderer.setSnapshot(restarted);expect(visiblePointLights()).toBe(9);expect(west.root.visible).toBe(true);expect(west.light.visible).toBe(false);
 renderer.resetWorld();renderer.setSnapshot({...restarted,elapsed:46});expect(visiblePointLights()).toBe(10);expect(west.ring.geometry).toBe(geometry);
 renderer.setSnapshot({...restarted,exits:[]});expect(west.root.parent).toBeNull();expect(visiblePointLights()).toBe(9);
 renderer.setSnapshot({...restarted,elapsed:46});renderer.render(.016,look);expect(visiblePointLights()).toBe(10);expect(portal(restarted,0).light.visible).toBe(true);
 renderer.dispose();
 // First snapshot after a page reload may already have open or exhausted exits.
 const reloaded=view();next.exits[0].remaining=0;reloaded.setSnapshot(next);reloaded.render(.016,look);
 expect(visiblePointLights()).toBe(11);expect(portal(next,0).root.visible).toBe(false);expect(portal(next,1).light.intensity).toBe(10);reloaded.dispose();
});
