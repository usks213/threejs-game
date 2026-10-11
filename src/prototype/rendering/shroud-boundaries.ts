import * as THREE from 'three';
import {SHROUD_ZONES} from '../core/shroud-zones';
import {REGIONS} from '../core/regions';
/** Visible, non-solid curtains share rule bounds; no voxel/provider/save edits.
 * Twelve low-poly sheets use one texture, with depth testing and no shadows. */
export function createShroudBoundaries(scene:THREE.Scene,western=false){
 const root=new THREE.Group();root.name='shroud-boundaries';scene.add(root);
 const pixels=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const u=x/31,v=y/31,i=(y*32+x)*4,fade=Math.min(1,3*(1-v)*Math.sin(Math.PI*v)),wisp=.6+.4*Math.sin(u*11+v*7)**2;pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(255*fade*wisp);}
 const texture=new THREE.DataTexture(pixels,32,32);texture.needsUpdate=true;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
 const geometry=new THREE.PlaneGeometry(1,1),normal=new THREE.MeshBasicMaterial({color:0x7bafa0,map:texture,transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide}),deep=normal.clone(),ash=normal.clone();deep.color.setHex(0x927bb0);deep.opacity=.42;ash.color.setHex(0xb0918b);
 const halfWidth=western?128:80,volumes=[...SHROUD_ZONES.map(z=>({...z,minX:z.minX??-halfWidth,maxX:z.maxX??halfWidth,material:z.deep?deep:normal})),...REGIONS.filter(r=>r.climate==='ash').map(r=>({id:'shroud:'+r.id,...r.bounds,floor:r.groundY-.1,height:5,material:ash}))];
 for(const volume of volumes){const {minX,maxX,minZ,maxZ,floor,height}=volume,group=new THREE.Group();group.name=volume.id;group.userData.bounds={minX,maxX,minZ,maxZ};
  for(const [x,z,width,yaw] of [[(minX+maxX)/2,minZ,maxX-minX,0],[(minX+maxX)/2,maxZ,maxX-minX,0],[minX,(minZ+maxZ)/2,maxZ-minZ,Math.PI/2],[maxX,(minZ+maxZ)/2,maxZ-minZ,Math.PI/2]]){const mesh=new THREE.Mesh(geometry,volume.material);mesh.position.set(x,floor+height/2,z);mesh.rotation.y=yaw;mesh.scale.set(width,height,1);mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);}root.add(group);
 }
 let disposed=false;return {root,get stats(){return {volumes:volumes.length,sheets:volumes.length*4,triangles:volumes.length*8};},update(enabled:boolean){if(!disposed)root.visible=enabled;},dispose(){if(disposed)return;disposed=true;scene.remove(root);root.clear();geometry.dispose();normal.dispose();deep.dispose();ash.dispose();texture.dispose();}};
}
