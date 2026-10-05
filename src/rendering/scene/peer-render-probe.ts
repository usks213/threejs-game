import * as THREE from 'three';

export interface PeerRenderSample {
 id:string; tick:number; at:number; x:number; y:number; z:number; heading:number;
 screen:{x:number;y:number;z:number}; visible:boolean;
}
type DrawnSample={sample:Omit<PeerRenderSample,'visible'>;camera:THREE.Camera};
interface Entry {collect:()=>void;query:(camera:THREE.Camera)=>void;dispose:()=>void}

/** Opt-in GPU evidence: a real color draw, then a non-writing visibility query
 * against the completed canvas depth buffer. No game state or pixel is changed. */
export function createPeerRenderProbe(renderer:THREE.WebGLRenderer,scene:THREE.Scene) {
 const gl=renderer.getContext() as WebGL2RenderingContext,samples:PeerRenderSample[]=[],entries=new Map<string,Entry>();
 const publish=()=>{renderer.domElement.dataset.renderedPeers=JSON.stringify(samples);};
 const projected=new THREE.Vector3(),afterScene=scene.onAfterRender;
 const queryMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,depthTest:true,depthFunc:THREE.LessEqualDepth});
 let disposed=false;
 const supported=typeof gl.createQuery==='function'&&typeof gl.getQueryParameter==='function';
 if(!supported)renderer.domElement.dataset.peerRenderError='WebGL2 occlusion queries unavailable';
 const dispose=()=>{if(disposed)return;disposed=true;for(const entry of entries.values())entry.dispose();entries.clear();samples.length=0;queryMaterial.dispose();scene.onAfterRender=afterScene;delete renderer.domElement.dataset.renderedPeers;delete renderer.domElement.dataset.peerRenderSkipped;renderer.domElement.removeEventListener('webglcontextlost',lost);};
 const lost=()=>{dispose();renderer.domElement.dataset.peerRenderError='WebGL context lost before visibility verification';};
 renderer.domElement.addEventListener('webglcontextlost',lost,{once:true});
 scene.onAfterRender=function(...args){
  afterScene.apply(this,args);
  // Offscreen color, shadow, depth and reflection passes are not the display.
  if(disposed||!supported||renderer.getRenderTarget()!==null||scene.overrideMaterial||gl.isContextLost())return;
  for(const entry of entries.values()){entry.collect();entry.query(args[2]);}
 };
 return {
  observe(id:string,group:THREE.Group,tick:()=>number) {
   if(disposed||!supported||entries.has(id))return;
   // The first avatar mesh is its persistent torso; equipment can be hidden.
   let chest:THREE.Mesh|undefined;group.traverse(object=>{if(!chest&&object instanceof THREE.Mesh)chest=object;});
   if(!chest)return;
   const mesh=chest,after=mesh.onAfterRender;
   let drawn:DrawnSample|undefined;
   const pending:{query:WebGLQuery;sample:Omit<PeerRenderSample,'visible'>}[]=[];
   mesh.onAfterRender=function(...args){
    after.apply(this,args);
    if(renderer.getRenderTarget()!==null||args[1]!==scene||scene.overrideMaterial||gl.isContextLost())return;
    mesh.getWorldPosition(projected).project(args[2]);
    drawn={camera:args[2],sample:{id,tick:tick(),at:performance.now(),x:group.position.x,y:group.position.y,z:group.position.z,heading:group.rotation.y,screen:{x:projected.x,y:projected.y,z:projected.z}}};
   };
   entries.set(id,{
    collect(){
     let changed=false;
     while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
      const completed=pending.shift()!;samples.push({...completed.sample,visible:!!gl.getQueryParameter(completed.query,gl.QUERY_RESULT)});gl.deleteQuery(completed.query);changed=true;
     }
     if(samples.length>96)samples.splice(0,samples.length-96);if(changed)publish();
    },
    query(camera){
     const colorDraw=drawn;drawn=undefined;if(!colorDraw||colorDraw.camera!==camera)return;
     // GPU completion can lag frames. Preserve transient poses in a finite ring.
     if(pending.length>=8){renderer.domElement.dataset.peerRenderSkipped=String(Number(renderer.domElement.dataset.peerRenderSkipped??0)+1);return;}
     const query=gl.createQuery();if(!query){renderer.domElement.dataset.peerRenderError='GPU visibility query allocation failed';return;}
     const entry={query,sample:colorDraw.sample};pending.push(entry);let active=false,failed=false;
     try{
      gl.beginQuery(gl.ANY_SAMPLES_PASSED,query);active=true;
      // renderBufferDirect skips object callbacks, reuses the exact torso
      // geometry/world matrix, and writes neither color nor depth. Testing only
      // during its original draw could miss terrain painted later in that frame.
      renderer.renderBufferDirect(camera,scene,mesh.geometry,queryMaterial,mesh,null);
     }catch(error){renderer.domElement.dataset.peerRenderError=String(error);failed=true;}
     finally{if(active)gl.endQuery(gl.ANY_SAMPLES_PASSED);if(failed){gl.deleteQuery(query);pending.splice(pending.indexOf(entry),1);}renderer.state.buffers.depth.setMask(true);renderer.state.buffers.color.setMask(true);}
    },
    dispose(){for(const entry of pending)gl.deleteQuery(entry.query);pending.length=0;drawn=undefined;mesh.onAfterRender=after;},
   });
  },
  remove(id:string){entries.get(id)?.dispose();entries.delete(id);for(let i=samples.length-1;i>=0;i--)if(samples[i].id===id)samples.splice(i,1);publish();},
  dispose,
 };
}
