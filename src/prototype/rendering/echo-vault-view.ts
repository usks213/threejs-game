import * as THREE from 'three';
import type {EchoVaultSystem} from '../core/echo-vault';
/** Non-color-only trap cue: three teeth rise for 1.2s before the damaging pulse.
 * Fixed white side-lane markers and the full-width grate use the same rule bounds. */
export function createEchoVaultView(scene:THREE.Scene,sim:{dungeon:EchoVaultSystem;seconds:number}){
 const root=new THREE.Group();root.name='echo-vault-cues';scene.add(root);
 const teethMaterial=new THREE.MeshStandardMaterial({color:0xb78a55,emissive:0x000000,roughness:.7});
 const safeMaterial=new THREE.MeshStandardMaterial({color:0xe9e1bb,emissive:0x453e23,roughness:.85});
 const teethGeometry=new THREE.ConeGeometry(.14,.7,4),safeGeometry=new THREE.BoxGeometry(.18,.04,.5);
 const teeth=new THREE.InstancedMesh(teethGeometry,teethMaterial,9),safe=new THREE.InstancedMesh(safeGeometry,safeMaterial,6);teeth.name='vault-warning-teeth';safe.name='vault-safe-side-lane';root.add(teeth,safe);
 const transform=new THREE.Object3D();for(let i=0;i<6;i++){transform.position.set(10,.3,11.5+i*.55);transform.scale.set(1,1,1);transform.updateMatrix();safe.setMatrixAt(i,transform.matrix);}safe.instanceMatrix.needsUpdate=true;safe.computeBoundingSphere();
 let disposed=false;
 return {
  update(){if(disposed)return;root.visible=sim.dungeon.enabled;if(!root.visible)return;const phase=sim.dungeon.trapPhase(sim.seconds),height=phase==='warning'?.15+.48*((sim.seconds%6-3)/1.2):phase==='strike'?.7:.02;
   teethMaterial.emissive.setHex(phase==='warning'?0x6d3912:phase==='strike'?0xa94113:0);let i=0;for(const x of [7.5,8.25,9])for(const z of [12.45,13,13.55]){transform.position.set(x,.35+height/2,z);transform.scale.set(1,height/.7,1);transform.updateMatrix();teeth.setMatrixAt(i++,transform.matrix);}teeth.instanceMatrix.needsUpdate=true;teeth.computeBoundingSphere();},
  dispose(){if(disposed)return;disposed=true;scene.remove(root);teeth.dispose();safe.dispose();teethGeometry.dispose();safeGeometry.dispose();teethMaterial.dispose();safeMaterial.dispose();root.clear();},
 };
}
