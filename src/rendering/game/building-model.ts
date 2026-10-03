import { pbrMaterial } from '../materials/pbr';
import * as THREE from 'three';
import { BUILDINGS } from '../../content/catalog';
/** Original timber/stone kit. All pieces share a geometry and a small material palette. */
export function buildingKit() {
 const box=new THREE.BoxGeometry(1,1,1),stone=new THREE.IcosahedronGeometry(1,0),cone=new THREE.ConeGeometry(1,1,7);
 const mats=new Map<string,THREE.MeshStandardMaterial>();
 const mat=(color:string)=>{let m=mats.get(color);if(!m){m=pbrMaterial(color, ['#585d57','#ddbc78'].includes(color)?'metal':['#737970','#8a8e80','#797e74'].includes(color)?'stone':['#849563','#d2c8a7'].includes(color)?'cloth':color==='#a896c7'?'crystal':'wood');mats.set(color,m);}return m;};
 function make(id:string){
  const g=new THREE.Group(),def=BUILDINGS.find(b=>b.id===id)!;
  const part=(color:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,shape:THREE.BufferGeometry=box)=>{const m=new THREE.Mesh(shape,mat(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  const beam='#644731',plank='#ad8457',metal='#585d57';
  if(id==='floor'||id==='roof'||id==='wall'){
   const wall=id==='wall',roof=id==='roof';
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
  return g;
 }
 return {make,dispose(){box.dispose();stone.dispose();cone.dispose();for(const m of mats.values())m.dispose();}};
}
