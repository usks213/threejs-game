import { roofHeight } from '../../game/meadows/building-shapes';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbrMaterial } from '../materials/pbr';
import * as THREE from 'three';
import { BUILDINGS } from '../../content/catalog';
/** Original timber/stone kit. All pieces share a geometry and a small material palette. */
export function buildingKit() {
 const box=new THREE.BoxGeometry(1,1,1),stone=new THREE.IcosahedronGeometry(1,0),cone=new THREE.ConeGeometry(1,1,7);
 const templates=new Map<string,THREE.Group>(),mergedGeometries:THREE.BufferGeometry[]=[];
 const mats=new Map<string,THREE.MeshStandardMaterial>();
 const mat=(color:string)=>{let m=mats.get(color);if(!m){m=pbrMaterial(color, ['#585d57','#ddbc78'].includes(color)?'metal':['#737970','#8a8e80','#797e74'].includes(color)?'stone':['#849563','#d2c8a7'].includes(color)?'cloth':color==='#a896c7'?'crystal':'wood');mats.set(color,m);}return m;};
 function make(id:string){
  const template=templates.get(id);if(template)return template.clone();
  const g=new THREE.Group(),def=BUILDINGS.find(b=>b.id===id)!;
  const part=(color:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,shape:THREE.BufferGeometry=box)=>{const m=new THREE.Mesh(shape,mat(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  const beam='#644731',plank='#ad8457',metal='#585d57';
  if(['roof','roof45','ridge','ridge45','roofCorner','roofInner','roofCorner45','roofInner45'].includes(id)){
   const positions:number[]=[],uv:number[]=[];const grid=8;
   for(let ix=0;ix<grid;ix++)for(let iz=0;iz<grid;iz++){
    const x=-1+ix*2/grid,z=-1+iz*2/grid,d=2/grid;
    for(const [px,pz]of [[x,z],[x,z+d],[x+d,z],[x+d,z],[x,z+d],[x+d,z+d]]){positions.push(px,roofHeight(id,px,pz)!+.1,pz);uv.push((px+1)/2,(pz+1)/2);}
   }
   const shape=new THREE.BufferGeometry();shape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shape.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));shape.computeVertexNormals();mergedGeometries.push(shape);const roof=part('#a38d58',0,0,0,1,1,1,shape);(roof.material as THREE.MeshStandardMaterial).side=THREE.DoubleSide;
   for(const x of [-.92,.92]){const y0=roofHeight(id,x,-1)!,y1=roofHeight(id,x,1)!,strut=part(beam,x,(y0+y1)/2,0,.1,.13,Math.hypot(2,y1-y0));strut.rotation.x=-Math.atan2(y1-y0,2);}
  }else if(['stairs','ladder'].includes(id)){
   for(let i=0;i<6;i++)part(plank,0,(i+.5)/3,-1+(i+.5)/3,id==='ladder'?.8:2,.12,.36);
   for(const x of [-.38,.38])part(beam,x,1,0,.12,2.8,.13).rotation.x=Math.PI/4;
  }else if(['door','gate','fence','stakeWall'].includes(id)){
   const h=def.size[1],w=def.size[0];for(let i=0;i<7;i++)part(plank,-w/2+(i+.5)*w/7,h/2,0,w/9,h,.16);
   part(beam,0,h*.25,.12,w,.16,.15);part(beam,0,h*.8,.12,w,.16,.15);
  }else if(id==='cook'){
   for(const x of [-.5,.5])part(beam,x,.6,0,.08,1.2,.1);part(beam,0,1.18,0,1.2,.08,.1);
   for(const x of [-.25,.25])part(metal,x,.95,0,.035,.4,.035);
  }else if(id==='beehive'){
   part(beam,0,.4,0,.12,.8,.12);for(let i=0;i<4;i++)part('#bc9a56',0,.85+i*.12,0,.65-i*.1,.12,.65-i*.1,stone);
  }else if(id==='choppingBlock'){
   part(beam,0,.3,0,.6,.6,.6,stone);part(metal,.1,.75,0,.25,.2,.05);part(beam,0,.65,0,.08,.6,.08).rotation.z=.4;
  }else if(id==='tanningRack'){
   for(const x of [-.8,.8])part(beam,x,1,0,.1,2,.1);part(beam,0,1.9,0,1.8,.1,.1);part('#b99973',0,1,0,1.4,1.5,.06);
  }else if(id==='raft'){
   for(let i=0;i<8;i++)part(beam,-1.75+i*.5,.2,0,.45,.4,4);part(beam,0,2,0,.2,4,.2);part('#d2c8a7',0,2.8,0,2.8,1.8,.05);part(beam,0,3.7,0,3,.1,.1);
  }else if(id==='sign'){
   part(beam,0,.5,0,.1,1,.1);part(plank,0,.9,0,1,.4,.1);
  }else if(id==='standingTorch'){
   part(beam,0,.7,0,.12,1.4,.12);const flame=part('#ffc066',0,1.5,0,.18,.4,.18,cone);flame.name='flame';(flame.material as THREE.MeshStandardMaterial).emissive.set('#ff791e');(flame.material as THREE.MeshStandardMaterial).emissiveIntensity=5;
  }else if(id==='beam26'||id==='beam45'){const m=part(beam,0,def.size[1]/2,0,Math.hypot(2,def.size[1]),.15,.15);m.rotation.z=Math.atan2(def.size[1],2);
  }else if(id==='smallFloor'||id==='halfWall'||id==='slantWall'){
   for(let i=0;i<8;i++){const h=id==='smallFloor'?.15:id==='halfWall'?1:(i+1)/4;part(plank,-def.size[0]/2+(i+.5)*def.size[0]/8,h/2,0,def.size[0]/8-.015,h,def.size[2]);}
  }else if(id==='floor'||id==='wall'){
   const wall=id==='wall',roof=false;
   for(let i=0;i<8;i++){const c=i%3===0?'#9a714a':roof?'#625d49':plank;
    if(wall)part(c,-.88+i*.25,1,0,.235,2,.18);else part(c,-.88+i*.25,roof?.13:.075,0,.235,roof?.2:.15,2);
   }
   if(wall){part(beam,0,.2,.12,2,.16,.15);part(beam,0,1.8,.12,2,.16,.15);}
   else {part(beam,0,.06,-.8,2,.1,.18);part(beam,0,.06,.8,2,.1,.18);}
  }else if(id==='bench'){
   part(plank,0,.72,0,1.5,.16,.8);for(const x of [-.57,.57])for(const z of [-.27,.27])part(beam,x,.34,z,.14,.68,.14);
   part(metal,.3,.88,0,.28,.17,.2);part(beam,-.4,.88,.15,.4,.1,.15);
  }else if(id==='fire'){
   for(let i=0;i<9;i++){const a=i*Math.PI*2/9;part('#737970',Math.sin(a)*.34,.12,Math.cos(a)*.34,.14,.12,.14,stone);}
   part(beam,0,.12,0,.5,.1,.14).rotation.y=.6;part(beam,0,.16,0,.5,.1,.14).rotation.y=-.6;
   const flame=part('#ffc066',0,.45,0,.25,.65,.25,cone);flame.name='flame';(flame.material as THREE.MeshStandardMaterial).emissive.set('#ff791e');(flame.material as THREE.MeshStandardMaterial).emissiveIntensity=5;
  }else if(id==='bed'){
   part(beam,0,.12,0,1,.24,2);part('#849563',0,.27,.25,.9,.12,1.35);part('#d2c8a7',0,.3,-.65,.8,.16,.4);
  }else if(id==='chest'){
   part(plank,0,.38,0,1,.76,.7);for(const x of [-.32,.32])part(metal,x,.39,.01,.08,.8,.73);part('#ddbc78',0,.44,.37,.14,.2,.05);
  }else if(id==='portal'){
   for(const x of [-.85,.85])part(beam,x,1.5,0,.3,3,.4);part(beam,0,2.85,0,2,.3,.4);
   for(let i=0;i<5;i++)part('#a896c7',0,.5+i*.45,0,.03,.08,.04);
  }else if(id==='foundation'){
   for(let row=0;row<2;row++)for(let col=0;col<3;col++)part(col%2?'#8a8e80':'#797e74',-.66+col*.66,.175,-.5+row,.64,.35,.98);
  }else part(def.color,0,def.size[1]/2,0,...def.size);
  const batches=new Map<THREE.Material,THREE.Mesh[]>();
  for(const child of [...g.children])if(child instanceof THREE.Mesh&&child.name!=='flame'){const m=child.material as THREE.Material;const list=batches.get(m)??[];list.push(child);batches.set(m,list);}
  for(const [material,meshes]of batches)if(meshes.length>1){const parts=meshes.map(mesh=>{mesh.updateMatrix();const transformed=mesh.geometry.clone().applyMatrix4(mesh.matrix);if(!transformed.index)return transformed;const converted=transformed.toNonIndexed();transformed.dispose();return converted;});const geometry=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());for(const mesh of meshes)g.remove(mesh);const merged=new THREE.Mesh(geometry,material);merged.castShadow=true;merged.receiveShadow=true;g.add(merged);mergedGeometries.push(geometry);}
  templates.set(id,g);return g.clone();
 }
 return {make,dispose(){for(const g of mergedGeometries)g.dispose();templates.clear();box.dispose();stone.dispose();cone.dispose();for(const m of mats.values())m.dispose();}};
}
