import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {createVolumeScenePipeline} from '../../src/rendering/volumetrics/scene-pipeline';
function setup(hdr=true){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(70,1,.035,55);camera.position.set(0,2,6);camera.updateMatrixWorld();const background=new THREE.Color('#182c34');scene.background=background;scene.fog=new THREE.Fog('#182c34',10,30);
 const targets:Array<THREE.WebGLRenderTarget|null>=[],draws:{target:THREE.WebGLRenderTarget|null;mask:number}[]=[];let current:THREE.WebGLRenderTarget|null=null;
 const renderer={extensions:{has:vi.fn(()=>hdr)},autoClear:true,shadowMap:{enabled:false},setRenderTarget:vi.fn((target:THREE.WebGLRenderTarget|null)=>{current=target;targets.push(target);}),render:vi.fn((_scene:THREE.Object3D,view:THREE.Camera)=>{draws.push({target:current,mask:view.layers.mask});})} as unknown as THREE.WebGLRenderer;
 return {scene,camera,renderer,background,targets,draws};
}
it('renders opaque once, supplies detached buffers to water, then restores layer/clear/background state',()=>{
 const h=setup(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),setSceneBuffers=vi.fn();h.scene.add(mesh);
 const p=createVolumeScenePipeline(h.renderer,h.scene,h.camera,{density:.01,ambient:new THREE.Color(),direction:new THREE.Vector3(0,1,0),points:[],groundHeight:0},[],{mesh,setSceneBuffers});p.resize(844,390);p.render();
 expect(h.draws).toHaveLength(7);expect(h.draws[0].mask).toBe(1);expect(h.draws[2].mask).toBe(2);const source=setSceneBuffers.mock.calls[0];expect(source[0]).toBe(h.draws[0].target!.texture);expect(source[1]).toBe(h.draws[0].target!.depthTexture);expect(h.draws[2].target).not.toBe(h.draws[0].target);expect(source[3].toArray()).toEqual([844,390]);expect(h.camera.layers.mask).toBe(1);expect(h.scene.background).toBe(h.background);expect(h.renderer.autoClear).toBe(true);expect(h.targets.at(-1)).toBeNull();expect(p.stats.hdr).toBe(true);p.dispose();p.dispose();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
});
it('uses renderable byte targets without float extension and does not enable HDR-only high passes',()=>{
 const h=setup(false),p=createVolumeScenePipeline(h.renderer,h.scene,h.camera,{density:.01,ambient:new THREE.Color(),direction:new THREE.Vector3(0,1,0),points:[],groundHeight:0},[],undefined,true);p.resize(400,200);p.render();expect(p.stats).toMatchObject({hdr:false,bloom:false});for(const target of h.targets)if(target)expect(target.texture.type).toBe(THREE.UnsignedByteType);p.dispose();
});
it('restores caller state after draw failure and prevents subsequent disposed rendering',()=>{
 const h=setup(),fog=h.scene.fog,p=createVolumeScenePipeline(h.renderer,h.scene,h.camera,{density:.01,ambient:new THREE.Color(),direction:new THREE.Vector3(0,1,0),points:[],groundHeight:0},[]);h.camera.layers.mask=5;vi.mocked(h.renderer.render).mockImplementationOnce(()=>{throw Error('draw failed');});expect(()=>p.render()).toThrow('draw failed');expect(h.camera.layers.mask).toBe(5);expect(h.scene.fog).toBe(fog);expect(h.scene.background).toBe(h.background);expect(h.renderer.autoClear).toBe(true);expect(h.targets.at(-1)).toBeNull();p.dispose();const calls=vi.mocked(h.renderer.render).mock.calls.length;p.render();expect(h.renderer.render).toHaveBeenCalledTimes(calls);
});
