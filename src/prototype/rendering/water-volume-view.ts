import * as THREE from 'three';
import type {VoxelWater} from '../core/water';
import {WaterDistanceField} from './water-distance-field';
import {WaterRipples} from './water-ripples';
import {WaterCoastField} from './water-coast-field';
import {waterVolumeVertex,waterVolumeFragment} from './water-volume-shaders';

/** Paper-inspired surface-brick view for the fixed simulation basin.
 * Caller supplies a distinct opaque color/depth target, never the target currently
 * being drawn. Render after opaque beauty; the fragment writes traced hit depth.
 * Owns all of its GPU resources; never modifies authoritative water state. */
export function createWaterVolumeView(water:VoxelWater,camera:THREE.PerspectiveCamera,now=()=>performance.now()){
 const field=new WaterDistanceField(water),coast=new WaterCoastField(water),ripples=new WaterRipples(water.nx,water.nz,water.size);
 const displayed=field.encoded.slice(),transitionFrom=field.encoded.slice(),lastVolume=water.volume.slice(),lastBlocked=water.blocked.slice();
 const texture=new THREE.Data3DTexture(displayed,field.nx,field.ny,field.nz);texture.format=THREE.RedFormat;texture.type=THREE.UnsignedByteType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.unpackAlignment=1;texture.needsUpdate=true;
 const rippleTexture=new THREE.DataTexture(ripples.encoded,water.nx,water.nz,THREE.RedFormat,THREE.UnsignedByteType);rippleTexture.minFilter=rippleTexture.magFilter=THREE.LinearFilter;rippleTexture.needsUpdate=true;
 const coastTexture=new THREE.DataTexture(coast.encoded,water.nx,water.nz,THREE.RGBAFormat,THREE.UnsignedByteType);coastTexture.minFilter=coastTexture.magFilter=THREE.LinearFilter;coastTexture.needsUpdate=true;
 const uniforms={coast:{value:coastTexture},sdf:{value:texture},ripples:{value:rippleTexture},opaqueColor:{value:null as THREE.Texture|null},opaqueDepth:{value:null as THREE.Texture|null},inverseViewProjection:{value:new THREE.Matrix4()},viewProjection:{value:new THREE.Matrix4()},eye:{value:new THREE.Vector3()},fieldOrigin:{value:new THREE.Vector3(field.origin.x,field.origin.y,field.origin.z)},fieldSpacing:{value:new THREE.Vector3(field.spacing.x,field.spacing.y,field.spacing.z)},fieldDimensions:{value:new THREE.Vector3(field.nx,field.ny,field.nz)},basinMin:{value:new THREE.Vector3(water.origin.x,water.origin.y,water.origin.z)},basinSize:{value:new THREE.Vector3(water.nx*water.size,water.ny*water.size,water.nz*water.size)},viewport:{value:new THREE.Vector2(1,1)},distanceRange:{value:field.range},rippleAmplitude:{value:ripples.maxHeight},time:{value:0},buffersReady:{value:0}};
 const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:waterVolumeVertex,fragmentShader:waterVolumeFragment,uniforms,side:THREE.BackSide,depthWrite:true,depthTest:true,transparent:false,toneMapped:false});
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,Math.ceil(water.nx/6)*Math.ceil(water.ny/6)*Math.ceil(water.nz/6));mesh.name='water-sdf-surface-bricks';mesh.frustumCulled=false;mesh.renderOrder=5;
 const transform=new THREE.Matrix4(),bounds=new THREE.Box3(new THREE.Vector3(water.origin.x,water.origin.y,water.origin.z),new THREE.Vector3(water.origin.x+water.nx*water.size,water.origin.y+water.ny*water.size,water.origin.z+water.nz*water.size)),frustum=new THREE.Frustum(),projection=new THREE.Matrix4();bounds.expandByScalar(ripples.maxHeight+water.size*.5+.01);
 let transition=1,elapsed=0,revision=water.revision,solidRevision=water.solids.revision,wasVisible=false,disposed=false,interactionX=Infinity,interactionZ=Infinity;
 const stats={representation:'8-bit-sdf-bricks',builds:1,unchangedSkips:0,offscreenSkips:0,lastBuildMs:0,maxBuildMs:0,inView:false,sdfBytes:field.encoded.byteLength,rippleBytes:ripples.encoded.byteLength,coastBytes:coast.encoded.byteLength,bricks:0,wetCells:field.wetCells,faces:field.faces,maxTraceSteps:96,rippleSteps:0,rippleImpulses:0,temporalBlend:1};
 function updateBricks(){mesh.count=field.bricks.length;field.bricks.forEach((b,i)=>{const guard=ripples.maxHeight+water.size*.5+.01;transform.makeScale(b.nx+guard*2,b.ny+guard*2,b.nz+guard*2);transform.setPosition(b.x+b.nx/2,b.y+b.ny/2,b.z+b.nz/2);mesh.setMatrixAt(i,transform);});mesh.instanceMatrix.needsUpdate=true;stats.bricks=mesh.count;}
 updateBricks();
 return {mesh,get stats(){return {...stats};},
  setSceneBuffers(color:THREE.Texture,depth:THREE.Texture,viewCamera:THREE.PerspectiveCamera,viewport:THREE.Vector2){if(disposed)return;uniforms.opaqueColor.value=color;uniforms.opaqueDepth.value=depth;uniforms.viewport.value.copy(viewport);viewCamera.updateMatrixWorld();uniforms.viewProjection.value.multiplyMatrices(viewCamera.projectionMatrix,viewCamera.matrixWorldInverse);uniforms.inverseViewProjection.value.copy(uniforms.viewProjection.value).invert();uniforms.eye.value.copy(viewCamera.position);uniforms.buffersReady.value=1;},
  /** Position is explicit so camera movement is not mistaken for body motion. */
  interact(x:number,y:number,z:number){if(disposed||!Number.isFinite(x+y+z))return;const surface=water.surface(x,z),moving=Math.hypot(x-interactionX,z-interactionZ)>.06;if(moving&&Number.isFinite(surface)&&Math.abs(y-surface)<.6){ripples.impulse((x-water.origin.x)/water.size,(z-water.origin.z)/water.size,.1,2.8);stats.rippleImpulses++;}interactionX=x;interactionZ=z;},
  update(dt:number){if(disposed)return;const delta=Number.isFinite(dt)&&dt>0?Math.min(dt,.1):0;uniforms.time.value+=delta;elapsed+=delta;
   camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);const visible=mesh.visible&&frustum.intersectsBox(bounds),reentered=visible&&!wasVisible;wasVisible=visible;stats.inView=visible;
   if(!visible){stats.offscreenSkips++;return;}
   const solidsChanged=solidRevision!==water.solids.revision;
   if(solidsChanged||(revision!==water.revision&&(elapsed>=.1||reentered))){
    const changed=water.volume.some((v,i)=>v!==lastVolume[i])||water.blocked.some((v,i)=>v!==lastBlocked[i]);
    if(!changed){stats.unchangedSkips++;revision=water.revision;solidRevision=water.solids.revision;elapsed=0;}
    else{lastVolume.set(water.volume);lastBlocked.set(water.blocked);const start=now();transitionFrom.set(displayed);field.rebuild();coast.rebuild();coastTexture.needsUpdate=true;transition=0;updateBricks();stats.builds++;stats.lastBuildMs=Math.max(0,now()-start);stats.maxBuildMs=Math.max(stats.maxBuildMs,stats.lastBuildMs);stats.wetCells=field.wetCells;stats.faces=field.faces;revision=water.revision;solidRevision=water.solids.revision;elapsed=0;
    // Actual downward transfers drive waterfall disturbances, with a fixed cap.
    let injected=0;for(let z=1;z<water.nz-1&&injected<12;z+=3)for(let x=1;x<water.nx-1&&injected<12;x+=3)for(let y=1;y<water.ny;y++)if(water.downwardTransfer(x,y,z)>water.size**3*.1){ripples.impulse(x,z,.06,2);injected++;break;}stats.rippleImpulses+=injected;
    }
   }
   if(transition<1){transition=Math.min(1,transition+delta/.12);for(let i=0;i<displayed.length;i++)displayed[i]=Math.round(transitionFrom[i]+(field.encoded[i]-transitionFrom[i])*transition);texture.needsUpdate=true;stats.temporalBlend=transition;}
   const steps=ripples.update(delta);stats.rippleSteps+=steps;if(steps)rippleTexture.needsUpdate=true;
  },
  dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();mesh.geometry.dispose();material.dispose();texture.dispose();rippleTexture.dispose();coastTexture.dispose();mesh.dispose();},
 };
}
