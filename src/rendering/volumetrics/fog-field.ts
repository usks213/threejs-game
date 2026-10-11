import * as THREE from 'three';
import {boxDistance,type FogBox} from './medium';
/** Fog-interface distance and density are independent of the solid/collision SDF.
 * One bounded dense texture replaces the reference game's sparse 16^3 tile atlas.
 * Texel centers cover the bounds; noise only erodes support, never expands it. */
export class FogField {
 readonly dimensions=new THREE.Vector3(48,16,48);
 readonly size=new THREE.Vector3(72,24,72);
 readonly origin=new THREE.Vector3(Infinity,Infinity,Infinity);
 private readonly data=new Uint8Array(48*16*48*2);
 readonly texture=new THREE.Data3DTexture(this.data,48,16,48);
 private revision=0;
 constructor(private readonly boxes:readonly FogBox[]){
  this.texture.format=THREE.RGFormat;this.texture.type=THREE.UnsignedByteType;
  this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.texture.unpackAlignment=1;
 }
 update(eye:THREE.Vector3){
  const x=Math.floor(eye.x/6)*6-36,y=Math.floor(eye.y/6)*6-9,z=Math.floor(eye.z/6)*6-36;
  if(this.origin.x===x&&this.origin.y===y&&this.origin.z===z)return;
  this.origin.set(x,y,z);let i=0;
  for(let iz=0;iz<48;iz++)for(let iy=0;iy<16;iy++)for(let ix=0;ix<48;ix++){
   const px=x+(ix+.5)*1.5,py=y+(iy+.5)*1.5,pz=z+(iz+.5)*1.5;let distance=8,density=0;
   for(const box of this.boxes){const d=boxDistance(px,py,pz,box);distance=Math.min(distance,d);if(d<2) density=Math.max(density,box.density);}
   this.data[i++]=Math.round((Math.max(-8,Math.min(8,distance))+8)/16*255);
   this.data[i++]=Math.round(Math.min(1,density)*255);
  }
  this.texture.needsUpdate=true;this.revision++;
 }
 get stats(){return {fogFieldUpdates:this.revision,fogFieldVoxels:48*16*48,fogFieldBytes:this.data.byteLength};}
 dispose(){this.texture.dispose();}
}
