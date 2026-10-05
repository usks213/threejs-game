import {test,expect,type Page,type CDPSession} from '@playwright/test';

export interface Point {x:number;y:number;z:number}
export interface CampaignProbe {
 position:Point;yaw:number;pitch:number;phase:string;seconds:number;tool:boolean;hp:number;stamina:number;gliding:boolean;grapple:Point|null;enemies:{position:Point;phase:string;time:number;hp:number}[];
 streamedWorld:boolean;worldSamples:number[];restoreFailure:string|null;settings:{graphics:'balanced'|'performance'|'high'};stats:{graphics:string;worldResidency:{bucketScans:number;provider:null|{numericCacheBytes:number;numericCacheBudgetBytes:number;cachedBlocks:number;cacheEvictions:number;[key:string]:number}}};
 inventory:Record<number,number>;target?:string;worldReady:boolean;saveStatus:string;
 campaign:{flameTier:number;completed:string[];artisanRescued:boolean;deaths:number;items:Record<string,number>;equipment:Record<string,string|null>;campUnlocked:boolean;gateOpen:boolean};
}
// Observation only. No test writes to game state, invokes actions, or seeds storage.
export const read=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as CampaignProbe);
const motion=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__inputProbe') as Pick<CampaignProbe,'position'|'hp'|'stamina'|'phase'|'seconds'|'yaw'|'pitch'|'enemies'>);
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));

