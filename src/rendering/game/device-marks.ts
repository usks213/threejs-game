import * as THREE from 'three';
import {PART_HALF,type SkyPartKind,type SkyboundSnapshot} from '../../game/skybound/types';
/** Original 16px construction pictograms. One instanced face-mark draw for all device types. */
export const DEVICE_MARKS:readonly SkyPartKind[]=['wheel','thruster','sail','battery','switch','lamp','emitter','seat','storage','bed'];
export function deviceMarkTexture():THREE.DataTexture{
 const width=64,height=48,data=new Uint8Array(width*height*4);
 DEVICE_MARKS.forEach((kind,index)=>{const ox=index%4*16,oy=Math.floor(index/4)*16,pixel=(x:number,y:number)=>{if(x<0||x>15||y<0||y>15)return;const n=((oy+y)*width+ox+x)*4;data[n]=data[n+1]=data[n+2]=255;data[n+3]=230;},line=(x0:number,y0:number,x1:number,y1:number)=>{const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let i=0;i<=n;i++)pixel(Math.round(x0+(x1-x0)*i/Math.max(1,n)),Math.round(y0+(y1-y0)*i/Math.max(1,n)));},box=(x:number,y:number,w:number,h:number)=>{line(x,y,x+w,y);line(x,y+h,x+w,y+h);line(x,y,x,y+h);line(x+w,y,x+w,y+h);};
  if(kind==='wheel'){for(let y=1;y<15;y++)for(let x=1;x<15;x++){const r=Math.hypot(x-7.5,y-7.5);if(r>4.5&&r<6.5||r<1.7)pixel(x,y);}line(3,3,12,12);line(3,12,12,3);}
  if(kind==='thruster'){box(3,6,9,6);for(const x of[5,8,11]){line(x,2,x,5);pixel(x-1,3);}}
  if(kind==='sail'){line(4,2,4,13);line(4,13,12,4);line(12,4,4,4);line(2,2,13,2);}
  if(kind==='battery'){box(3,3,9,9);box(6,12,3,2);line(7,10,5,7);line(5,7,10,7);line(10,7,8,4);}
  if(kind==='switch'){box(2,2,11,4);line(7,6,10,12);box(9,11,3,2);}
  if(kind==='lamp'){box(4,4,7,7);line(6,2,9,2);for(const[x,y]of[[2,7],[13,7],[7,13]])pixel(x,y);}
  if(kind==='emitter'){box(5,2,5,7);for(const y of[10,12,14])line(8-(y-8)/2,y,8+(y-8)/2,y);}
  if(kind==='storage'){box(2,3,11,9);line(2,8,13,8);box(7,7,2,3);}
  if(kind==='bed'){box(2,4,11,5);box(3,6,3,2);line(2,2,2,11);line(13,2,13,9);}
  if(kind==='seat'){box(4,2,7,2);line(4,4,4,12);line(4,12,7,12);line(11,2,11,0);line(4,2,4,0);}
 });
 const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
export function createDeviceMarks(scene:THREE.Scene){
 const geometry=new THREE.PlaneGeometry(1,1),offsets=new THREE.InstancedBufferAttribute(new Float32Array(64*2),2);geometry.setAttribute('deviceGlyph',offsets);
 const texture=deviceMarkTexture(),material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,alphaTest:.15,polygonOffset:true,polygonOffsetFactor:-1});
 material.onBeforeCompile=shader=>{shader.vertexShader='attribute vec2 deviceGlyph;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=(vMapUv+deviceGlyph)/vec2(4.0,3.0);');};material.customProgramCacheKey=()=> 'original-device-marks-v2';
 const marks=new THREE.InstancedMesh(geometry,material,64);marks.count=0;marks.frustumCulled=false;scene.add(marks);const pose=new THREE.Object3D(),color=new THREE.Color(),offset=new THREE.Vector3();
 return {update(state:SkyboundSnapshot|undefined){let count=0;for(const part of state?.parts??[]){const index=DEVICE_MARKS.indexOf(part.kind);if(index<0||count>=64)continue;const half=PART_HALF[part.kind];pose.quaternion.set(part.q?.x??0,part.q?.y??Math.sin(part.rotation/2),part.q?.z??0,part.q?.w??Math.cos(part.rotation/2));offset.set(0,0,half.z+.003).applyQuaternion(pose.quaternion);pose.position.set(part.position.x+offset.x,part.position.y+offset.y,part.position.z+offset.z);pose.scale.set(half.x*1.6,half.y*1.6,1);pose.updateMatrix();marks.setMatrixAt(count,pose.matrix);offsets.setXY(count,index%4,Math.floor(index/4));color.set(part.powered?'#bcffe3':part.kind==='battery'?(part.energy??0)>0?'#e6ce80':'#687b7a':'#eee0bd');marks.setColorAt(count,color);count++;}marks.count=count;marks.instanceMatrix.needsUpdate=true;offsets.needsUpdate=true;if(marks.instanceColor)marks.instanceColor.needsUpdate=true;},dispose(){scene.remove(marks);geometry.dispose();material.dispose();texture.dispose();}};
}
