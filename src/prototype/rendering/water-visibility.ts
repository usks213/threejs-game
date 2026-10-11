import * as THREE from 'three';
import type {Vec3} from '../core/voxel';

type Graphics='balanced'|'high'|'performance';
interface RayField {ray(origin:Vec3,direction:Vec3,range:number):{distance:number}|null}
/** Bounded visibility evidence shared by both water-capable presets. */
export class WaterVisibilityProbe {
 private elapsed=0;private mode:Graphics|null=null;
 private readonly frustum=new THREE.Frustum();private readonly projection=new THREE.Matrix4();private readonly point=new THREE.Vector3();
 constructor(private readonly camera:THREE.PerspectiveCamera,private readonly field:RayField,private readonly water:THREE.Object3D,private readonly surface:(x:number,z:number)=>number){}
 update(dt:number,mode:Graphics){
  const changed=mode!==this.mode;this.mode=mode;
  if(mode==='performance'){this.elapsed=0;this.water.userData.reflectionVisible=false;return;}
  this.elapsed+=Number.isFinite(dt)&&dt>0?dt:0;if(!changed&&this.elapsed<.2)return;this.elapsed=0;
  this.water.userData.reflectionVisible=false;if(!this.water.visible)return;
  this.camera.updateMatrixWorld();this.projection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projection);
  for(const x of [4.25,5.5,7.25,9.5])for(const z of [-4.75,-2,.75]){
   const h=this.surface(x,z);if(!Number.isFinite(h))continue;const point=this.point.set(x,h+.015,z);if(!this.frustum.containsPoint(point))continue;
   const origin=this.camera.position,delta={x:x-origin.x,y:point.y-origin.y,z:z-origin.z},distance=Math.hypot(delta.x,delta.y,delta.z),hit=this.field.ray(origin,delta,distance);
   if(!hit||hit.distance>distance-.04){this.water.userData.reflectionVisible=true;return;}
  }
 }
}
