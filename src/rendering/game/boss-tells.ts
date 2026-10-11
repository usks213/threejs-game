import * as THREE from 'three';
import type { AdventureSnapshot } from '../../game/types';
import { STAG_ATTACKS, type StagAttack } from '../../game/meadows/boss';
export function bossTells(scene:THREE.Scene){
 const groups=new Map<number,THREE.Group>(),geometries=new Map<string,THREE.BufferGeometry>();
 const warning=new THREE.MeshBasicMaterial({color:'#dc9b5a',transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
 const lightning=new THREE.MeshBasicMaterial({color:'#b9e6ff',transparent:true,opacity:.8,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
 const sitePatterns={loadwarden:{arc:.5,range:9},echowarden:{arc:.8,range:16},sailwarden:{arc:.6,range:16}};
 const core={pulse:{arc:Math.PI*2,range:5},prism:{arc:.8,range:16},rush:{arc:.35,range:9}};
 for(const [kind,a]of Object.entries({...STAG_ATTACKS,...core,...sitePatterns})){
  const points:number[]=[];const steps=kind==='stomp'?64:20;
  for(let i=0;i<steps;i++){const t=-a.arc/2+a.arc*i/steps,u=-a.arc/2+a.arc*(i+1)/steps;points.push(0,0,0,Math.sin(t)*a.range,0,Math.cos(t)*a.range,Math.sin(u)*a.range,0,Math.cos(u)*a.range);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometries.set(kind,g);
 }
 return {update(s:AdventureSnapshot){
  const live=new Set<number>();
  for(const e of s.enemies){if(!['stormstag','stormcore',...Object.keys(sitePatterns)].includes(e.definition)||e.health<=0)continue;live.add(e.id);let group=groups.get(e.id);
   if(!group){group=new THREE.Group();for(const kind of (e.definition in sitePatterns?[e.definition]:Object.keys(e.definition==='stormcore'?core:STAG_ATTACKS))){const m=new THREE.Mesh(geometries.get(kind),warning);m.name=kind;group.add(m);}groups.set(e.id,group);scene.add(group);}
   group.position.set(e.x,e.y+.08,e.z);group.rotation.y=e.attackYaw??0;
   for(const child of group.children){const m=child as THREE.Mesh;m.visible=child.name===(e.definition in sitePatterns?e.definition:e.attackKind)&&(e.windup>0||(e.attackFlash??0)>0);m.material=(e.attackFlash??0)>0&&!scene.userData.reducedMotion?lightning:warning;if(e.attackKind==='stomp'&&(e.attackFlash??0)>0)m.scale.setScalar(Math.min(1,1.15-e.attackFlash!));else m.scale.setScalar(1);}
  }
  for(const [id,g]of groups)if(!live.has(id)){scene.remove(g);groups.delete(id);}
 },dispose(){for(const g of groups.values())scene.remove(g);for(const g of geometries.values())g.dispose();warning.dispose();lightning.dispose();}};
}
