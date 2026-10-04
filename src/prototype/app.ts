import { CoreSimulation } from './core/simulation';
import { createView } from './rendering/scene';
import { createInput } from './input';
import { createAudio } from './audio';
import { materialDefinition } from './core/materials';
import { key } from './core/voxel';
import { materialColors } from './rendering/element-effects';
import './style.css';
export function startPrototype(){
 const canvas=document.querySelector<HTMLCanvasElement>('#game')!,sim=new CoreSimulation(),audio=createAudio(),$=(id:string)=>document.getElementById(id)!;
 let active=false,paused=true,disposed=false,last=performance.now(),accumulator=0,raf=0,uiTimer=0,messageUntil=0,hitUntil=0,hurtUntil=0,debug=false,timeScale=1;
 const elementNames={fire:'火',water:'水',earth:'土',wind:'風',lightning:'雷'},elementColors={fire:'#ffac6c',water:'#8bd4ff',earth:'#dfbd85',wind:'#b7edc5',lightning:'#d6b7ff'};
 const materialNames:Record<number,string>={1:'地面',2:'土',3:'石',4:'木材',5:'木材',6:'金属',7:'草',8:'碑石',9:'灯火',10:'布'};
 const inventoryNodes=[4,3,2,6,7].map(id=>{const node=document.createElement('span');node.style.color=materialColors[id];$('inventory').append(node);return {id,node};});
 const dropCountNode=document.createElement('span');dropCountNode.id='drop-count';$('inventory').append(dropCountNode);
 const view=createView(canvas,sim);const portrait=()=>innerHeight>innerWidth;
 function pause(){if(paused)return;paused=true;input.setEnabled(false);$('menu').hidden=false;$('menu-title').textContent='一息つく';$('start').textContent='再開';updateUI(performance.now());if(document.pointerLockElement)document.exitPointerLock();}
 const input=createInput(canvas,a=>sim.action(a,input.controls()),(x,y)=>sim.look(x,y),pause);document.body.classList.toggle('touch',input.mobile);
 function resize(){input.reset();$('rotate').hidden=!portrait();if(portrait())pause();view.resize();updateUI(performance.now());}
 async function begin(){if(portrait())return;active=true;paused=false;input.setEnabled(true);$('menu').hidden=true;audio.start();updateUI(performance.now());
  if(input.mobile){try{await document.documentElement.requestFullscreen();const orientation=screen.orientation as ScreenOrientation&{lock?:(value:string)=>Promise<void>};await orientation.lock?.('landscape');}catch{}}
  else await input.lock();
 }
 $('start').addEventListener('click',()=>void begin());$('menu-toggle').addEventListener('click',pause);$('restart').addEventListener('click',()=>location.reload());$('retry').addEventListener('click',()=>location.reload());$('day-toggle').addEventListener('click',()=>view.toggleDay());
 const toggleMotion=()=>{timeScale=timeScale===1?.25:1;$('motion-toggle').textContent='動作：'+(timeScale===1?'通常':'1/4');};$('motion-toggle').addEventListener('click',toggleMotion);
 $('tool-switch').addEventListener('click',()=>{if(!paused)sim.action('tool',input.controls());});$('heal').addEventListener('click',()=>{if(!paused)sim.action('heal',input.controls());});
 document.addEventListener('keydown',e=>{if(e.code==='F4'){e.preventDefault();toggleMotion();}if(e.code==='F3'){e.preventDefault();debug=!debug;$('diagnostics').hidden=!debug;}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('resize',resize);resize();
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('error').hidden=false;$('error').textContent='描画が停止しました。再読み込みしてください。';});
 function updateUI(now:number){
  const p=sim.player,target=sim.target();
  for(const {id,node} of inventoryNodes)node.textContent=materialNames[id]+' '+(sim.survival.inventory[id]??0);
  dropCountNode.textContent='未回収 '+[...sim.survival.drops,...sim.survival.pendingDrops].reduce((sum,d)=>sum+d.count,0);
  const element=sim.selectedElement,recipe=sim.survival.recipe,prefix=input.mobile?'':'F ';
  $('element-switch').textContent=prefix+elementNames[element]+' ▸';$('element-switch').style.setProperty('--element-color',elementColors[element]);
  $('cast').textContent=(input.mobile?'':'G ')+'放つ';$('recipe-switch').textContent=(input.mobile?'':'V ')+recipe.label+' ▸';$('build').textContent=(input.mobile?'':'B ')+'置く';
  $('recipe-cost').textContent='木材 '+recipe.cost+' / '+(sim.survival.inventory[4]??0)+(recipe.id==='workbench'?' · 地面を狙って設置':' · 作業台の3m以内')+' · 素材は近づいて回収';
  for(const id of ['element-switch','cast','recipe-switch','build'])($(id) as HTMLButtonElement).disabled=paused||p.hp<=0||(id==='cast'||id==='build')&&p.phase!=='idle';
  const cell=target?.hit.cell??null,reactions=target?.enemy?sim.enemyElements[target.enemy.id].reactions:sim.elements,state=cell?reactions.states.get(key(cell.x,cell.y,cell.z)):undefined;
  $('material-status').textContent=cell?(materialNames[cell.material]??materialDefinition(cell.material).name)+' · 耐久 '+Math.ceil(reactions.durability(cell))+'/'+materialDefinition(cell.material).durability+(state?.fire?' · 燃焼':'')+(state?.wet?' · 濡れ':'')+(state?.charge?' · 帯電':''):'';
$('hp-fill').style.width=p.hp+'%';$('stamina-fill').style.width=p.stamina+'%';$('hp-value').textContent=String(Math.ceil(p.hp));$('stamina-value').textContent=String(Math.ceil(p.stamina));$('target').textContent=target?.label??'';$('prompt').textContent=target?.action??'';
  const interact=document.querySelector<HTMLButtonElement>('[data-action="interact"]')!;interact.hidden=!target?.action.startsWith('E /');interact.disabled=p.phase!=='idle';interact.textContent=target?.action.replace('E / 操作 · ','')??'操作';if(target?.action.startsWith('E /'))$('prompt').textContent=p.phase!=='idle'?'硬直中':input.mobile?target.action.replace('E / 操作 · ',''):target.action;$('enemy-health').hidden=!target?.enemy;if(target?.enemy)$('enemy-fill').style.width=target.enemy.hp+'%';
  $('tool-switch').textContent=p.tool?'2 鑿':'1 剣';$('heal').textContent=p.phase==='heal'?'服薬中…':'Q 回復 ×'+p.flasks;($('heal') as HTMLButtonElement).disabled=p.phase!=='idle'||!p.flasks||p.hp>=100;$('objective').textContent=sim.defeated===2?'試練完了 · 碑で再挑戦':sim.arena.objects.get('door')?.open?'番兵を倒す · '+sim.defeated+'/2':'扉に近づき、照準を合わせて開く';$('reticle').classList.toggle('hit',now<hitUntil);$('hurt').style.opacity=now<hurtUntil?'1':'0';if(now>messageUntil)$('message').textContent='';
  if(p.hp<=0){$('death').hidden=false;input.setEnabled(false);paused=true;}
  if(debug)$('diagnostics').textContent=JSON.stringify({waterCell:.125,waterM3:sim.water.total().toFixed(3),solidVoxels:sim.arena.field.cells.size,...view.stats()},null,2);
  canvas.dataset.ready='true';canvas.dataset.running=String(active&&!paused&&!portrait());canvas.dataset.target=target?.hit.cell.object??'';
 }
 if(new URLSearchParams(location.search).has('test'))Object.defineProperty(window,'__coreProbe',{configurable:true,get:()=>({position:{...sim.player.position},hp:sim.player.hp,stamina:sim.player.stamina,phase:sim.player.phase,phaseTime:sim.player.time,attack:sim.player.attack,weapon:sim.pose(),timeScale,enemies:sim.enemies.map(e=>({position:{...e.position},phase:e.phase,time:e.time,hp:e.hp,burning:sim.enemyElements[e.id].burning,wet:sim.enemyElements[e.id].wet,shock:sim.enemyElements[e.id].shock,voxelRevision:sim.enemyElements[e.id].field.revision,scars:sim.enemyElements[e.id].scars.length})),seconds:sim.seconds,yaw:sim.player.yaw,pitch:sim.player.pitch,door:sim.arena.objects.get('door')?.open,tool:sim.player.tool,selectedElement:sim.selectedElement,selectedRecipe:sim.selectedRecipe,inventory:{...sim.survival.inventory},drops:sim.survival.drops.map(d=>({...d,position:{...d.position}})),elementStates:sim.elements.states.size,burning:[...sim.elements.states.values()].filter(s=>s.fire>0).length,wet:[...sim.elements.states.values()].filter(s=>s.wet>0).length,charged:[...sim.elements.states.values()].filter(s=>s.charge>0).length,elementEffects:sim.elements.effects.length,water:sim.water.total(),target:sim.target()?.hit.cell.object,stats:view.stats()})});
 function frame(now:number){if(disposed)return;const dt=Math.min(.1,(now-last)/1000);last=now;
  if(active&&!paused&&!portrait()&&!document.hidden){accumulator+=dt*timeScale;let steps=0;while(accumulator>=1/60&&steps++<6){sim.tick(1/60,input.controls());accumulator-=1/60;}}else accumulator=0;
  for(const e of sim.events.splice(0)){audio.play(e.kind);if(e.text){$('message').textContent=e.text;messageUntil=now+1800;}if(e.kind==='hit'||e.kind==='parry')hitUntil=now+180;if(e.kind==='hurt')hurtUntil=now+350;}
  uiTimer+=dt;if(uiTimer>=.08){updateUI(now);uiTimer=0;}view.render(dt,input.controls().block);raf=requestAnimationFrame(frame);
 }
 raf=requestAnimationFrame(frame);const dispose=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);input.dispose();view.dispose();audio.dispose();};window.addEventListener('pagehide',e=>{if(!e.persisted)dispose();else pause();});return {dispose};
}
