import { CoreSimulation } from './core/simulation';
import { createView } from './rendering/scene';
import { createInput } from './input';
import { createAudio } from './audio';
import './style.css';
export function startPrototype(){
 const canvas=document.querySelector<HTMLCanvasElement>('#game')!,sim=new CoreSimulation(),audio=createAudio(),$=(id:string)=>document.getElementById(id)!;
 let active=false,paused=true,disposed=false,last=performance.now(),accumulator=0,raf=0,uiTimer=0,messageUntil=0,hitUntil=0,hurtUntil=0,debug=false;
 const view=createView(canvas,sim);const portrait=()=>innerHeight>innerWidth;
 function pause(){if(paused)return;paused=true;input.setEnabled(false);$('menu').hidden=false;$('menu-title').textContent='一息つく';$('start').textContent='再開';updateUI(performance.now());if(document.pointerLockElement)document.exitPointerLock();}
 const input=createInput(canvas,a=>sim.action(a,input.controls()),(x,y)=>sim.look(x,y),pause);document.body.classList.toggle('touch',input.mobile);
 function resize(){input.reset();$('rotate').hidden=!portrait();if(portrait())pause();view.resize();updateUI(performance.now());}
 async function begin(){if(portrait())return;active=true;paused=false;input.setEnabled(true);$('menu').hidden=true;audio.start();updateUI(performance.now());
  if(input.mobile){try{await document.documentElement.requestFullscreen();const orientation=screen.orientation as ScreenOrientation&{lock?:(value:string)=>Promise<void>};await orientation.lock?.('landscape');}catch{}}
  else await input.lock();
 }
 $('start').addEventListener('click',()=>void begin());$('menu-toggle').addEventListener('click',pause);$('restart').addEventListener('click',()=>location.reload());$('retry').addEventListener('click',()=>location.reload());$('day-toggle').addEventListener('click',()=>view.toggleDay());
 $('tool-switch').addEventListener('click',()=>{if(!paused)sim.action('tool',input.controls());});$('heal').addEventListener('click',()=>{if(!paused)sim.action('heal',input.controls());});
 document.addEventListener('keydown',e=>{if(e.code==='F3'){e.preventDefault();debug=!debug;$('diagnostics').hidden=!debug;}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('resize',resize);resize();
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('error').hidden=false;$('error').textContent='描画が停止しました。再読み込みしてください。';});
 function updateUI(now:number){
  const p=sim.player,target=sim.target();$('hp-fill').style.width=p.hp+'%';$('stamina-fill').style.width=p.stamina+'%';$('hp-value').textContent=String(Math.ceil(p.hp));$('stamina-value').textContent=String(Math.ceil(p.stamina));$('target').textContent=target?.label??'';$('prompt').textContent=target?.action??'';
  const interact=document.querySelector<HTMLButtonElement>('[data-action="interact"]')!;interact.hidden=!target?.action.startsWith('E /');interact.disabled=p.phase!=='idle';interact.textContent=target?.action.replace('E / 操作 · ','')??'操作';if(target?.action.startsWith('E /'))$('prompt').textContent=p.phase!=='idle'?'硬直中':input.mobile?target.action.replace('E / 操作 · ',''):target.action;$('enemy-health').hidden=!target?.enemy;if(target?.enemy)$('enemy-fill').style.width=target.enemy.hp+'%';
  $('tool-switch').textContent=p.tool?'2 鑿':'1 剣';$('heal').textContent='Q 回復 ×'+p.flasks;$('objective').textContent=sim.defeated===2?'試練完了 · 碑で再挑戦':sim.arena.objects.get('door')?.open?'番兵を倒す · '+sim.defeated+'/2':'扉に近づき、照準を合わせて開く';$('reticle').classList.toggle('hit',now<hitUntil);$('hurt').style.opacity=now<hurtUntil?'1':'0';if(now>messageUntil)$('message').textContent='';
  if(p.hp<=0){$('death').hidden=false;input.setEnabled(false);paused=true;}
  if(debug)$('diagnostics').textContent=JSON.stringify({waterCell:.125,waterM3:sim.water.total().toFixed(3),solidVoxels:sim.arena.field.cells.size,...view.stats()},null,2);
  canvas.dataset.ready='true';canvas.dataset.running=String(active&&!paused&&!portrait());canvas.dataset.target=target?.hit.cell.object??'';
 }
 if(new URLSearchParams(location.search).has('test'))Object.defineProperty(window,'__coreProbe',{configurable:true,get:()=>({position:{...sim.player.position},hp:sim.player.hp,stamina:sim.player.stamina,phase:sim.player.phase,seconds:sim.seconds,yaw:sim.player.yaw,pitch:sim.player.pitch,door:sim.arena.objects.get('door')?.open,tool:sim.player.tool,water:sim.water.total(),target:sim.target()?.hit.cell.object,stats:view.stats()})});
 function frame(now:number){if(disposed)return;const dt=Math.min(.1,(now-last)/1000);last=now;
  if(active&&!paused&&!portrait()&&!document.hidden){accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps++<6){sim.tick(1/60,input.controls());accumulator-=1/60;}}else accumulator=0;
  for(const e of sim.events.splice(0)){audio.play(e.kind);if(e.text){$('message').textContent=e.text;messageUntil=now+1800;}if(e.kind==='hit'||e.kind==='parry')hitUntil=now+180;if(e.kind==='hurt')hurtUntil=now+350;}
  uiTimer+=dt;if(uiTimer>=.08){updateUI(now);uiTimer=0;}view.render(dt,input.controls().block);raf=requestAnimationFrame(frame);
 }
 raf=requestAnimationFrame(frame);const dispose=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);input.dispose();view.dispose();audio.dispose();};window.addEventListener('pagehide',e=>{if(!e.persisted)dispose();else pause();});return {dispose};
}
