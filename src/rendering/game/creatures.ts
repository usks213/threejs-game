import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { pbrMaterial } from '../materials/pbr';
/** Original articulated low-poly wildlife, built from a shared mesh palette. */
export function creatureKit(){
 const sphere=new THREE.IcosahedronGeometry(1,1),box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(.05,.09,1,5);
 const lods=new Map<string,THREE.BufferGeometry>();
 const mats=new Map<string,THREE.MeshStandardMaterial>();
 const material=(color:string,wood=false)=>{const key=color+wood;let m=mats.get(key);if(!m){m=pbrMaterial(color,wood?'wood':'skin');mats.set(key,m);}return m;};
 function make(kind:string){
  const g=new THREE.Group(),deer=kind==='deer'||kind==='stormstag',boar=kind==='boar',bird=kind==='gull',neck=kind==='neck',boss=kind==='stormstag';
  const fur=boss?'#50493e':deer?'#966b43':boar?'#5a4636':neck?'#648753':bird?'#d8dad5':'#625c43';
  const part=(shape:THREE.BufferGeometry,c:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,name='')=>{const m=new THREE.Mesh(shape,material(c));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.name=name;m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  if(deer||boar||neck){
   const h=deer?1.05:boar?.57:.3;
   part(sphere,fur,0,h,.1,deer?.32:boar?.42:.35,deer?.43:.32,deer?.7:.58);
   part(sphere,fur,0,h+(deer?.42:.12),-.56,.24,deer?.45:.23,.26);
   part(sphere,deer?'#b09571':fur,0,h+(deer?.65:.13),-.78,.18,.19,.34);
   part(sphere,'#25221b',0,h+(deer?.63:.1),-1.03,.12,.09,.09);
   for(const side of [-1,1]){
    part(sphere,fur,side*.22,h+(deer?.95:.38),-.55,.1,.19,.07).rotation.z=side*-.5;
    part(sphere,'#11150f',side*.18,h+(deer?.73:.22),-.8,.038,.04,.04);
    if(boar)part(cylinder,'#d9c9a4',side*.24,h+.13,-.8,1, .3,1).rotation.z=side*.4;
    for(const front of [-1,1]){const limb=new THREE.Group();limb.position.set(side*.24,h-.12,front*.4);limb.name=`leg${side}${front}`;const m=new THREE.Mesh(cylinder,material(fur));m.scale.set(deer?1.4:2,deer?.86:.35,deer?1.4:2);m.position.y=-m.scale.y/2;limb.add(m);g.add(limb);}
   }
   if(neck){part(sphere,fur,0,.24,.83,.16,.15,.55);for(let i=0;i<4;i++)part(sphere,'#b3aa65',0,.59,.5-i*.23,.09,.11,.1);}
   if(deer){part(sphere,'#d4bea0',0,h,.71,.16,.16,.13);for(const side of [-1,1])for(let i=0;i<4;i++){const a=part(cylinder,boss?'#d3b69c':'#c2ad89',side*(.15+i*.12),h+1.03+i*.16,-.52+i*.06,1.1,.34,1.1);a.rotation.z=-side*.35;if(i>0)part(cylinder,'#c2ad89',side*(.23+i*.12),h+1.14+i*.16,-.63, .7,.28,.7).rotation.x=-.5;}}
  }else if(bird){part(sphere,fur,0,.25,0,.18,.2,.35);part(sphere,fur,0,.43,-.26,.13,.13,.15);part(sphere,'#c4a048',0,.4,-.43,.06,.05,.13);for(const side of [-1,1])part(box,'#afb7b4',side*.4,.28,0,.65,.04,.28,`wing${side}`);}
  else{
   part(sphere,fur,0,.8,0,.3,.55,.25);part(sphere,fur,0,1.38,-.06,.25,.27,.2);
   for(const side of [-1,1]){part(cylinder,fur,side*.33,.8,0,2,.7,2).rotation.z=side*.2;part(cylinder,fur,side*.18,.26,0,2,.55,2);const eye=part(sphere,'#f0c56f',side*.09,1.41,-.24,.043,.04,.02);eye.material=material('#f0c56f');}
   for(let i=0;i<5;i++)part(cylinder,fur,(i-2)*.12,1.68+Math.sin(i)*.08,0,.8,.34,.8).rotation.z=(i-2)*.25;
  }
  if(kind.startsWith('draugr')){part(box,'#6d5340',.38,.8,-.1,.12,.7,.12);if(kind==='draugrArcher')part(cylinder,'#a7865e',.4,.9,-.3,1,1.1,1);if(kind==='draugrElite'){g.scale.setScalar(1.2);part(sphere,'#758875',0,1.75,-.05,.3,.2,.22);}}
  return g;
 }
 function far(kind:string){let geometry=lods.get(kind);if(!geometry){const source=make(kind),parts:THREE.BufferGeometry[]=[];source.updateMatrixWorld(true);source.traverse(o=>{if(o instanceof THREE.Mesh){const transformed=o.geometry.clone().applyMatrix4(o.matrixWorld),g=transformed.index?transformed.toNonIndexed():transformed;if(g!==transformed)transformed.dispose();const color=(o.material as THREE.MeshStandardMaterial).color,values=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<values.length;i+=3){values[i]=color.r;values[i+1]=color.g;values[i+2]=color.b;}g.setAttribute('color',new THREE.BufferAttribute(values,3));g.deleteAttribute('uv');parts.push(g);}});geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());lods.set(kind,geometry);}let m=mats.get('lod');if(!m){m=pbrMaterial('#ffffff','skin',{vertexColors:true});mats.set('lod',m);}const mesh=new THREE.Mesh(geometry,m);mesh.receiveShadow=true;const group=new THREE.Group();group.add(mesh);return group;}
 return {make,far,animate(g:THREE.Group,time:number,moving:boolean,attack:number){g.traverse(o=>{if(o.name.startsWith('leg'))o.rotation.x=moving?Math.sin(time*9+(o.name==='leg-1-1'||o.name==='leg11'?0:Math.PI))*.6:0;if(o.name.startsWith('wing'))o.rotation.z=Math.sin(time*7)*.4*(o.name==='wing-1'?-1:1);});g.rotation.x=attack>0?-.1:0;},dispose(){for(const g of lods.values())g.dispose();sphere.dispose();box.dispose();cylinder.dispose();for(const m of mats.values())m.dispose();}};
}
