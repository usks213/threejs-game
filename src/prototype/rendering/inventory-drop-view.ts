import * as THREE from 'three';
import {INVENTORY_DROPS} from '../core/inventory';
import type {CoreSimulation} from '../core/simulation';
/** A shared finite mesh pool. Bundles retain their IDs and exact count in the
 * host's inventory state; rendering never creates or collects items. */
export function createInventoryDropView(scene:THREE.Scene,sim:CoreSimulation){
 const geometry=new THREE.DodecahedronGeometry(.18,0),material=new THREE.MeshStandardMaterial({color:'#d4b887',roughness:.9,emissive:'#746037',emissiveIntensity:.25}),mesh=new THREE.InstancedMesh(geometry,material,INVENTORY_DROPS),dummy=new THREE.Object3D(),color=new THREE.Color();
 mesh.name='inventory-bundles';mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
 return {update(){const drops=sim.campaignMode?sim.campaign.inventory.state.drops:[];mesh.count=drops.length;for(let i=0;i<drops.length;i++){const d=drops[i];dummy.position.set(d.position.x,d.position.y,d.position.z);dummy.rotation.set(0,d.id*.7,0);dummy.scale.set(1,.75,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.set(d.key.startsWith('material:')?'#b8ac80':'#82bd9b'));}if(drops.length){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}},dispose(){scene.remove(mesh);mesh.dispose();geometry.dispose();material.dispose();}};
}
