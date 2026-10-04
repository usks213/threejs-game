import * as THREE from 'three';
import { pbrMaterial } from '../materials/pbr';
/** Original pinnate fronds. One batch with a small, fixed near-camera budget. */
export function createFerns(scene:THREE.Scene){
 const vertices:number[]=[],uv:number[]=[];
 const triangle=(a:number[],b:number[],c:number[])=>{vertices.push(...a,...b,...c);uv.push(0,0,1,0,.5,1);};
 for(let frond=0;frond<5;frond++){
  const angle=frond*Math.PI*2/5,c=Math.cos(angle),s=Math.sin(angle);
  const point=(along:number,side:number)=>[c*along-s*side,Math.sin(along*2.2)*.42,s*along+c*side];
  for(let i=1;i<=5;i++){const r=i*.11,width=.17*(1-i/7),root=point(r,0),tip=point(r+.14,0);
   for(const side of [-1,1])triangle(root,point(r+.025,side*width),tip);
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
 const time={value:0},material=pbrMaterial('#73994c','foliage',{side:THREE.DoubleSide});material.onBeforeCompile=s=>{s.uniforms.fernTime=time;s.vertexShader='uniform float fernTime;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x+=sin(fernTime*1.3+instanceMatrix[3].x)*position.y*.08;');};
 const mesh=new THREE.InstancedMesh(geometry,material,120),dummy=new THREE.Object3D();mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;scene.add(mesh);let count=0;
 return {begin(){count=0;},add(x:number,y:number,z:number,seed:number){if(count>=120)return;dummy.position.set(x,y,z);dummy.rotation.y=seed*6.28;dummy.scale.setScalar(.75+seed*.7);dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);},end(){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;},animate(seconds:number){time.value=seconds;},dispose(){scene.remove(mesh);mesh.dispose();geometry.dispose();material.dispose();}};
}
