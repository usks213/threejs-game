import * as THREE from 'three';
import type { Battle, Profile } from '../core/types';
import { STADIUM } from '../core/physics';
export function createArena(canvas: HTMLCanvasElement, onError: (message:string)=>void) {
  let renderer: THREE.WebGLRenderer;
  try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true}); }
  catch { onError('WebGLを利用できません。対応ブラウザーで開き直してください。'); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setClearColor(0xeff2f8,1);
  const scene=new THREE.Scene(); scene.fog=new THREE.Fog(0xeff2f8,2,5);
  const camera=new THREE.PerspectiveCamera(39,1,.01,10); camera.position.set(0,.82,.75); camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x7b88ab,3));
  const sun=new THREE.DirectionalLight(0xffffff,3); sun.position.set(-1,2,1); scene.add(sun);
  const materials=new Set<THREE.Material>(); const geometries=new Set<THREE.BufferGeometry>();
  function mesh(geo:THREE.BufferGeometry,color:number,roughness=.5,metalness=.1) { geometries.add(geo); const mat=new THREE.MeshStandardMaterial({color,roughness,metalness}); materials.add(mat); return new THREE.Mesh(geo,mat); }
  const plinth=mesh(new THREE.CylinderGeometry(.325,.34,.055,80),0x1e2b47); plinth.position.y=-.064; scene.add(plinth);
  const dish=mesh(new THREE.CylinderGeometry(.238,.235,.018,80),0xf9fbff); dish.position.y=-.025; scene.add(dish);
  // The visible rail has the same three openings as the collision stadium.
  for(let i=0;i<192;i++){const a=i/192*Math.PI*2;if(STADIUM.pockets.some(p=>Math.abs(Math.atan2(Math.sin(a-p.angle),Math.cos(a-p.angle)))<p.halfWidth))continue;const rim=mesh(new THREE.TorusGeometry(STADIUM.radius,.008,8,2,Math.PI*2/192),0x4b68fa);rim.rotation.x=Math.PI/2;rim.rotation.z=a;scene.add(rim);}

  const outer=mesh(new THREE.TorusGeometry(.318,.012,12,96),0xd9e0ee); outer.rotation.x=Math.PI/2; outer.position.y=-.01; scene.add(outer);
  for(let i=0;i<64;i++){ const tooth=mesh(new THREE.BoxGeometry(.01,.008,.016),i%4===0?0x91a8ff:0x2944c1); const a=i/64*Math.PI*2; tooth.position.set(Math.cos(a)*STADIUM.railRadius,.005,Math.sin(a)*STADIUM.railRadius); tooth.rotation.y=-a;if(!STADIUM.pockets.some(p=>Math.abs(Math.atan2(Math.sin(a-p.angle),Math.cos(a-p.angle)))<p.halfWidth))scene.add(tooth); }
  for(const {angle:a,finish} of STADIUM.pockets) {const pocket=mesh(new THREE.BoxGeometry(.10,.014,.12),finish==='xtreme'?0xff7358:0x8d9cb8); pocket.position.set(Math.cos(a)*.267,-.012,Math.sin(a)*.267); pocket.rotation.y=-a+Math.PI/2;scene.add(pocket);}
  for(const r of [.06,.12,.18]) { const line=mesh(new THREE.TorusGeometry(r,.0007,4,80),0xc7d0e1);line.rotation.x=Math.PI/2;line.position.y=-.014;scene.add(line); }
  const center=mesh(new THREE.CylinderGeometry(.008,.008,.002,24),0x7184a5);center.position.y=-.013;scene.add(center);
  const groups:[THREE.Group,THREE.Group]=[new THREE.Group(),new THREE.Group()];
  let profileKey='';
  function setProfiles(profiles:[Profile,Profile]) { const key=profiles.map(p=>`${p.name}:${p.radius}:${p.color}`).join('|');if(key===profileKey)return;profileKey=key;groups.forEach((g,i)=>{ for(const child of [...g.children]) {g.remove(child);if(child instanceof THREE.Mesh){ child.geometry.dispose();geometries.delete(child.geometry);(child.material as THREE.Material).dispose();materials.delete(child.material as THREE.Material);}} const p=profiles[i]; const shell=mesh(new THREE.CylinderGeometry(p.radius,p.radius*.9,.012,p.type==='attack'?6:p.type==='stamina'?24:p.type==='defense'?12:8),0x9daabc,.26,.85);shell.position.y=.018;g.add(shell); const cap=mesh(new THREE.CylinderGeometry(p.radius*.75,p.radius*.85,.01,6),p.color,.3,.6);cap.position.y=.026;g.add(cap); const core=mesh(new THREE.CylinderGeometry(.008,.009,.005,12),0xf8fafc,.3,.2);core.position.y=.033;g.add(core); const tip=mesh(new THREE.ConeGeometry(.007,.016,12),p.color);tip.rotation.x=Math.PI;tip.position.y=.003;g.add(tip); const accent=mesh(new THREE.BoxGeometry(.032,.003,.005),0xffffff);accent.position.y=.034;g.add(accent);g.children.forEach(child=>{child.userData.baseY=child.position.y;}); }); }
  groups.forEach(g=>scene.add(g));
  function resize(){const rect=canvas.getBoundingClientRect(); renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(rect.height,1);camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function lost(event:Event){event.preventDefault();onError('描画が中断されました。画面を再読み込みしてください。');}canvas.addEventListener('webglcontextlost',lost);
  return {setProfiles,draw(battle:Battle|null,time:number){groups.forEach((g,i)=>{const top=battle?.tops[i];if(top){g.position.set(top.x,0,top.z);g.rotation.set(top.tilt*Math.cos(top.phase*.05),top.phase,top.tilt*Math.sin(top.phase*.05));g.visible=!top.eliminated || top.eliminated==='spin'||top.eliminated==='burst';if(top.eliminated==='burst'){g.children.forEach((part,j)=>{part.position.x=(j%2?1:-1)*.015*j;part.position.y=.012;});}else{g.children.forEach(part=>{part.position.x=0;part.position.y=Number(part.userData.baseY??0);});}}else{g.children.forEach(part=>{part.position.x=0;part.position.y=Number(part.userData.baseY??0);});g.position.set(i===0?-.09:.09,0,0);g.rotation.set(0,time*(i?-.4:.4),0);g.visible=true;}});renderer.render(scene,camera);},dispose(){observer.disconnect();canvas.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();}};
}
