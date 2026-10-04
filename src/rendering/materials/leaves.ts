import * as THREE from 'three';
import { pbrMaterial } from './pbr';
/** A small original leaf-cluster atlas: alpha-tested cards avoid transparent sorting. */
export function leafMaterial(){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d')!;
 let seed=7319;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 ctx.strokeStyle='#596b2e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(64,120);ctx.lineTo(62,24);ctx.stroke();
 for(let i=0;i<62;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*48,x=64+Math.cos(a)*r,y=58+Math.sin(a)*r;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=`hsl(${80+random()*20} 30% ${32+random()*25}%)`;ctx.beginPath();ctx.ellipse(0,0,5+random()*5,2+random()*3,0,0,Math.PI*2);ctx.fill();ctx.restore();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;
 const material=pbrMaterial('#a3b879','foliage',{map:texture,alphaTest:.5,side:THREE.DoubleSide,roughness:.95});
 const time={value:0};material.onBeforeCompile=shader=>{shader.uniforms.leafTime=time;shader.vertexShader='uniform float leafTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec3 base=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz;transformed.x+=sin(leafTime*1.4+base.x+base.z)*.035*(uv.y);');};
 return {material,time,dispose(){texture.dispose();material.dispose();}};
}
