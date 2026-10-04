import { createFerns } from './ferns';
import { pbrMaterial } from '../materials/pbr';
import * as THREE from 'three';
import type { MeshData } from '../../world/types';
/** Attach sparse tufts to the actual meshed surface, including edited terrain. One draw call. */
export function createGrass(scene:THREE.Scene){
 const ferns=createFerns(scene);
 const samples=new Map<string,number[]>(),geometry=new THREE.BufferGeometry();
 const vertices:number[]=[];
 for(let i=0;i<5;i++){
  const a=i*2.4,c=Math.cos(a),s=Math.sin(a),h=.22+(i%3)*.055,w=.026;
  const root=[c*.055,0,s*.055],left=[root[0]-c*w,0,root[2]-s*w],right=[root[0]+c*w,0,root[2]+s*w];
  const ml=[root[0]+c*.025-c*w*.55,h*.55,root[2]+s*.025-s*w*.55],mr=[root[0]+c*.025+c*w*.55,h*.55,root[2]+s*.025+s*w*.55],tip=[root[0]+c*.08,h,root[2]+s*.08];
  vertices.push(...left,...right,...ml,...right,...mr,...ml,...ml,...mr,...tip);
 }
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();geometry.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap((v,i)=>i%3===0?[v*4,vertices[i+1]*3]:[]),2));
 const time={value:0},material=pbrMaterial('#ffffff','foliage',{side:THREE.DoubleSide});
 material.onBeforeCompile=s=>{s.uniforms.grassTime=time;s.vertexShader='uniform float grassTime;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec3 origin=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;transformed.x+=sin(origin.x*.8+origin.z*.6+grassTime*1.5)*position.y*position.y*.3;');};
 const mesh=new THREE.InstancedMesh(geometry,material,2200);mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;scene.add(mesh);
 const dummy=new THREE.Object3D(),color=new THREE.Color();let dirty=true,lastX=Infinity,lastZ=Infinity,last=0;
 return {
  set(data:MeshData){const points:number[]=[],seen=new Set<string>();
   for(let i=0;i<data.positions.length;i+=3){if(data.normals[i+1]<.82||data.colors[i+1]<data.colors[i]*1.07)continue;
    const x=data.positions[i],y=data.positions[i+1],z=data.positions[i+2],key=`${Math.floor(x*1.4)},${Math.floor(y)},${Math.floor(z*1.4)}`;
    if(seen.has(key))continue;seen.add(key);points.push(x,y-.035,z);
   }samples.set(data.id,points);dirty=true;
  },
  remove(id:string){samples.delete(id);dirty=true;},
  update(p:THREE.Vector3,seconds:number){time.value=seconds;ferns.animate(seconds);if(seconds-last<.3)return;last=seconds;if(!dirty&&Math.hypot(p.x-lastX,p.z-lastZ)<2)return;dirty=false;lastX=p.x;lastZ=p.z;let count=0;ferns.begin();
   outer:for(const points of samples.values())for(let i=0;i<points.length;i+=3){const x=points[i],y=points[i+1],z=points[i+2];if((x-p.x)**2+(z-p.z)**2>22**2||Math.abs(y-p.y)>10)continue;
    const seed=Math.abs(Math.sin(x*17.1+z*35.3));if(seed>.99&&Math.cos(x*.37+z*.59)>.4)ferns.add(x,y,z,seed);const height=.7+seed*.55;dummy.position.set(x,y,z);dummy.rotation.y=seed*6.28;dummy.scale.setScalar(height);dummy.updateMatrix();mesh.setMatrixAt(count,dummy.matrix);color.setRGB(.27+seed*.1,.40+seed*.13,.16+seed*.09);mesh.setColorAt(count,color);if(++count===2200)break outer;
   }ferns.end();mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  },
  dispose(){ferns.dispose();scene.remove(mesh);mesh.dispose();geometry.dispose();material.dispose();samples.clear();}
 };
}
