import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {createPeerRenderProbe,type PeerRenderSample} from '../../src/rendering/scene/peer-render-probe';

function fixture(supported=true){
 let available=false,visible=false,target:unknown=null;
 const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,ANY_SAMPLES_PASSED:3,createQuery:vi.fn(()=>({})),getQueryParameter:vi.fn((_q:unknown,name:number)=>name===1?available:visible),deleteQuery:vi.fn(),beginQuery:vi.fn(),endQuery:vi.fn(),isContextLost:()=>false};
 const canvas=new EventTarget() as EventTarget&{dataset:Record<string,string>};canvas.dataset={};
 const render=vi.fn();const renderer={getContext:()=>supported?gl:{...gl,createQuery:undefined},getRenderTarget:()=>target,domElement:canvas,autoClear:true,render,state:{buffers:{depth:{setMask:vi.fn()},color:{setMask:vi.fn()}}}} as unknown as THREE.WebGLRenderer;
 const group=new THREE.Group(),chest=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();group.add(chest);scene.add(group);group.position.set(1,2,-5);group.rotation.y=.7;scene.updateMatrixWorld(true);camera.updateMatrixWorld();
 const probe=createPeerRenderProbe(renderer,scene);
 const draw=()=>{chest.onAfterRender(renderer,scene,camera,chest.geometry,chest.material,group);scene.onAfterRender(renderer,scene,camera,chest.geometry,chest.material,group);};
 probe.observe('peer',group,()=>17);
 return {probe,renderer,gl,group,draw,render,samples:()=>JSON.parse(renderer.domElement.dataset.renderedPeers??'[]') as PeerRenderSample[],result:(value:boolean)=>{available=true;visible=value;},camera,offscreen:(value:unknown={})=>{target=value;}};
}
it('records only completed GPU visibility results with the actual interpolated pose',()=>{
 const f=fixture();expect(f.samples()).toEqual([]);f.draw();expect(f.samples()).toEqual([]);expect(f.gl.beginQuery).toHaveBeenCalledTimes(1);expect(f.gl.endQuery).toHaveBeenCalledTimes(1);expect(f.render.mock.calls[0][0].children[0].material).toMatchObject({colorWrite:false,depthWrite:false,depthTest:true});expect(f.renderer.autoClear).toBe(true);
 f.group.position.x=9;f.draw();expect(f.gl.beginQuery).toHaveBeenCalledTimes(2);f.result(true);f.draw();expect(f.samples()).toMatchObject([{id:'peer',tick:17,x:1,y:2,z:-5,heading:.7,visible:true},{id:'peer',tick:17,x:9,y:2,z:-5,heading:.7,visible:true}]);expect(f.gl.deleteQuery).toHaveBeenCalledTimes(2);f.probe.dispose();expect(f.gl.deleteQuery).toHaveBeenCalledTimes(3);expect(f.renderer.domElement.dataset.renderedPeers).toBeUndefined();
});
it('keeps an occluded draw negative and excludes offscreen render targets',()=>{
 const f=fixture();f.draw();f.result(false);f.draw();expect(f.samples()[0].visible).toBe(false);f.offscreen();f.draw();expect(f.gl.beginQuery).toHaveBeenCalledTimes(2);f.probe.remove('peer');expect(f.samples()).toEqual([]);f.draw();expect(f.gl.beginQuery).toHaveBeenCalledTimes(2);f.probe.dispose();
});
it('disposes queries and restores callbacks on context loss without claiming visibility',()=>{
 const f=fixture();f.draw();f.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));expect(f.gl.deleteQuery).toHaveBeenCalledTimes(1);expect(f.renderer.domElement.dataset.peerRenderError).toContain('context lost');expect(f.samples()).toEqual([]);f.draw();expect(f.gl.beginQuery).toHaveBeenCalledTimes(1);f.probe.dispose();expect(f.gl.deleteQuery).toHaveBeenCalledTimes(1);
});
it('reports unsupported queries explicitly instead of fabricating visible samples',()=>{
 const f=fixture(false);f.draw();expect(f.renderer.domElement.dataset.peerRenderError).toContain('unavailable');expect(f.samples()).toEqual([]);expect(f.render).not.toHaveBeenCalled();f.probe.dispose();
});

it('samples brief rendered airborne poses while older GPU queries remain pending, with a finite ring',()=>{
 const f=fixture();f.draw();f.group.position.y=3;f.draw();f.group.position.y=2;for(let i=0;i<10;i++)f.draw();
 expect(f.gl.beginQuery).toHaveBeenCalledTimes(8);expect(f.samples()).toEqual([]);expect(Number(f.renderer.domElement.dataset.peerRenderSkipped)).toBe(4);
 f.result(true);f.draw();expect(f.samples()).toHaveLength(8);expect(f.samples().some(sample=>sample.visible&&sample.y===3)).toBe(true);expect(f.gl.deleteQuery).toHaveBeenCalledTimes(8);f.probe.dispose();expect(f.gl.deleteQuery).toHaveBeenCalledTimes(9);
});

it('samples the actual HDR beauty pose only after the completed water-depth target, not proxy passes',()=>{
 const f=fixture(),beauty=new THREE.WebGLRenderTarget(),waterDepth=new THREE.WebGLRenderTarget(),unrelated=new THREE.WebGLRenderTarget();
 f.probe.beginFrame(beauty);f.offscreen(unrelated);f.draw();f.offscreen(waterDepth);f.probe.finishFrame(f.camera,waterDepth);expect(f.gl.beginQuery).toHaveBeenCalledTimes(0);
 f.probe.beginFrame(beauty);f.offscreen(beauty);f.draw();expect(f.gl.beginQuery).toHaveBeenCalledTimes(0);f.probe.finishFrame(f.camera,waterDepth);expect(f.gl.beginQuery).toHaveBeenCalledTimes(0);
 f.offscreen(waterDepth);f.probe.finishFrame(f.camera,waterDepth);expect(f.gl.beginQuery).toHaveBeenCalledTimes(1);expect(f.samples()).toEqual([]);
 f.result(true);f.probe.beginFrame(beauty);f.offscreen(beauty);f.draw();f.offscreen(waterDepth);f.probe.finishFrame(f.camera,waterDepth);expect(f.samples()).toMatchObject([{id:'peer',tick:17,x:1,y:2,z:-5,heading:.7,visible:true}]);
 f.probe.dispose();beauty.dispose();waterDepth.dispose();unrelated.dispose();
});

it('restores render clearing and reports failed queries without leaking them',()=>{
 const f=fixture();f.render.mockImplementationOnce(()=>{throw new Error('query failure');});f.draw();expect(f.renderer.autoClear).toBe(true);expect(f.gl.endQuery).toHaveBeenCalledTimes(1);expect(f.gl.deleteQuery).toHaveBeenCalledTimes(1);expect(f.renderer.domElement.dataset.peerRenderError).toContain('query failure');expect(f.samples()).toEqual([]);f.probe.dispose();
});
