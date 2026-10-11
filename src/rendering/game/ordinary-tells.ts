import * as THREE from 'three';
import { hasOrdinaryMeleeTell, ordinaryMeleeReach, ORDINARY_MELEE_HALF_ARC } from '../../game/combat/ordinary-melee';
import type { AdventureSnapshot } from '../../game/types';

/** World-space sectors stay aligned with the committed attack, including when
 * the creature model bobs or scales. No WebGL resources are allocated per tick. */
export function ordinaryTells(scene: THREE.Scene) {
 const groups = new Map<number, THREE.Mesh>();
 const directionGeometry=new THREE.ConeGeometry(.18,.7,6),directionMaterial=new THREE.MeshBasicMaterial({color:'#ffca75',toneMapped:false});
 const geometries = new Map<number, THREE.BufferGeometry>();
 const material = new THREE.MeshBasicMaterial({color:'#ffb16d',transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 const geometry = (reach: number) => {
  let result = geometries.get(reach);
  if (!result) {
   const points: number[] = [], steps = 24;
   for (let i = 0; i < steps; i++) {
    const a = -ORDINARY_MELEE_HALF_ARC + 2 * ORDINARY_MELEE_HALF_ARC * i / steps;
    const b = -ORDINARY_MELEE_HALF_ARC + 2 * ORDINARY_MELEE_HALF_ARC * (i + 1) / steps;
    points.push(0,0,0,Math.sin(a)*reach,0,Math.cos(a)*reach,Math.sin(b)*reach,0,Math.cos(b)*reach);
   }
   result = new THREE.BufferGeometry();
   result.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
   geometries.set(reach,result);
  }
  return result;
 };
 return {
  update(state: AdventureSnapshot) {
   const live = new Set<number>();
   if (state.generator === 4) for (const enemy of state.enemies) {
    if (enemy.health <= 0 || !hasOrdinaryMeleeTell(enemy)) continue;
    live.add(enemy.id);
    let mesh = groups.get(enemy.id);
    if (!mesh) {
     mesh = new THREE.Mesh(geometry(ordinaryMeleeReach(enemy)),material);
     mesh.name = 'ordinary-melee-tell:' + enemy.id;
     // The floor sector can intersect an uphill slope. A solid arrow above the
     // creature preserves the committed direction without seeing through walls.
     const direction=new THREE.Mesh(directionGeometry,directionMaterial);direction.name='attack-direction';direction.position.set(0,1.8,.65);direction.rotation.x=Math.PI/2;mesh.add(direction);
     groups.set(enemy.id,mesh);scene.add(mesh);
    }
    mesh.position.set(enemy.x,enemy.y+.08,enemy.z);
    mesh.rotation.y = enemy.attackYaw ?? enemy.heading ?? 0;
   }
   for (const [id,mesh] of groups) if (!live.has(id)) {scene.remove(mesh);groups.delete(id);}
  },
  dispose() {for (const mesh of groups.values()) scene.remove(mesh);groups.clear();for (const mesh of geometries.values()) mesh.dispose();geometries.clear();material.dispose();directionGeometry.dispose();directionMaterial.dispose();},
 };
}