export class PlayerControls {
 private touch:CDPSession|null=null;
 private liveTouch=false;
 private usedFlask=false;
 constructor(private page:Page,private mobile:boolean){}
 async initialize(){
  if(this.mobile)this.touch=await this.page.context().newCDPSession(this.page);
  else await expect.poll(()=>this.page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
 }
 async endTouch(){if(!this.touch||!this.liveTouch)return;this.liveTouch=false;await this.touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 async dispose(){if(!this.mobile)for(const key of ['KeyW','KeyS','KeyA','KeyD','KeyZ','ShiftLeft','Home','End','PageUp','PageDown'])await this.page.keyboard.up(key).catch(()=>{});if(this.touch){await this.endTouch().catch(()=>{});await this.touch.detach().catch(()=>{});this.touch=null;}}
 async action(selector:string,key:string){
  if(!this.mobile){await this.page.keyboard.press(key);return;}
  // Use a real touch on the visible control. Locator.tap's scrolling/stability
  // round trips can consume an entire combat opening on software-rendered CI.
  const control=this.page.locator(selector);await expect(control).toBeEnabled();
  const point=await control.evaluate(element=>{const r=element.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,visible:r.width>0&&r.height>0&&!!hit&&element.contains(hit)};});
  expect(point.visible,'The real action control must be visible and unobstructed').toBe(true);
  await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:9,x:point.x,y:point.y}]});this.liveTouch=true;await this.endTouch();
 }
 async aim(point:Point){
  expect((await motion(this.page)).hp,'Aiming requires a living player; report combat death before input accuracy').toBeGreaterThan(0);await expect(this.page.locator('#death')).toBeHidden();await expect(this.page.locator('#game')).toHaveAttribute('data-running','true');
  await expect.poll(async()=>(await motion(this.page)).phase).toBe('idle');
  if(!this.mobile){await this.keyboardAim(point);return;}
  for(let attempt=0;attempt<8;attempt++){
   const p=await motion(this.page);expect(p.hp,'Touch aiming must not continue on the death overlay').toBeGreaterThan(0);const dx=point.x-p.position.x,dz=point.z-p.position.z,dy=point.y-p.position.y-1.52;
   const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz)),yawError=angle(yaw-p.yaw),pitchError=pitch-p.pitch;
   if(Math.abs(yawError)<.015&&Math.abs(pitchError)<.015)return;
   if(this.mobile){
    const mx=-yawError/.004,my=-pitchError/.004,steps=Math.max(1,Math.ceil(Math.max(Math.abs(mx)/140,Math.abs(my)/65)));
    for(let i=0;i<steps;i++){const location=await this.lookPoint(),before=await motion(this.page),finger={...location,id:7};await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});this.liveTouch=true;await this.touch!.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...finger,x:finger.x+mx/steps,y:finger.y+my/steps}]});await this.endTouch();await expect.poll(async()=>{const p=await motion(this.page);expect(p.hp,'Player died during a touch-look gesture').toBeGreaterThan(0);return Math.abs(angle(p.yaw-before.yaw))+Math.abs(p.pitch-before.pitch);},{timeout:15000,intervals:[50,100]}).toBeGreaterThan(.001);}
   }
  }
  const p=await motion(this.page),yaw=Math.atan2(-(point.x-p.position.x),-(point.z-p.position.z)),pitch=Math.atan2(point.y-p.position.y-1.52,Math.hypot(point.x-p.position.x,point.z-p.position.z));
  expect(Math.abs(angle(yaw-p.yaw)),'Real pointer input must reach requested yaw').toBeLessThan(.035);
  expect(Math.abs(pitch-p.pitch),'Real pointer input must reach requested pitch').toBeLessThan(.035);
 }
 async lookPoint(){
  // Read the current hit-test surface. HUD, interaction panels, and overlays can
  // change with the viewport; never assume a fixed pixel belongs to the look pad.
  const point=await this.page.evaluate(()=>{const pad=document.querySelector('#look-pad');for(const y of [.43,.5,.36,.58])for(const x of [.65,.55,.75,.45]){const px=innerWidth*x,py=innerHeight*y;if(document.elementFromPoint(px,py)===pad)return {x:px,y:py};}return null;});
  expect(point,'A visible unobstructed look-pad point must be available').not.toBeNull();return point!;
 }
 async keyboardAim(point:Point){
  // Genuine production accessibility keys. CDP absolute mouseMove does not
  // synthesize Pointer Lock's raw relative motion, so this is labeled separately.
  const error=async(axis:'yaw'|'pitch')=>{const p=await motion(this.page);expect(p.hp,'Keyboard aiming must not continue after combat death').toBeGreaterThan(0);const dx=point.x-p.position.x,dz=point.z-p.position.z;return axis==='yaw'?angle(Math.atan2(-dx,-dz)-p.yaw):Math.atan2(point.y-p.position.y-1.52,Math.hypot(dx,dz))-p.pitch;};
  for(const axis of ['yaw','pitch'] as const){
   let precise=false;
   for(let attempt=0;attempt<12;attempt++){
    const remaining=await error(axis);if(Math.abs(remaining)<.015)break;
    // Coarse look advances at most .14 rad per frame; reserve the .0056-rad
    // Shift steps for the last .16 rad, rather than spending up to 9 seconds
    // of simulation time on a medium .5-rad turn. A coarse stop near .1 rad
    // leaves room for one frame of overshoot before the precision correction.
    const sign=Math.sign(remaining),fine=precise||Math.abs(remaining)<.16,key=axis==='yaw'?(sign>0?'Home':'End'):(sign>0?'PageUp':'PageDown');
    try{if(fine)await this.page.keyboard.down('ShiftLeft');await this.page.keyboard.down(key);await expect.poll(async()=>sign*await error(axis),{timeout:90000,intervals:[50,100]}).toBeLessThan(fine?.012:.1);}
    finally{await this.page.keyboard.up(key);if(fine)await this.page.keyboard.up('ShiftLeft');}
    // A delayed key-up may overshoot the fine window. Once the coarse pass
    // finishes, correct in fine mode instead of oscillating with coarse turns.
    precise=true;
   }
   expect(Math.abs(await error(axis)),`Actual keyboard look must reach requested ${axis}`).toBeLessThan(.035);
  }
 }
 async walkTo(x:number,z:number){
  const start=await motion(this.page),dx=x-start.position.x,dz=z-start.position.z,length=Math.hypot(dx,dz);if(length<.18)return;
  await this.aim({x,y:start.position.y+1.52,z});
  let movementFailed=false;try{
   if(this.mobile){const box=await this.page.locator('#move-pad').boundingBox();expect(box).not.toBeNull();await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:box!.x+box!.width/2,y:box!.y+10}]});this.liveTouch=true;}
   else await this.page.keyboard.down('KeyW');
   await expect.poll(async()=>{const p=await motion(this.page);expect(p.hp,'Player must survive the gathering route').toBeGreaterThan(0);return ((x-p.position.x)*dx+(z-p.position.z)*dz)/length;},{timeout:60000,intervals:[50,100]}).toBeLessThan(.18);
  }catch(error){movementFailed=true;throw error;}finally{try{if(this.mobile)await this.endTouch();else await this.page.keyboard.up('KeyW');}catch(error){if(!movementFailed)throw error;}}
  const seconds=(await motion(this.page)).seconds;await expect.poll(async()=>(await motion(this.page)).seconds,{intervals:[50,100]}).toBeGreaterThan(seconds+.15);
 }
 async gather(material:number,minimum:number,points:Point[],object:string){
  for(let i=0;i<20&&(await read(this.page)).inventory[material]<minimum;i++){
   await this.aim(points[i%points.length]);
   // A mined patch may expose another part or terrain. Do not call private hit APIs.
   if((await read(this.page)).target!==object)continue;
   await this.action('[data-action="heavy"]','KeyR');
   await expect.poll(async()=>(await motion(this.page)).phase,{intervals:[50,100]}).not.toBe('idle');
   await expect.poll(async()=>(await motion(this.page)).phase,{timeout:60000,intervals:[100]}).toBe('idle');
   const seconds=(await motion(this.page)).seconds;await expect.poll(async()=>(await motion(this.page)).seconds,{intervals:[100]}).toBeGreaterThan(seconds+.3);
  }
  expect((await read(this.page)).inventory[material],`Actual chisel strikes and nearby pickup must gather material ${material}`).toBeGreaterThanOrEqual(minimum);
 }
 async activate(selector:string){if(this.mobile)await this.page.locator(selector).tap();else await this.page.locator(selector).click();}
 async menu(tab:string){await this.action('#campaign-toggle','KeyI');await expect(this.page.locator('#campaign-panel')).toBeVisible();await this.activate(`[data-tab="${tab}"]`);}
 async resume(){const button=this.page.getByRole('button',{name:'探索に戻る',exact:true});if(this.mobile)await button.tap();else await button.click();await expect(this.page.locator('#game')).toHaveAttribute('data-running','true');}
 async row(id:string,action:string){const button=this.page.locator(`[data-item="${id}"] [data-command="${action}"]`);await expect(button).toBeEnabled();if(this.mobile)await button.tap();else await button.click();}
 async interact(id:string,point:Point){await this.aim(point);await expect(this.page.locator('#game')).toHaveAttribute('data-target',id);await this.action('[data-action="interact"]','KeyE');}
 async shield(held:boolean){
  if(!this.mobile){if(held)await this.page.keyboard.down('KeyZ');else await this.page.keyboard.up('KeyZ');return;}
  if(!held){await this.endTouch();return;}const box=await this.page.locator('[data-action="block"]').boundingBox();expect(box).not.toBeNull();await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:8,x:box!.x+box!.width/2,y:box!.y+box!.height/2}]});this.liveTouch=true;
 }
 async retreat(){
  const state=await read(this.page),start=state.seconds;
  // Repeated backsteps can leave the southern cliff. Strafe while recovering
  // stamina there; choose the lateral direction that stays north when possible.
  const side=state.position.z>6?(Math.abs(Math.sin(state.yaw))>.15?Math.sign(Math.sin(state.yaw)):state.position.x>5?-1:1):0,key=side>0?'KeyD':side<0?'KeyA':'KeyS';
  try{if(this.mobile){const b=await this.page.locator('#move-pad').boundingBox();expect(b).not.toBeNull();await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:b!.x+b!.width/2+side*(b!.width/2-10),y:side?b!.y+b!.height/2:b!.y+b!.height-10}]});this.liveTouch=true;}else await this.page.keyboard.down(key);
   await expect.poll(async()=>{const p=await read(this.page);expect(p.hp,'Stamina recovery must remain on safe terrain').toBeGreaterThan(0);return p.seconds;},{timeout:60000}).toBeGreaterThan(start+2.6);
  }finally{if(this.mobile)await this.endTouch();else await this.page.keyboard.up(key);}
 }
 async healFromInventory(){
  const p=await read(this.page);if(p.hp>=70)return;
  if(!(p.campaign.items.bandage>0)){
   // Drinking takes 1.6 seconds and an enemy hit interrupts it. Defer the
   // single starting flask until normal movement/combat has opened space;
   // nearby enemies keep the driver on its shield-and-counter route instead.
   if(this.usedFlask||p.enemies.some(e=>e.hp>0&&Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<4))return;
   this.usedFlask=true;await this.action('#heal','KeyQ');await expect.poll(async()=>(await motion(this.page)).phase).toBe('heal');await expect.poll(async()=>(await motion(this.page)).phase,{timeout:60000}).toBe('idle');expect((await read(this.page)).hp,'The starting flask must actually heal').toBeGreaterThan(p.hp);return;
  }
  await this.menu('inventory');await this.row('bandage','consume');await expect.poll(async()=>(await read(this.page)).hp).toBeGreaterThan(p.hp);await this.resume();
 }
 async fight(index:number){
  for(let strikes=0;strikes<18&&(await read(this.page)).enemies[index].hp>0;strikes++){
   await this.healFromInventory();let p=await read(this.page);expect(p.hp,'Combat must preserve a living player').toBeGreaterThan(0);const enemy=p.enemies[index];
   const dx=enemy.position.x-p.position.x,dz=enemy.position.z-p.position.z,desiredYaw=Math.atan2(-dx,-dz),desiredPitch=Math.atan2(enemy.position.y-p.position.y,Math.hypot(dx,dz));
   // Melee/guard have real physical coverage; do not spend a new precision-look
   // gesture on a target that is already directly in front after every strike.
   if(Math.abs(angle(desiredYaw-p.yaw))>.12||Math.abs(desiredPitch-p.pitch)>.12)await this.aim({...enemy.position,y:enemy.position.y+1.52});
   if(p.stamina<45){await this.retreat();await expect.poll(async()=>(await motion(this.page)).stamina,{timeout:60000}).toBeGreaterThan(65);continue;}
   await this.shield(true);try{
    // If we arrive in an old recovery, keep guarding through the next attack.
    // Counter only a newly observed opening, not the tail of one spent aiming.
    const opened=['recover','stagger'].includes((await motion(this.page)).enemies[index].phase);
    if(opened)await expect.poll(async()=>{const state=await motion(this.page);expect(state.hp,'Guarding must preserve life').toBeGreaterThan(0);return state.enemies[index].hp<=0||!['recover','stagger'].includes(state.enemies[index].phase);},{timeout:90000,intervals:[50,100]}).toBe(true);
    await expect.poll(async()=>{const state=await motion(this.page);expect(state.hp,'Guarding must preserve life').toBeGreaterThan(0);return ['recover','stagger','dead'].includes(state.enemies[index].phase);},{timeout:90000,intervals:[50,100]}).toBe(true);
   }finally{await this.shield(false);}
   if((await motion(this.page)).enemies[index].hp<=0)break;
   await this.action('[data-action="attack"]','KeyT');await expect.poll(async()=>(await motion(this.page)).phase,{intervals:[50,100]}).not.toBe('idle');await expect.poll(async()=>{const state=await motion(this.page);expect(state.hp,'Counter-attack recovery must preserve life').toBeGreaterThan(0);return state.phase;},{timeout:60000,intervals:[100]}).toBe('idle');
  }
  expect((await read(this.page)).enemies[index].hp,`Enemy ${index} must be defeated through guarded, aimed attacks`).toBeLessThanOrEqual(0);
 }

}



