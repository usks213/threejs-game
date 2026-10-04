import * as THREE from 'three';
/** Solid-angle weighted projection of a linear HDR WebGL cube into the 9 real SH coefficients. */
export function projectProbe(faces:readonly Uint16Array[],size:number){
 const sh=new THREE.SphericalHarmonics3(),direction=new THREE.Vector3(),basis=new Array<number>(9);let total=0;
 for(let face=0;face<6;face++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const col=(x+.5)*2/size-1,row=1-(y+.5)*2/size;
  if(face===0)direction.set(1,row,-col);else if(face===1)direction.set(-1,row,col);else if(face===2)direction.set(col,1,-row);else if(face===3)direction.set(col,-1,row);else if(face===4)direction.set(col,row,1);else direction.set(-col,row,-1);
  const square=direction.lengthSq(),weight=4/(Math.sqrt(square)*square),i=(y*size+x)*4,data=faces[face];total+=weight;direction.normalize();THREE.SphericalHarmonics3.getBasisAt(direction,basis);
  const r=THREE.DataUtils.fromHalfFloat(data[i]),g=THREE.DataUtils.fromHalfFloat(data[i+1]),b=THREE.DataUtils.fromHalfFloat(data[i+2]);
  for(let j=0;j<9;j++){const w=basis[j]*weight;sh.coefficients[j].x+=r*w;sh.coefficients[j].y+=g*w;sh.coefficients[j].z+=b*w;}
 }
 sh.scale(4*Math.PI/total);return new THREE.LightProbe(sh);
}
/** Queue all six GPU reads before yielding, avoiding six frames of serial fence waits. */
export async function captureProbe(renderer:THREE.WebGLRenderer,cube:THREE.WebGLCubeRenderTarget){
 const size=cube.width,faces=Array.from({length:6},()=>new Uint16Array(size*size*4));
 await Promise.all(faces.map((data,face)=>renderer.readRenderTargetPixelsAsync(cube,0,0,size,size,data,face)));
 return projectProbe(faces,size);
}
