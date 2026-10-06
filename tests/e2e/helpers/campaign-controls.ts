import {test,expect,type Page,type CDPSession} from '@playwright/test';
import {observeAttack} from './transient-observation';
import {TouchContacts} from './touch-contacts';
import {pulseKeyboardInput,type LookKey} from './keyboard-pulse';
import {NativePointer,nativeInputEnabled,desktopInputLabel,desktopKeyDown,desktopKeyUp,desktopKeyPress,nativeWalkPulse,relativeLookPixels,releaseNativeInput} from './native-input';

export interface Point {x:number;y:number;z:number}
export interface CampaignProbe {
 npcLife:{position:Point;activity:string;recovery:string}|null;
 position:Point;yaw:number;pitch:number;phase:string;seconds:number;tool:boolean;hp:number;stamina:number;gliding:boolean;grapple:Point|null;enemies:{position:Point;phase:string;time:number;hp:number}[];
 streamedWorld:boolean;worldSamples:number[];restoreFailure:string|null;settings:{graphics:'balanced'|'performance'|'high';sensitivity:number};stats:{graphics:string;worldResidency:{bucketScans:number;provider:null|{numericCacheBytes:number;numericCacheBudgetBytes:number;cachedBlocks:number;cacheEvictions:number;[key:string]:number}}};
 drops:{material:number;count:number;position:Point}[];inventory:Record<number,number>;target?:string;worldReady:boolean;saveStatus:string;
 campaign:{flameTier:number;completed:string[];artisanRescued:boolean;deaths:number;items:Record<string,number>;equipment:Record<string,string|null>;campUnlocked:boolean;gateOpen:boolean};
}
// Observation only. No test writes to game state, invokes actions, or seeds storage.
export const read=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as CampaignProbe);
const motion=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__inputProbe') as Pick<CampaignProbe,'position'|'hp'|'stamina'|'phase'|'seconds'|'yaw'|'pitch'|'enemies'>);
export const readMotion=motion;
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));

