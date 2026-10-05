import * as THREE from 'three';
import type {Vec3} from '../core/voxel';

export interface TraversalViewSimulation {
 readonly gliding:boolean;
 readonly grapple:Readonly<Vec3>|null;
 readonly player:{readonly hp:number;readonly position:Readonly<Vec3>;readonly yaw:number};
 readonly campaign:{readonly state:{readonly equipment:{readonly glider:string|null}}};
 readonly fishing:{readonly selected:boolean};
}

const finitePosition=(p:Readonly<Vec3>)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);

/** Original rigid wood-and-cloth traversal props. This view only observes active
 * traversal; it adds no flight, cloth physics, hitboxes, or anchor selection. */
export function createTraversalView(scene:THREE.Scene,camera:THREE.Camera,sim:TraversalViewSimulation){
 const wing=new THREE.Group();wing.name='traversal-glider';wing.visible=false;scene.add(wing);
 const edges=new THREE.Group();edges.name='traversal-glider-edges';edges.visible=false;camera.add(edges);
 const tetherRoot=new THREE.Group();tetherRoot.name='traversal-grapple';tetherRoot.visible=false;scene.add(tetherRoot);
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 const geometry=<T extends THREE.BufferGeometry>(g:T)=>{geometries.push(g);return g;};
 const material=<T extends THREE.Material>(m:T)=>{materials.push(m);return m;};
 const wood=material(new THREE.MeshStandardMaterial({color:0x735239,roughness:.88,metalness:0,flatShading:true}));
 const cloth=material(new THREE.MeshStandardMaterial({color:0xc8ba92,vertexColors:true,roughness:1,metalness:0,side:THREE.DoubleSide}));
 const trim=material(new THREE.MeshStandardMaterial({color:0x966952,roughness:.96,metalness:0,side:THREE.DoubleSide}));
 const cord=material(new THREE.MeshStandardMaterial({color:0xc0aa7e,roughness:1,metalness:0}));
 const sparGeometry=geometry(new THREE.CylinderGeometry(1,1,1,6));
 const up=new THREE.Vector3(0,1,0),a=new THREE.Vector3(),b=new THREE.Vector3(),delta=new THREE.Vector3(),transform=new THREE.Object3D();
 // A shallow, tapered six-panel kite, rather than a copied game silhouette.
 const outline=[[0,2.11,-.66],[.75,2.11,-.49],[1.66,1.94,-.02],[1.42,1.91,.5],[.64,2.01,.63],[0,2.09,.47]] as const;
 const clothVertices:number[]=[],clothColors:number[]=[],trimVertices:number[]=[];
 for(const side of [-1,1]){
  for(let i=0;i<outline.length-1;i++){
   const p=outline[i],q=outline[i+1],shade=i%2===0?1:.9;
   clothVertices.push(0,2.17,0,p[0]*side,p[1],p[2],q[0]*side,q[1],q[2]);
   for(let v=0;v<3;v++)clothColors.push(shade,shade,shade);
  }
  // Small sewn border panels distinguish the upgraded cloth without extra glow.
  trimVertices.push(.75*side,2.114,-.49,1.66*side,1.944,-.02,1.53*side,1.952,.004,
   .75*side,2.114,-.49,1.53*side,1.952,.004,.71*side,2.114,-.39);
 }
 const panelGeometry=geometry(new THREE.BufferGeometry());panelGeometry.setAttribute('position',new THREE.Float32BufferAttribute(clothVertices,3));panelGeometry.setAttribute('color',new THREE.Float32BufferAttribute(clothColors,3));panelGeometry.computeVertexNormals();panelGeometry.computeBoundingSphere();
 const panels=new THREE.Mesh(panelGeometry,cloth);panels.name='traversal-glider-cloth';panels.castShadow=true;panels.receiveShadow=true;wing.add(panels);
 const borderGeometry=geometry(new THREE.BufferGeometry());borderGeometry.setAttribute('position',new THREE.Float32BufferAttribute(trimVertices,3));borderGeometry.computeVertexNormals();borderGeometry.computeBoundingSphere();
 const borders=new THREE.Mesh(borderGeometry,trim);borders.name='traversal-glider-trim';borders.receiveShadow=true;wing.add(borders);
 const spars=new THREE.InstancedMesh(sparGeometry,wood,11);spars.name='traversal-glider-frame';spars.castShadow=true;spars.receiveShadow=true;wing.add(spars);let sparIndex=0;
 function span(mesh:THREE.InstancedMesh,index:number,ax:number,ay:number,az:number,bx:number,by:number,bz:number,radius:number){
  a.set(ax,ay,az);b.set(bx,by,bz);delta.copy(b).sub(a);const length=delta.length();
  transform.position.copy(a).add(b).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(up,delta.multiplyScalar(1/length));transform.scale.set(radius,length,radius);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);
 }
 span(spars,sparIndex++,0,2.11,-.69,0,2.09,.51,.024);
 for(const side of [-1,1]){
  span(spars,sparIndex++,0,2.11,-.66,.75*side,2.11,-.49,.024);
  span(spars,sparIndex++,.75*side,2.11,-.49,1.66*side,1.94,-.02,.022);
  span(spars,sparIndex++,0,2.17,0,1.42*side,1.91,.5,.018);
  span(spars,sparIndex++,.2*side,1.33,.17,.6*side,2.09,-.31,.016);
  span(spars,sparIndex++,.2*side,1.33,.17,.59*side,2.02,.57,.014);
 }
 spars.instanceMatrix.needsUpdate=true;spars.computeBoundingSphere();
 // Only upper-corner cloth/frame hints in first person; leave the reticle clear.
 const edgeVertices:number[]=[];
 for(const side of [-1,1])edgeVertices.push(.73*side,.99,-.7,1.04*side,.8,-.7,1.04*side,1.04,-.7);
 const edgeGeometry=geometry(new THREE.BufferGeometry());edgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(edgeVertices,3));edgeGeometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(18).fill(1),3));edgeGeometry.computeVertexNormals();edgeGeometry.computeBoundingSphere();
 const edgePanels=new THREE.Mesh(edgeGeometry,cloth);edgePanels.name='traversal-glider-edge-cloth';edges.add(edgePanels);
 const edgeSpars=new THREE.InstancedMesh(sparGeometry,wood,2);edgeSpars.name='traversal-glider-edge-frame';edges.add(edgeSpars);
 for(let i=0;i<2;i++){const side=i===0?-1:1;span(edgeSpars,i,.73*side,.99,-.7,1.04*side,.8,-.7,.009);}
 edgeSpars.instanceMatrix.needsUpdate=true;edgeSpars.computeBoundingSphere();
 const tether=new THREE.Mesh(sparGeometry,cord);tether.name='traversal-grapple-tether';tether.frustumCulled=false;tetherRoot.add(tether);
 const origin=new THREE.Vector3(),destination=new THREE.Vector3();let disposed=false,lastGlider:string|null|undefined;
 return {
  update(thirdPerson=false,bodyVisible=true,localFishing=true){
   if(disposed)return;
   const p=sim.player,valid=p.hp>0&&finitePosition(p.position)&&Number.isFinite(p.yaw)&&!(localFishing&&sim.fishing.selected);
   wing.visible=valid&&sim.gliding&&thirdPerson&&bodyVisible;
   edges.visible=valid&&sim.gliding&&!thirdPerson;
   tetherRoot.visible=false;
   if(!valid)return;
   if(wing.visible){wing.position.set(p.position.x,p.position.y,p.position.z);wing.rotation.y=p.yaw;}
   if(edges.visible){const projection=camera.projectionMatrix.elements;edges.scale.set(.7/Math.max(.01,Math.abs(projection[0])),.7/Math.max(.01,Math.abs(projection[5])),1);}
   if((wing.visible||edges.visible)&&lastGlider!==sim.campaign.state.equipment.glider){
    lastGlider=sim.campaign.state.equipment.glider;const upgraded=lastGlider==='windwoven-glider';
    cloth.color.setHex(upgraded?0x819d8e:0xc8ba92);trim.color.setHex(upgraded?0xc8a66a:0x966952);wood.color.setHex(upgraded?0x635443:0x735239);
   }
   const target=sim.grapple;if(!target||!finitePosition(target))return;
   // A body-mounted harness origin stays on the actual player in either camera.
   const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
   origin.set(p.position.x+.2*c-.19*s,p.position.y+1.3,p.position.z-.2*s-.19*c);
   destination.set(target.x,target.y,target.z);delta.copy(destination).sub(origin);const length=delta.length();
   if(!Number.isFinite(length)||length<.001)return;
   tetherRoot.visible=true;tether.position.copy(origin).add(destination).multiplyScalar(.5);tether.quaternion.setFromUnitVectors(up,delta.multiplyScalar(1/length));tether.scale.set(.012,length,.012);
  },
  get stats(){return {geometries:geometries.length,materials:materials.length,wingVisible:wing.visible,edgesVisible:edges.visible,tetherVisible:tetherRoot.visible,disposed};},
  dispose(){if(disposed)return;disposed=true;wing.visible=edges.visible=tetherRoot.visible=false;scene.remove(wing,tetherRoot);camera.remove(edges);spars.dispose();edgeSpars.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();wing.clear();edges.clear();tetherRoot.clear();},
 };
}
