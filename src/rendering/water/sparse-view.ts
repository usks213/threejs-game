import {WaterRipples} from './water-ripples';
import type {FluidCell} from '../../fluid/fluid';
import {waterHeight} from './sparse-field';
import * as THREE from 'three';
import {WATER_SDF_RANGE,type SparseWaterField} from './sparse-field';
import {waterVolumeVertex,waterVolumeFragment} from './sparse-shaders';
/** Latest-only worker credit bounds CPU work and memory when snapshots arrive faster than rendering. */
export function createSparseWaterView(){
 const scene=new THREE.Scene(),texture=new THREE.Data3DTexture(new Uint8Array([255]),1,1,1);texture.format=THREE.RedFormat;texture.type=THREE.UnsignedByteType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
 const lookup=new THREE.DataTexture(new Uint32Array(256*4),256,1,THREE.RGBAIntegerFormat,THREE.UnsignedIntType);lookup.internalFormat='RGBA32UI';lookup.needsUpdate=true;
 const ripples=new WaterRipples(64,64,.5),rippleTexture=new THREE.DataTexture(ripples.encoded,64,64,THREE.RedFormat,THREE.UnsignedByteType);rippleTexture.minFilter=rippleTexture.magFilter=THREE.LinearFilter;rippleTexture.needsUpdate=true;let interactionX=Infinity,interactionZ=Infinity;
 const uniforms={sdf:{value:texture},ripples:{value:rippleTexture},rippleAmplitude:{value:ripples.maxHeight},basinMin:{value:new THREE.Vector3(-16,0,-16)},basinSize:{value:new THREE.Vector3(32,0,32)},brickLookup:{value:lookup},lookupMask:{value:255},opaqueColor:{value:null as THREE.Texture|null},opaqueDepth:{value:null as THREE.Texture|null},inverseViewProjection:{value:new THREE.Matrix4()},viewProjection:{value:new THREE.Matrix4()},eye:{value:new THREE.Vector3()},fieldSpacing:{value:new THREE.Vector3(.5,.25,.5)},fieldDimensions:{value:new THREE.Vector3(1,1,1)},viewport:{value:new THREE.Vector2(1,1)},distanceRange:{value:WATER_SDF_RANGE},time:{value:0},buffersReady:{value:0}};
 const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:waterVolumeVertex,fragmentShader:waterVolumeFragment,uniforms,side:THREE.BackSide,depthWrite:true,depthTest:true,toneMapped:false});
 const geometry=new THREE.BoxGeometry(3.1,3.1,3.1);let capacity=64,mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
 const matrix=new THREE.Matrix4();let ready:SparseWaterField|null=null,disposed=false;
 const stats={sdfBuilds:0,sdfBricks:0,sdfBytes:0,sdfBuildMs:0,sdfCells:0,sdfError:'',waterTraceSteps:96,sdfRevision:-1,rippleImpulses:0,rippleSteps:0};
 return {scene,get stats(){return {...stats,sdfPending:Number(!!ready)};},
  interact(x:number,y:number,z:number,cells:readonly FluidCell[]){
   if(disposed)return;const origin=uniforms.basinMin.value;if(x<origin.x+4||x>origin.x+28||z<origin.z+4||z>origin.z+28){origin.set(Math.floor(x/8)*8-16,0,Math.floor(z/8)*8-16);ripples.height.fill(0);ripples.velocity.fill(0);}
   if(Math.hypot(x-interactionX,z-interactionZ)<.06)return;interactionX=x;interactionZ=z;
   const wet=cells.some(c=>!c.frozen&&x>=c.x&&x<=c.x+(c.size??1)&&z>=c.z&&z<=c.z+(c.size??1)&&Math.abs(y-(c.y+(c.bottom??0)+waterHeight(c)))<.6);
   if(wet){ripples.impulse((x-origin.x)/.5,(z-origin.z)/.5,.1,2.8);stats.rippleImpulses++;}
  },
  apply(field:SparseWaterField,revision:number){if(disposed)return;ready=field;stats.sdfRevision=revision;},
  reset(){ready=null;ripples.height.fill(0);ripples.velocity.fill(0);interactionX=interactionZ=Infinity;mesh.count=0;stats.sdfError='';},
  render(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera,color:THREE.Texture,depth:THREE.Texture,target:THREE.WebGLRenderTarget,dt:number){
   if(disposed)return;if(ready){const f=ready;ready=null;if(f.bricks.length>capacity){capacity=Math.max(f.bricks.length,capacity*2);scene.remove(mesh);mesh.dispose();mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.frustumCulled=false;scene.add(mesh);}mesh.count=f.bricks.length;f.bricks.forEach((b,i)=>{matrix.makeTranslation(b.x+1.5,b.y+1.5,b.z+1.5);mesh.setMatrixAt(i,matrix);});mesh.instanceMatrix.needsUpdate=true;
    // Data3DTexture dimensions are immutable after first use; disposal invalidates storage before resizing.
    lookup.dispose();lookup.image={data:f.lookup,width:f.lookupWidth,height:f.lookup.length/4/f.lookupWidth};lookup.needsUpdate=true;uniforms.lookupMask.value=f.lookupMask;texture.dispose();texture.image={data:f.encoded,width:f.dimensions[0],height:f.dimensions[1],depth:f.dimensions[2]};texture.needsUpdate=true;uniforms.fieldDimensions.value.set(...f.dimensions);Object.assign(stats,{sdfBuilds:stats.sdfBuilds+1,sdfBricks:f.bricks.length,sdfBytes:f.encoded.byteLength+f.lookup.byteLength,sdfBuildMs:f.milliseconds,sdfCells:f.cells});
   }
   if(!mesh.count)return;const steps=ripples.update(dt);stats.rippleSteps+=steps;if(steps)rippleTexture.needsUpdate=true;camera.updateMatrixWorld();uniforms.opaqueColor.value=color;uniforms.opaqueDepth.value=depth;uniforms.viewport.value.set(target.width,target.height);uniforms.viewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);uniforms.inverseViewProjection.value.copy(uniforms.viewProjection.value).invert();uniforms.eye.value.copy(camera.position);uniforms.time.value+=Math.max(0,Math.min(.1,dt));uniforms.buffersReady.value=1;
   const autoClear=renderer.autoClear;renderer.autoClear=false;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.autoClear=autoClear;
  },
  dispose(){disposed=true;ready=null;mesh.dispose();geometry.dispose();material.dispose();texture.dispose();lookup.dispose();rippleTexture.dispose();},
 };
}