export class PlayerControls {
 private nativePointer:NativePointer|null=null;
 private nativeSensitivity=1;
 private touch:CDPSession|null=null;
 private contacts:TouchContacts|null=null;
 private heldKeys=new Set<string>();
 private usedFlask=false;
 private shieldHeld=false;
 constructor(private page:Page,private mobile:boolean){}
 async initialize(){
  if(this.mobile){this.touch=await this.page.context().newCDPSession(this.page);this.contacts=new TouchContacts(event=>this.touch!.send('Input.dispatchTouchEvent',event));}
  else {await expect.poll(()=>this.page.evaluate(()=>!!document.pointerLockElement)).toBe(true);if(nativeInputEnabled()){await this.page.bringToFront();await releaseNativeInput();this.nativePointer=await NativePointer.create(this.page);this.nativeSensitivity=(await read(this.page)).settings.sensitivity;await this.nativePointer.prepare();}}
  test.info().annotations.push({type:'campaign-input',description:this.mobile?'Android Chromium touch emulation; not a physical device':desktopInputLabel()});
 }
 async endTouch(){await this.contacts?.clear();this.shieldHeld=false;}
 async dispose(){if(!this.mobile){if(nativeInputEnabled())await releaseNativeInput().catch(()=>{});else for(const key of ['KeyW','KeyS','KeyA','KeyD','KeyZ','ShiftLeft','Home','End','PageUp','PageDown'])await this.page.keyboard.up(key).catch(()=>{});}if(this.nativePointer){const delivery=await this.nativePointer.read().catch(()=>null);await test.info().attach('campaign-native-input',{body:JSON.stringify({mode:desktopInputLabel(),delivery},null,2),contentType:'application/json'}).catch(()=>{});await this.nativePointer.dispose();this.nativePointer=null;}this.heldKeys.clear();this.shieldHeld=false;if(this.touch){await this.endTouch().catch(()=>{});await this.touch.detach().catch(()=>{});this.touch=null;this.contacts=null;}}
 private async key(key:string,down:boolean){if(down===this.heldKeys.has(key))return;if(down){await desktopKeyDown(this.page,key);this.heldKeys.add(key);}else{await desktopKeyUp(this.page,key);this.heldKeys.delete(key);}}
 private async visiblePoint(selector:string){
  const control=this.page.locator(selector);await expect(control).toBeEnabled();
  const point=await control.evaluate(element=>{const r=element.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,visible:r.width>0&&r.height>0&&!!hit&&element.contains(hit)};});
  expect(point.visible,'The real control must be visible and unobstructed').toBe(true);return {x:point.x,y:point.y};
 }
 /** Continuous normal movement. Releasing it preserves the shield/look fingers. */
 async moveAxes(x:number,z:number){
  if(!this.mobile){await this.key('KeyW',z>.38);await this.key('KeyS',z<-.38);await this.key('KeyD',x>.38);await this.key('KeyA',x<-.38);return;}
  if(!x&&!z){await this.contacts!.release(1);return;}
  const center=await this.visiblePoint('#move-pad'),box=await this.page.locator('#move-pad').boundingBox();expect(box).not.toBeNull();const scale=box!.width*.32/Math.max(1,Math.hypot(x,z));
  await this.contacts!.set(1,{x:center.x+x*scale,y:center.y-z*scale});
 }
 /** One bounded live aim correction, including while a spell is pending. */
 async fineLook(yawError:number,pitchError:number){
  if(this.nativePointer){if(Math.abs(yawError)<=.015&&Math.abs(pitchError)<=.015)return;const p=await motion(this.page),sensitivity=this.nativeSensitivity;await this.nativePointer.move(Math.abs(yawError)>.015?relativeLookPixels(yawError,sensitivity,p.phase,140):0,Math.abs(pitchError)>.015?relativeLookPixels(pitchError,sensitivity,p.phase,65):0);return;}
  if(!this.mobile){await this.key('ShiftLeft',Math.abs(yawError)>.015||Math.abs(pitchError)>.015);await this.key('Home',yawError>.015);await this.key('End',yawError<-.015);await this.key('PageUp',pitchError>.015);await this.key('PageDown',pitchError<-.015);return;}
  if(Math.abs(yawError)<=.015&&Math.abs(pitchError)<=.015)return;
  await this.touchLook(Math.abs(yawError)>.015?Math.max(-140,Math.min(140,-yawError/.004)):0,Math.abs(pitchError)>.015?Math.max(-65,Math.min(65,-pitchError/.004)):0);
 }
 private async touchLook(dx:number,dy:number){
  const point=await this.lookPoint();await this.contacts!.set(7,point);
  try{await this.contacts!.set(7,{x:point.x+dx,y:point.y+dy});}finally{await this.contacts!.release(7);}
 }
 async action(selector:string,key:string){
  if(!this.mobile){if(key==='KeyR'){await desktopKeyDown(this.page,key);try{await expect.poll(()=>this.page.locator('#combat-status').textContent()).toContain('強撃準備完了');}finally{await desktopKeyUp(this.page,key);}}else await desktopKeyPress(this.page,key);if(this.nativePointer&&['KeyI','KeyJ','KeyM','Tab','Escape'].includes(key)){await releaseNativeInput();this.heldKeys.clear();this.shieldHeld=false;}return;}
  // Digit1/2 select a mode; the touch control toggles. Equipping a weapon
  // already selects it, so blindly tapping here used to return mobile ranged
  // routes to the chisel and silently disable their shield.
  const requestedTool=selector==='#tool-switch'&&(key==='Digit1'||key==='Digit2')?key==='Digit2':null;
  if(requestedTool!==null&&(await read(this.page)).tool===requestedTool)return;
  // Use a real touch on the visible control. Locator.tap's scrolling/stability
  // round trips can consume an entire combat opening on software-rendered CI.
  const point=await this.visiblePoint(selector);
  await this.contacts!.set(9,point);try{if(key==='KeyR')await expect.poll(()=>this.page.locator('#combat-status').textContent()).toContain('強撃準備完了');}finally{await this.contacts!.release(9);}
  if(requestedTool!==null)await expect.poll(async()=>(await read(this.page)).tool).toBe(requestedTool);
 }
 async aim(point:Point,guarded=false){
  if(guarded)await this.shield(true);
  expect((await motion(this.page)).hp,'Aiming requires a living player; report combat death before input accuracy').toBeGreaterThan(0);await expect(this.page.locator('#death')).toBeHidden();await expect(this.page.locator('#game')).toHaveAttribute('data-running','true');
  await expect.poll(async()=>(await motion(this.page)).phase).toBe('idle');
  if(!this.mobile){if(this.nativePointer)await this.nativeAim(point);else await this.keyboardAim(point);return;}
  for(let attempt=0;attempt<8;attempt++){
   const p=await motion(this.page);expect(p.hp,'Touch aiming must not continue on the death overlay').toBeGreaterThan(0);const dx=point.x-p.position.x,dz=point.z-p.position.z,dy=point.y-p.position.y-1.52;
   const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz)),yawError=angle(yaw-p.yaw),pitchError=pitch-p.pitch;
   if(Math.abs(yawError)<.015&&Math.abs(pitchError)<.015)return;
   if(this.mobile){
    const mx=-yawError/.004,my=-pitchError/.004,steps=Math.max(1,Math.ceil(Math.max(Math.abs(mx)/140,Math.abs(my)/65)));
    for(let i=0;i<steps;i++){
     const before=await motion(this.page);await this.touchLook(mx/steps,my/steps);
     if(guarded)await this.assertShieldHeld();
     await expect.poll(async()=>{const p=await motion(this.page);expect(p.hp,'Player died during a touch-look gesture').toBeGreaterThan(0);return Math.abs(angle(p.yaw-before.yaw))+Math.abs(p.pitch-before.pitch);},{timeout:15000,intervals:[50,100]}).toBeGreaterThan(.001);
    }
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
 private async nativeAim(point:Point){
  await this.nativePointer!.prepare();
  const sensitivity=(await read(this.page)).settings.sensitivity;
  const error=async(axis:'yaw'|'pitch')=>{const p=await motion(this.page);expect(p.hp,'Native aiming must not continue after combat death').toBeGreaterThan(0);const dx=point.x-p.position.x,dz=point.z-p.position.z;return {phase:p.phase,value:axis==='yaw'?angle(Math.atan2(-dx,-dz)-p.yaw):Math.atan2(point.y-p.position.y-1.52,Math.hypot(dx,dz))-p.pitch};};
  for(const axis of ['yaw','pitch'] as const){
   const started=Date.now();
   for(let attempt=0;attempt<12;attempt++){
    const remaining=await error(axis);expect(Date.now()-started,'Native aim retains the existing 90-second input budget').toBeLessThan(90000);if(Math.abs(remaining.value)<.015)break;
    const pixels=relativeLookPixels(remaining.value,sensitivity,remaining.phase);
    await this.nativePointer!.move(axis==='yaw'?pixels:0,axis==='pitch'?pixels:0,started+90000);
   }
   const final=await error(axis);expect(Date.now()-started,'Native aim must finish within its existing 90-second axis budget').toBeLessThan(90000);expect(Math.abs(final.value),`Actual native relative mouse must reach requested ${axis}`).toBeLessThan(.035);
  }
 }
 async keyboardAim(point:Point){
  // Genuine production accessibility keys, with releases independent of slow
  // browser acknowledgements. No camera writes or synthetic DOM events.
  const error=async(axis:'yaw'|'pitch')=>{const p=await motion(this.page);expect(p.hp,'Keyboard aiming must not continue after combat death').toBeGreaterThan(0);const dx=point.x-p.position.x,dz=point.z-p.position.z;return axis==='yaw'?angle(Math.atan2(-dx,-dz)-p.yaw):Math.atan2(point.y-p.position.y-1.52,Math.hypot(dx,dz))-p.pitch;};
  const transport=await this.page.context().newCDPSession(this.page);
  try{for(const axis of ['yaw','pitch'] as const){
   const started=Date.now();let coarseRate=1.4,fineRate=.056;
   for(let attempt=0;attempt<12;attempt++){
    const remaining=await error(axis);if(Math.abs(remaining)<.015)break;
    expect(Date.now()-started,'Keyboard aim retains the existing 90-second input budget').toBeLessThan(90000);
    const sign=Math.sign(remaining),fine=Math.abs(remaining)<.2,key:LookKey=axis==='yaw'?(sign>0?'Home':'End'):(sign>0?'PageUp':'PageDown');
    const duration=Math.max(60,Math.min(1200,Math.abs(remaining)*.75/(fine?fineRate:coarseRate)*1000));
    await pulseKeyboardInput(transport,key,fine,duration);
    const after=await error(axis),travelled=Math.abs(angle(remaining-after));
    if(travelled>.001){const measured=travelled/(duration/1000);if(fine)fineRate=Math.max(.014,Math.min(.224,measured));else coarseRate=Math.max(.35,Math.min(5.6,measured));}
   }
   expect(Math.abs(await error(axis)),`Actual keyboard look must reach requested ${axis}`).toBeLessThan(.035);
  }}finally{await transport.detach();}
 }

 async walkTo(x:number,z:number){
  // A signed projection detects crossing the waypoint, not actually arriving.
  // Genuine release latency/inertia can carry us beyond it, especially on CI.
  // Re-aim from the settled position and correct with normal input before the
  // next route segment; never treat a wall-adjacent overshoot as arrival.
  for(let attempt=0;attempt<5;attempt++){
   const p=await motion(this.page);if(Math.hypot(x-p.position.x,z-p.position.z)<.18)return;
   await this.walkSegment(x,z);
  }
  const p=await motion(this.page);expect(Math.hypot(x-p.position.x,z-p.position.z),'Normal movement must settle at the requested waypoint').toBeLessThan(.18);
 }
 private async walkSegment(x:number,z:number){
  const before=await motion(this.page);if(Math.hypot(x-before.position.x,z-before.position.z)<.18)return;
  await this.aim({x,y:before.position.y+1.52,z});
  // Momentum may carry the player while aiming. Measure the walking segment
  // after the real look input, rather than projecting against a stale origin.
  const start=await motion(this.page),dx=x-start.position.x,dz=z-start.position.z,length=Math.hypot(dx,dz);if(length<.18)return;
  // The real desktop trace overshot the 1.6m doorway approach into the
  // warden's sight range. Slow short approaches and brake long legs early;
  // keep the same five corrections and strict .18m final tolerance.
  const precise=length<2.25;let restoreTool=false,guard=false,movementFailed=false;
  // Use the actual analog stick for small touch corrections. Keyboard players
  // can raise their guard to walk carefully; restore a selected tool afterward.
  if(!this.mobile&&precise){restoreTool=(await read(this.page)).tool;if(restoreTool){await this.action('#tool-switch','Digit1');await expect.poll(async()=>(await read(this.page)).tool).toBe(false);}
   // Core mode changes before the next HUD update. Read the rendered mode
   // before deciding whether the real shield control is available.
   await expect(this.page.locator('#tool-switch')).toContainText(/^1 /);guard=await this.page.locator('[data-action=block]').isEnabled();}
  try{
   if(this.mobile)await this.moveAxes(0,precise?Math.min(.65,Math.max(.1,length/3)):1);
   else if(guard)await this.key('KeyZ',true);
   const brake=precise?Math.min(.12,length*.3):1.2;
   if(!this.mobile)await this.pulseDesktopWalk(x,z,dx,dz,length,brake,guard,precise);
   else await expect.poll(async()=>{const p=await motion(this.page);expect(p.hp,'Player must survive the gathering route').toBeGreaterThan(0);return ((x-p.position.x)*dx+(z-p.position.z)*dz)/length;},{timeout:60000,intervals:[50,100]}).toBeLessThan(brake);
  }catch(error){movementFailed=true;throw error;}finally{try{if(this.mobile)await this.moveAxes(0,0);else {await desktopKeyUp(this.page,'KeyW');if(guard)await this.key('KeyZ',false);}}catch(error){if(!movementFailed)throw error;}}
  const seconds=(await motion(this.page)).seconds;await expect.poll(async()=>(await motion(this.page)).seconds,{intervals:[50,100]}).toBeGreaterThan(seconds+.3);
  if(restoreTool){await this.action('#tool-switch','Digit2');await expect.poll(async()=>(await read(this.page)).tool).toBe(true);}
 }
 private async pulseDesktopWalk(x:number,z:number,dx:number,dz:number,length:number,brake:number,guard:boolean,precise:boolean){
  const started=Date.now(),remaining=(p:Awaited<ReturnType<typeof motion>>)=>((x-p.position.x)*dx+(z-p.position.z)*dz)/length;
  let metresPerMs=(guard?1.05:2.5)/1000;const transport=this.nativePointer?null:await this.page.context().newCDPSession(this.page);
  // Both long and short legs release before readback. The failed SDF strafe
  // reached x12.69 and fell while waiting for key-up; this keeps the same
  // 60-second segment bound and strict five-correction/.18m arrival gate.
  try{for(let pulse=0;pulse<(precise?24:120);pulse++){
   const before=await motion(this.page);expect(before.hp,'Movement must preserve life').toBeGreaterThan(0);const distance=remaining(before);if(distance<brake)return;
   expect(Date.now()-started,'Movement retains the existing 60-second segment budget').toBeLessThan(60000);
   const delay=Math.max(50,Math.min(precise?400:1000,(distance-brake)*.65/metresPerMs));
   if(this.nativePointer)await nativeWalkPulse(this.page,{x,z,dx,dz,length,brake,seconds:delay/1000},Math.max(1,60000-(Date.now()-started)));
   else await pulseKeyboardInput(transport!,'KeyW',false,delay);
   const released=await motion(this.page);
   if(precise||remaining(released)<2.25)await expect.poll(async()=>{const p=await motion(this.page);expect(p.hp,'Settling a real key pulse must preserve life').toBeGreaterThan(0);return p.seconds;},{timeout:Math.max(1,60000-(Date.now()-started)),intervals:[50,100]}).toBeGreaterThan(released.seconds+.3);
   const settled=await motion(this.page),travelled=distance-remaining(settled);
   if(!this.nativePointer&&travelled>0)metresPerMs=Math.max(metresPerMs*.75,travelled/delay);
   if(remaining(settled)<brake)return;
  }
  expect(remaining(await motion(this.page)),'Released key pulses must reach the existing segment brake').toBeLessThan(brake);
  }finally{await transport?.detach();}
 }

 async gather(material:number,minimum:number,points:Point[],object:string){
  for(let i=0;i<20&&(await read(this.page)).inventory[material]<minimum;i++){
   await this.aim(points[i%points.length]);
   // A mined patch may expose another part or terrain. Do not call private hit APIs.
   if((await read(this.page)).target!==object)continue;
   const attack=await observeAttack(this.page);
   try{await this.action('[data-action="heavy"]','KeyR');await expect.poll(()=>attack.read()).not.toBeNull();}finally{await attack.dispose();}
   await expect.poll(async()=>(await motion(this.page)).phase,{timeout:60000,intervals:[100]}).toBe('idle');
   const seconds=(await motion(this.page)).seconds;await expect.poll(async()=>(await motion(this.page)).seconds,{intervals:[100]}).toBeGreaterThan(seconds+.3);
  }
  // Mined chunks have physical inertia. Walk toward nearby physical drops
  // instead of assuming every chunk lands inside the 1.65 m pickup radius.
  for(let attempt=0;attempt<4&&(await read(this.page)).inventory[material]<minimum;attempt++){
   const p=await read(this.page),drop=p.drops.filter(d=>d.material===material&&d.count>0&&Math.abs(d.position.y-p.position.y)<1.2&&Math.hypot(d.position.x-p.position.x,d.position.z-p.position.z)<3.5).sort((a,b)=>Math.hypot(a.position.x-p.position.x,a.position.z-p.position.z)-Math.hypot(b.position.x-p.position.x,b.position.z-p.position.z))[0];
   if(!drop)break;const dx=drop.position.x-p.position.x,dz=drop.position.z-p.position.z,length=Math.hypot(dx,dz);
   if(length>.65)await this.walkTo(drop.position.x-dx/length*.55,drop.position.z-dz/length*.55);
   const seconds=(await motion(this.page)).seconds;await expect.poll(async()=>(await motion(this.page)).seconds,{intervals:[100]}).toBeGreaterThan(seconds+.3);
  }
  expect((await read(this.page)).inventory[material],`Actual chisel strikes and nearby pickup must gather material ${material}`).toBeGreaterThanOrEqual(minimum);
 }
 async activate(selector:string){if(this.mobile)await this.page.locator(selector).tap();else await this.page.locator(selector).click();}
 async menu(tab:string){await this.action('#campaign-toggle','KeyI');await expect(this.page.locator('#campaign-panel')).toBeVisible();await this.activate(`[data-tab="${tab}"]`);}
 async resume(){if(this.nativePointer){await releaseNativeInput();this.heldKeys.clear();this.shieldHeld=false;}const button=this.page.getByRole('button',{name:'探索に戻る',exact:true});if(this.mobile)await button.tap();else await button.click();await expect(this.page.locator('#game')).toHaveAttribute('data-running','true');}
 async row(id:string,action:string){const button=this.page.locator(`[data-item="${id}"] [data-command="${action}"]`);await expect(button).toBeEnabled();if(this.mobile)await button.tap();else await button.click();}
 async interact(id:string,point:Point){await this.aim(point);await expect(this.page.locator('#game')).toHaveAttribute('data-target',id);await this.action('[data-action="interact"]','KeyE');}
 async assertShieldHeld(){await expect.poll(async()=>{const state=await this.page.evaluate(()=>Reflect.get(window,'__inputProbe') as {hp:number;running:boolean;controls:{block:boolean}});expect(state.hp,'Guard input must not continue after death').toBeGreaterThan(0);return state.running&&state.controls.block;}).toBe(true);}
 async shield(held:boolean){
  if(held&&this.shieldHeld){await this.assertShieldHeld();return;}
  if(!this.mobile){await this.key('KeyZ',held);this.shieldHeld=held;if(held&&this.nativePointer)await this.assertShieldHeld();return;}
  if(!held){await this.contacts?.release(8);this.shieldHeld=false;return;}
  await this.contacts!.set(8,await this.visiblePoint('[data-action=block]'));this.shieldHeld=true;await this.assertShieldHeld();
 }
 async retreat(){
  const state=await read(this.page),start=state.seconds;
  // Repeated backsteps can leave the southern cliff. Strafe while recovering
  // stamina there; choose the lateral direction that stays north when possible.
  const side=state.position.z>6?(Math.abs(Math.sin(state.yaw))>.15?Math.sign(Math.sin(state.yaw)):state.position.x>5?-1:1):0,key=side>0?'KeyD':side<0?'KeyA':'KeyS';
  try{if(this.mobile)await this.moveAxes(side,side?0:-1);else await this.key(key,true);
   // Establish real retreat movement before lowering the held shield.
   if(this.shieldHeld)await this.shield(false);
   await expect.poll(async()=>{const p=await read(this.page);expect(p.hp,'Stamina recovery must remain on safe terrain').toBeGreaterThan(0);return p.seconds;},{timeout:60000}).toBeGreaterThan(start+2.6);
  }finally{if(this.mobile)await this.moveAxes(0,0);else await this.key(key,false);}
 }
 async healFromInventory(){
  const p=await read(this.page);if(p.hp>=70)return;
  if(!(p.campaign.items.bandage>0)){
   // Drinking takes 1.6 seconds and an enemy hit interrupts it. Defer the
   // single starting flask until normal movement/combat has opened space;
   // nearby enemies keep the driver on its shield-and-counter route instead.
   if(this.usedFlask||p.enemies.some(e=>e.hp>0&&Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<6))return;
   this.usedFlask=true;await this.action('#heal','KeyQ');await expect.poll(async()=>(await motion(this.page)).phase).toBe('heal');await expect.poll(async()=>(await motion(this.page)).phase,{timeout:60000}).toBe('idle');expect((await read(this.page)).hp,'The starting flask must actually heal').toBeGreaterThan(p.hp);return;
  }
  const guarded=this.shieldHeld;if(guarded)await this.shield(false);await this.menu('inventory');await this.row('bandage','consume');await expect.poll(async()=>(await read(this.page)).hp).toBeGreaterThan(p.hp);await this.resume();if(guarded)await this.shield(true);
 }
 async fight(index:number){
  try{for(let strikes=0;strikes<18&&(await read(this.page)).enemies[index].hp>0;strikes++){
   await this.shield(true);await this.healFromInventory();let p=await read(this.page);expect(p.hp,'Combat must preserve a living player').toBeGreaterThan(0);const enemy=p.enemies[index];
   const dx=enemy.position.x-p.position.x,dz=enemy.position.z-p.position.z,desiredYaw=Math.atan2(-dx,-dz),desiredPitch=Math.atan2(enemy.position.y-p.position.y,Math.hypot(dx,dz));
   // Melee/guard have real physical coverage; do not spend a new precision-look
   // gesture on a target that is already directly in front after every strike.
   if(Math.abs(angle(desiredYaw-p.yaw))>.12||Math.abs(desiredPitch-p.pitch)>.12)await this.aim({...enemy.position,y:enemy.position.y+1.52},true);
   p=await read(this.page);
   if(p.stamina<45){await this.retreat();await expect.poll(async()=>(await motion(this.page)).stamina,{timeout:60000}).toBeGreaterThan(65);continue;}
   await this.shield(true);
    // If we arrive in an old recovery, keep guarding through the next attack.
    // Counter only a newly observed opening, not the tail of one spent aiming.
    const opened=['recover','stagger'].includes((await motion(this.page)).enemies[index].phase);
    if(opened)await expect.poll(async()=>{const state=await motion(this.page);expect(state.hp,'Guarding must preserve life').toBeGreaterThan(0);return state.enemies[index].hp<=0||!['recover','stagger'].includes(state.enemies[index].phase);},{timeout:90000,intervals:[50,100]}).toBe(true);
    await expect.poll(async()=>{const state=await motion(this.page);expect(state.hp,'Guarding must preserve life').toBeGreaterThan(0);return ['recover','stagger','dead'].includes(state.enemies[index].phase);},{timeout:90000,intervals:[50,100]}).toBe(true);
   const opening=await motion(this.page);if(opening.enemies[index].hp<=0)break;
   // A successful block costs stamina too. Keep enough for the20-cost sword
   // counter and a later18-cost guard; never decide from the pre-block value.
   if(opening.stamina<55){await this.retreat();await expect.poll(async()=>(await motion(this.page)).stamina,{timeout:60000}).toBeGreaterThan(65);continue;}
   await this.shield(false);
   const attack=await observeAttack(this.page);try{await this.action('[data-action="attack"]','KeyT');await this.shield(true);await expect.poll(()=>attack.read()).not.toBeNull();}finally{await attack.dispose();}await expect.poll(async()=>{const state=await motion(this.page);expect(state.hp,'Counter-attack recovery must preserve life').toBeGreaterThan(0);return state.phase;},{timeout:60000,intervals:[100]}).toBe('idle');await this.shield(true);
  }
  expect((await read(this.page)).enemies[index].hp,`Enemy ${index} must be defeated through guarded, aimed attacks`).toBeLessThanOrEqual(0);
  }finally{await this.shield(false);}
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
   const after=await read(page);expect(after.inventory[4]).toBe(before.inventory[4]-8);expect(after.inventory[3]).toBe(before.inventory[3]-6);expect(after.campaign.completed).toContain('hearth');expect(after.campaign.deaths).toBe(0);await expect(page.locator('#campaign-status')).toHaveAttribute('aria-label',/火のぬくもり/);
  });
}

/** A real user-facing quality preset, not a game-time or mechanics override. */
export async function choosePerformance(page:Page,mobile:boolean){
 for(let i=0;i<3;i++){
  const before=(await read(page)).settings.graphics;if(before==='performance')break;
  if(mobile)await page.locator('#quality-toggle').tap();else await page.locator('#quality-toggle').click();
  // Require this actual tap/click to take effect before sending another; never
  // hide missing delivery or cycle three times against a stale observation.
  await expect.poll(async()=>(await read(page)).settings.graphics).not.toBe(before);
 }
 await expect.poll(async()=>(await read(page)).settings.graphics).toBe('performance');
 await expect(page.locator('#quality-toggle')).toContainText('省電力');
}
