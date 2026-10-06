import {expect,type Page} from '@playwright/test';
import {PlayerControls,type Point} from './campaign-controls';
import {readRegional,readRegionalMotion} from './regional-evidence';
import {consumeRegional,craftRegional} from './regional-transactions';

type Motion=Awaited<ReturnType<typeof readRegionalMotion>>;
type Enemy=Motion['enemies'][number];
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
const distance=(p:Motion,e:Enemy)=>Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z);

/** Desktop-only reactive route. Every write is a real production keyboard or
 * menu input. The small probe observes tells; it cannot invoke game actions. */
export class RegionalCombatControls {
 casts=0;doses=0;waterCasts=0;lightningCasts=0;
 private held=new Set<string>();private reacted=new Set<string>();private north=true;
 private shoreAim={dx:0,dy:1.2};
 constructor(private page:Page,private controls:PlayerControls){}
 async index(regional:number){const p=await readRegionalMotion(this.page),index=p.enemies.findIndex(e=>e.regional===regional);expect(index,'Authored regional enemy '+regional).toBeGreaterThanOrEqual(0);return index;}
 private async key(key:string,down:boolean){if(down===this.held.has(key))return;if(down){await this.page.keyboard.down(key);this.held.add(key);}else{await this.page.keyboard.up(key);this.held.delete(key);}}
 private async axes(x:number,z:number){await this.key('KeyW',z>.38);await this.key('KeyS',z<-.38);await this.key('KeyD',x>.38);await this.key('KeyA',x<-.38);}
 async stop(){for(const key of [...this.held])await this.key(key,false);}
 private async alive(){const p=await readRegionalMotion(this.page);expect(p.hp,'Regional input must stop on death').toBeGreaterThan(0);return p;}
 private async evade(p:Motion,index:number,shore=false){
  const e=p.enemies[index],tell=e.tell;if(!tell)return;const id=`${index}:${tell.serial}:${tell.kind}`;if(this.reacted.has(id))return;
  if(p.grounded&&!p.pending&&p.stamina>=12&&tell.kind==='burst'&&tell.remaining<.3){this.reacted.add(id);await this.controls.action('[data-action=jump]','Space');}
  else if(shore&&p.phase==='idle'&&tell.kind==='lunge'&&tell.remaining<.13&&p.stamina>=24){this.reacted.add(id);await this.controls.action('[data-action=dodge]','ControlLeft');}
 }
 /** React to a visible burst while precision look is being delivered. Only the
  * jump key is shared with this observer; look and movement are not overridden. */
 private async guardedAim(point:Point,index:number){
  let stopped=false,failure:unknown;
  const watch=(async()=>{try{while(!stopped){await this.evade(await this.alive(),index);await this.page.waitForTimeout(50);}}catch(error){failure=error;}})();
  try{await this.controls.aim(point,true);}finally{stopped=true;await watch;await this.controls.shield(false);}
  if(failure)throw failure;
 }
 private async until(done:(p:Motion)=>boolean,seconds:number,drive:(p:Motion)=>Promise<void>,label:string){
  const start=await this.alive(),wall=Date.now();
  try{for(;;){const p=await this.alive();if(done(p))return;expect(p.seconds-start.seconds,label+' simulation-time bound').toBeLessThan(seconds);expect(Date.now()-wall,label+' input delivery bound').toBeLessThan(90000);await drive(p);await this.page.waitForTimeout(50);}}
  finally{await this.stop();}
 }
 private async forSeconds(seconds:number,drive:(p:Motion)=>Promise<void>,label:string){const start=(await this.alive()).seconds;await this.until(p=>p.seconds>=start+seconds,seconds+.2,drive,label);}
 private async sideStep(p:Motion,minX:number,maxX:number){
  expect(p.position.x,'Combat must remain on the authored shelf').toBeGreaterThan(minX-1);expect(p.position.x).toBeLessThan(maxX+1);
  const side=p.position.x>(minX+maxX)/2?-1:1;await this.axes(Math.cos(p.yaw)*side,-Math.sin(p.yaw)*side);
 }
 private async idle(){await this.until(p=>p.phase==='idle',5,async()=>{},'combat recovery');}
 private async heal(){await this.stop();await this.controls.shield(false);await this.controls.healFromInventory();}
 private async attack(index:number,focus=false){
  const handle=await this.page.evaluateHandle(()=>{let seen=false;const timer=setInterval(()=>{const p=Reflect.get(window,'__inputProbe') as {phase:string};if(['windup','strike','recover','cast'].includes(p.phase))seen=true;},10);return {read:()=>seen,stop:()=>clearInterval(timer)};});
  try{
   await this.controls.action(focus?'#special':'[data-action=attack]',focus?'KeyX':'KeyT');await expect.poll(()=>handle.evaluate(v=>v.read())).toBe(true);
   await this.until(p=>p.phase==='idle',4,async p=>{await this.evade(p,index);await this.axes(0,distance(p,p.enemies[index])>1.2?1:0);},'committed melee recovery');
  }finally{await handle.evaluate(v=>v.stop()).catch(()=>{});await handle.dispose().catch(()=>{});}
 }
 async approachDuel(index:number,minX:number,maxX:number){
  for(let round=0;round<18&&(await this.alive()).enemies[index].hp>0;round++){
   await this.idle();await this.heal();let p=await this.alive(),e=p.enemies[index];await this.guardedAim({...e.position,y:e.position.y+1.2},index);p=await this.alive();
   if(p.stamina<45){await this.forSeconds(2.6,q=>this.sideStep(q,minX,maxX),'finite melee stamina recovery');continue;}
   await this.controls.shield(true);
   try{
    await this.until(q=>q.enemies[index].hp<=0||distance(q,q.enemies[index])<1.5,8,async()=>this.axes(0,1),'close inside melee reach');
    e=(await this.alive()).enemies[index];if(e.hp<=0)break;
    await this.controls.aim({...e.position,y:e.position.y+1.2},true);
    // Observe a new opening; a recovery spent approaching is not a free hit.
    if(['recover','stagger'].includes((await this.alive()).enemies[index].phase))await this.until(q=>q.enemies[index].hp<=0||!['recover','stagger'].includes(q.enemies[index].phase),12,async()=>{},'next melee attack');
    await this.until(q=>['recover','stagger','dead'].includes(q.enemies[index].phase),12,async()=>{},'guard approaching melee enemy');
   }finally{await this.controls.shield(false);}
   if((await this.alive()).enemies[index].hp>0)await this.attack(index);
  }
  expect((await this.alive()).enemies[index].hp,'Approaching regional melee enemy must be defeated').toBeLessThanOrEqual(0);
 }
 async assault(index:number,minX=25.1,maxX=29){
  for(let cycle=0;cycle<70&&(await this.alive()).enemies[index].hp>0;cycle++){
   await this.idle();await this.heal();const p=await this.alive(),boss=p.enemies[index];
   const nearby=distance(p,boss)>2.3?p.enemies.find(e=>e.hp>0&&e.summonOwner!==null&&distance(p,e)<1.4):undefined,e=nearby??boss;
   await this.guardedAim({...e.position,y:e.position.y+1.2},index);
   const ready=await this.alive();
   if(ready.stamina<25){await this.forSeconds(3,async q=>{await this.evade(q,index);await this.sideStep(q,minX,maxX);},'finite assault stamina recovery');continue;}
   if(distance(ready,ready.enemies[e.id])>1.5){await this.forSeconds(.3,async q=>{await this.evade(q,index);await this.axes(0,1);},'close on caster');continue;}
   await this.attack(index,ready.focus>=100);
  }
  expect((await this.alive()).enemies[index].hp,'Regional group must be defeated within 70 ordinary attack cycles').toBeLessThanOrEqual(0);
 }
 private async shoreMove(p:Motion,index:number,track=false){
  expect(p.position.x,'Do not leave the western shore').toBeGreaterThan(8);expect(p.position.x).toBeLessThan(10.8);expect(p.position.z).toBeGreaterThan(-51.3);expect(p.position.z).toBeLessThan(-46.5);
  if(p.position.z< -50)this.north=false;if(p.position.z> -47.5)this.north=true;
  // Keyboard octants follow the same real shore strip. Correct drift toward its
  // center before another cast; never walk into the water to chase the guardian.
  const vx=p.position.x<9.1?1:p.position.x>10?-1:0,vz=this.north?-1:1;
  // The browser's real fine-look rate cannot reproduce Core's instant tracking
  // while strafing. Plant on the bank for the finite .45-second pending cast,
  // retain its chosen material aim, then resume the ordinary shore movement.
  if(track&&p.pending)await this.axes(0,0);
  else await this.axes(Math.cos(p.yaw)*vx-Math.sin(p.yaw)*vz,-Math.sin(p.yaw)*vx-Math.cos(p.yaw)*vz);
  await this.evade(p,index,true);
  if(track&&p.pending){const e=p.enemies[index],dx=e.position.x+this.shoreAim.dx-p.position.x,dz=e.position.z-p.position.z,yaw=angle(Math.atan2(-dx,-dz)-p.yaw),pitch=Math.atan2(e.position.y+this.shoreAim.dy-p.position.y-1.52,Math.hypot(dx,dz))-p.pitch;
   await this.key('ShiftLeft',true);await this.key('Home',yaw>.015);await this.key('End',yaw<-.015);await this.key('PageUp',pitch>.015);await this.key('PageDown',pitch<-.015);
  }else for(const key of ['ShiftLeft','Home','End','PageUp','PageDown'])await this.key(key,false);
 }
 async shoreDuel(index:number){
  const initial=await readRegional(this.page),initialMana=initial.combat.mana,initialDoses=initial.campaign.items['mana-draught'];
  for(let cycle=0;cycle<50&&(await this.alive()).enemies[index].hp>0;cycle++){
   await this.idle();await this.heal();const p=await readRegional(this.page);
   if(p.hp<65&&!p.campaign.items.bandage&&p.inventory[7]>=3&&p.inventory[10]>=1){await craftRegional(this.page,this.controls,'bandage',1);await this.heal();}
   await this.until(q=>{const tell=q.enemies[index].tell;return !tell||!['burst','lunge'].includes(tell.kind)||tell.remaining>=.9;},2,q=>this.shoreMove(q,index),'finish imminent guardian tell');
   let ready=await this.alive();
   if(ready.stamina<30){await this.forSeconds(2.6,q=>this.shoreMove(q,index),'finite shoreline stamina recovery');continue;}
   const element=ready.enemies[index].wet>1?'lightning':'water';for(let n=0;n<5&&(await this.alive()).selectedElement!==element;n++)await this.controls.action('#element-switch','KeyF');expect((await this.alive()).selectedElement).toBe(element);
   if(ready.mana<20){await consumeRegional(this.page,this.controls,'mana-draught');this.doses++;}
   // Exact visible name proves that real aim hits surviving enemy material.
   for(const [dx,dy] of [[0,1.2],[0,1.55],[0,.8],[0,.45],[-.25,1.1],[.25,1.1],[-.18,.35],[.18,.35]]){
    const q=await this.alive(),e=q.enemies[index];if(e.hp<=0)break;await this.guardedAim({x:e.position.x+dx,y:e.position.y+dy,z:e.position.z},index);if(await this.page.locator('#target').textContent()===e.name){this.shoreAim={dx,dy};break;}
   }
   ready=await this.alive();if(ready.enemies[index].hp<=0)break;await expect(this.page.locator('#target')).toHaveText(ready.enemies[index].name);
   if(ready.stamina<30){await this.forSeconds(2.6,q=>this.shoreMove(q,index),'finite shoreline stamina recovery');continue;}
   // Precision input can take longer than the Core route's instant look. Read
   // the current tell again before committing to the stationary casting window.
   const tell=ready.enemies[index].tell;
   if(tell&&['burst','lunge'].includes(tell.kind)&&tell.remaining<.9){await this.until(q=>!q.enemies[index].tell,2,q=>this.shoreMove(q,index),'evade tell that began while aiming');continue;}
   expect(ready.mana).toBeGreaterThanOrEqual(20);
   await this.controls.action('#cast','KeyG');await expect.poll(async()=>(await readRegionalMotion(this.page)).mana).toBe(ready.mana-20);this.casts++;if(element==='water')this.waterCasts++;else this.lightningCasts++;
   // No Focus/earth/wind here: a melee impulse can put the enemy under the bank.
   await this.forSeconds(2.2,q=>this.shoreMove(q,index,true),'committed water/lightning cast and shoreline recovery');
  }
  const done=await readRegional(this.page);expect(done.enemies[index].hp,'Final guardian must fall to finite water/lightning spells').toBeLessThanOrEqual(0);expect(this.casts).toBeGreaterThan(0);expect(this.waterCasts).toBeGreaterThan(0);expect(this.lightningCasts).toBeGreaterThan(0);expect(done.campaign.items['mana-draught']).toBe(initialDoses-this.doses);expect(done.combat.mana).toBe(initialMana+this.doses*60-this.casts*20);expect(done.campaign.deaths).toBe(0);
 }
 /** Swim using the same production forward key, bounded by oxygen and time. */
 async swim(done:(p:Motion)=>boolean,seconds:number,label:string){await this.until(done,seconds,async p=>{expect(p.oxygen,label+' must leave oxygen to return').toBeGreaterThan(0);await this.axes(0,1);},label);}
}
