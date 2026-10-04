import * as THREE from 'three';
export type Surface = 'earth' | 'stone' | 'wood' | 'cloth' | 'leather' | 'skin' | 'foliage' | 'metal' | 'crystal';
const presets: Record<Surface, [number, number, number]> = {
 earth:[.96,0,.4],stone:[.92,0,.65],wood:[.8,0,.4],cloth:[.98,0,.22],leather:[.67,0,.3],skin:[.58,0,.12],foliage:[.78,0,.18],metal:[.32,1,.12],crystal:[.16,0,.08],
};
const maps = new Map<Surface, { map: THREE.DataTexture; normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture }>();
/** Tileable, unlit material data. Albedo is sRGB; normals and roughness are linear data. */
export function surfaceMaps(kind: Surface) {
 let result=maps.get(kind); if(result)return result;
 const size=128, height=new Float32Array(size*size), albedo=new Uint8Array(size*size*4), normal=new Uint8Array(size*size*4), rough=new Uint8Array(size*size*4);
 function noise(x:number,y:number,period:number){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const hash=(a:number,b:number)=>{const n=Math.sin(((a%period+period)%period)*127.1+((b%period+period)%period)*311.7)*43758.5453;return n-Math.floor(n);};
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),sx),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),sx),sy);
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  const grain=noise(u*8,v*8,8)*.5+noise(u*16,v*16,16)*.3+noise(u*32,v*32,32)*.2;
  height[y*size+x]=kind==='wood'?.4+.16*Math.sin(u*Math.PI*24+noise(u*4,v*4,4)*3)+grain*.25:kind==='cloth'?.5+.1*Math.sin(u*Math.PI*64)*Math.sin(v*Math.PI*64):grain;
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,h=height[y*size+x],dx=(height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size])*presets[kind][2],dy=(height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x])*presets[kind][2],length=Math.hypot(dx,dy,1);
  albedo[i]=albedo[i+1]=albedo[i+2]=Math.round(215+h*35);albedo[i+3]=255;
  normal[i]=Math.round((-dx/length*.5+.5)*255);normal[i+1]=Math.round((-dy/length*.5+.5)*255);normal[i+2]=Math.round((1/length*.5+.5)*255);normal[i+3]=255;
  rough[i]=rough[i+1]=rough[i+2]=Math.round(195+h*60);rough[i+3]=255;
 }
 function texture(data:Uint8Array,color=false){const t=new THREE.DataTexture(data,size,size);t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;}
 result={map:texture(albedo,true),normalMap:texture(normal),roughnessMap:texture(rough)};maps.set(kind,result);return result;
}
export function pbrMaterial(color: THREE.ColorRepresentation, kind: Surface, options:THREE.MeshStandardMaterialParameters={}) {
 const [roughness,metalness]=presets[kind];
 const m=new THREE.MeshStandardMaterial({color,roughness,metalness,...surfaceMaps(kind),...options});m.userData.surface=kind;if(kind==='crystal'){m.emissive.set(color);m.emissiveIntensity=.8;}
 return m;
}
/** Called once after the world/terrain release their materials. */
export function disposeSurfaceMaps(){for(const entry of maps.values())for(const texture of Object.values(entry))texture.dispose();maps.clear();}
