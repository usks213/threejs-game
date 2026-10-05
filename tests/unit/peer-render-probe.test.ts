import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {createPeerRenderProbe,type PeerRenderSample} from '../../src/rendering/scene/peer-render-probe';

function fixture(supported=true){
 let available=false,visible=false,target:unknown=null;
 const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,ANY_SAMPLES_PASSED:3,createQuery:vi.fn(()=>({})),getQueryParameter:vi.fn((_q:unknown,name:number)=>name===1?available:visible),deleteQuery:vi.fn(),beginQuery:vi.fn(),endQuery:vi.fn(),isContextLost:()=>false};
 const canvas=new EventTarget() as EventTarget&{dataset:Record<string,string>};canvas.dataset={};
 const render=vi.fn();const renderer={getContext:()=>supported?gl:{...gl,createQuery:undefined},getRenderTarget:()=>target,domElement:canvas,renderBufferDirect:render,state:{buffers:{depth:{setMask:vi.fn()},color:{setMask:vi.fn()}}}} as unknown as THREE.WebGLRenderer;
 const group=new THREE.Group(),chest=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();group.add(chest);scene.add(group);group.position.set(1,2,-5);group.rotation.y=.7;scene.updateMatrixWorld(true);camera.updateMatrixWorld();
 const probe=createPeerRenderProbe(renderer,scene);
 const draw=()=>{chest.onAfterRender(renderer,scene,camera,chest.geometry,chest.material,group);scene.onAfterRender(renderer,scene,camera,chest.geometry,chest.material,group);};
 probe.observe('peer',group,()=>17);
 return {probe,renderer,gl,group,draw,render,samples:()=>JSON.parse(renderer.domElement.dataset.renderedPeers??'[]') as PeerRenderSample[],result:(value:boolean)=>{available=true;visible=value;},offscreen:()=>{target={};}};
}
it('records only completed GPU visibility results with the actual interpolated pose',()=>{
 const f=fixture();expect(f.samples()).toEqual([]);f.draw();expect(f.samples()).toEqual([]);expect(f.gl.beginQuery).toHaveBeenCalledTimes(1);expect(f.gl.endQuery).toHaveBeenCalledTimes(1);expect(f.render.mock.calls[0][3]).toMatchObject({colorWrite:false,depthWrite:false,depthTest:true});
 f.group.position.x=9;f.draw();expect(f.gl.beginQuery).toHaveBeenCalledTimes(1);f.result(true);f.draw();expect(f.samples()).toMatchObject([{id:'peer',tick:17,x:1,y:2,z:-5,heading:.7,visible:true}]);expect(f.gl.deleteQuery).toHaveBeenCalledTimes(1);f.probe.dispose();expect(f.gl.deleteQuery).toHaveBeenCalledTimes(2);expect(f.renderer.domElement.dataset.renderedPeers).toBeUndefined();
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