export async function gatherAndLightHearth(page:Page,controls:PlayerControls){
  await test.step('Gather wood from physical spawn logs',async()=>{
   await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await expect.poll(async()=>(await read(page)).tool).toBe(true);
   await controls.gather(4,8,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95}],'sample-wood');
  });
  await test.step('Walk around logs and gather stone',async()=>{
   await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);
   await controls.gather(3,6,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5},{x:-4.6,y:.5,z:7.0}],'sample-stone');
  });
  await test.step('Aim at the hearth and spend gathered resources',async()=>{
   await controls.walkTo(-3.5,5.3);await controls.aim({x:-3,y:.9,z:4});
   await expect(page.locator('#game')).toHaveAttribute('data-target','hearth');
   const before=await read(page);await controls.action('[data-action="interact"]','KeyE');
   await expect.poll(async()=>(await read(page)).campaign.flameTier).toBe(1);
   const after=await read(page);expect(after.inventory[4]).toBe(before.inventory[4]-8);expect(after.inventory[3]).toBe(before.inventory[3]-6);expect(after.campaign.completed).toContain('hearth');expect(after.campaign.deaths).toBe(0);
  });
}

/** A real user-facing quality preset, not a game-time or mechanics override. */
export async function choosePerformance(page:Page,mobile:boolean){
 for(let i=0;i<3&&(await read(page)).settings.graphics!=='performance';i++){if(mobile)await page.locator('#quality-toggle').tap();else await page.locator('#quality-toggle').click();}
 await expect.poll(async()=>(await read(page)).settings.graphics).toBe('performance');
 await expect(page.locator('#quality-toggle')).toContainText('省電力');
}
