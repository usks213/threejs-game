import {test,expect,type Page,type CDPSession} from '@playwright/test';

interface Point {x:number;y:number;z:number}
interface CampaignProbe {
 position:Point;yaw:number;pitch:number;phase:string;seconds:number;tool:boolean;hp:number;
 inventory:Record<number,number>;target?:string;worldReady:boolean;saveStatus:string;
 campaign:{flameTier:number;completed:string[];artisanRescued:boolean;deaths:number};
}
// Observation only. No test writes to game state, invokes actions, or seeds storage.
const read=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as CampaignProbe);
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));

class PlayerControls {
 private touch:CDPSession|null=null;
 private liveTouch=false;
 constructor(private page:Page,private mobile:boolean){}
 async initialize(){
  if(this.mobile)this.touch=await this.page.context().newCDPSession(this.page);
  else await expect.poll(()=>this.page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
 }
 async endTouch(){if(!this.touch||!this.liveTouch)return;this.liveTouch=false;await this.touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 async dispose(){if(!this.mobile)await this.page.keyboard.up('KeyW').catch(()=>{});if(this.touch){await this.endTouch().catch(()=>{});await this.touch.detach().catch(()=>{});this.touch=null;}}
 async action(selector:string,key:string){if(this.mobile)await this.page.locator(selector).tap();else await this.page.keyboard.press(key);}
 async aim(point:Point){
  await expect.poll(async()=>(await read(this.page)).phase).toBe('idle');
  if(!this.mobile){await this.keyboardAim(point);return;}
  for(let attempt=0;attempt<8;attempt++){
   const p=await read(this.page),dx=point.x-p.position.x,dz=point.z-p.position.z,dy=point.y-p.position.y-1.52;
   const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz)),yawError=angle(yaw-p.yaw),pitchError=pitch-p.pitch;
   if(Math.abs(yawError)<.015&&Math.abs(pitchError)<.015)return;
   if(this.mobile){
    const mx=-yawError/.004,my=-pitchError/.004,steps=Math.max(1,Math.ceil(Math.max(Math.abs(mx)/140,Math.abs(my)/65)));
    for(let i=0;i<steps;i++){const finger={x:550,y:170,id:7};await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});this.liveTouch=true;await this.touch!.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...finger,x:finger.x+mx/steps,y:finger.y+my/steps}]});await this.endTouch();}
   }
  }
  const p=await read(this.page),yaw=Math.atan2(-(point.x-p.position.x),-(point.z-p.position.z)),pitch=Math.atan2(point.y-p.position.y-1.52,Math.hypot(point.x-p.position.x,point.z-p.position.z));
  expect(Math.abs(angle(yaw-p.yaw)),'Real pointer input must reach requested yaw').toBeLessThan(.035);
  expect(Math.abs(pitch-p.pitch),'Real pointer input must reach requested pitch').toBeLessThan(.035);
 }
 async keyboardAim(point:Point){
  // Genuine production accessibility keys. CDP absolute mouseMove does not
  // synthesize Pointer Lock's raw relative motion, so this is labeled separately.
  const error=async(axis:'yaw'|'pitch')=>{const p=await read(this.page),dx=point.x-p.position.x,dz=point.z-p.position.z;return axis==='yaw'?angle(Math.atan2(-dx,-dz)-p.yaw):Math.atan2(point.y-p.position.y-1.52,Math.hypot(dx,dz))-p.pitch;};
  for(const axis of ['yaw','pitch'] as const){
   for(let attempt=0;attempt<6;attempt++){
    const remaining=await error(axis);if(Math.abs(remaining)<.015)break;
    const sign=Math.sign(remaining),fine=Math.abs(remaining)<.3,key=axis==='yaw'?(sign>0?'Home':'End'):(sign>0?'PageUp':'PageDown');
    try{if(fine)await this.page.keyboard.down('ShiftLeft');await this.page.keyboard.down(key);await expect.poll(async()=>sign*await error(axis),{timeout:90000,intervals:[50,100]}).toBeLessThan(fine?.006:.18);}
    finally{await this.page.keyboard.up(key);if(fine)await this.page.keyboard.up('ShiftLeft');}
   }
   expect(Math.abs(await error(axis)),`Actual keyboard look must reach requested ${axis}`).toBeLessThan(.035);
  }
 }
 async walkTo(x:number,z:number){
  const start=await read(this.page),dx=x-start.position.x,dz=z-start.position.z,length=Math.hypot(dx,dz);if(length<.18)return;
  await this.aim({x,y:start.position.y+1.52,z});
  let movementFailed=false;try{
   if(this.mobile){const box=await this.page.locator('#move-pad').boundingBox();expect(box).not.toBeNull();await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:box!.x+box!.width/2,y:box!.y+10}]});this.liveTouch=true;}
   else await this.page.keyboard.down('KeyW');
   await expect.poll(async()=>{const p=await read(this.page);expect(p.hp,'Player must survive the gathering route').toBeGreaterThan(0);return ((x-p.position.x)*dx+(z-p.position.z)*dz)/length;},{timeout:60000,intervals:[50,100]}).toBeLessThan(.18);
  }catch(error){movementFailed=true;throw error;}finally{try{if(this.mobile)await this.endTouch();else await this.page.keyboard.up('KeyW');}catch(error){if(!movementFailed)throw error;}}
  const seconds=(await read(this.page)).seconds;await expect.poll(async()=>(await read(this.page)).seconds,{intervals:[50,100]}).toBeGreaterThan(seconds+.15);
 }
 async gather(material:number,minimum:number,points:Point[],object:string){
  for(let i=0;i<8&&(await read(this.page)).inventory[material]<minimum;i++){
   await this.aim(points[i%points.length]);
   // A mined patch may expose another part or terrain. Do not call private hit APIs.
   if((await read(this.page)).target!==object)continue;
   await this.action('[data-action="heavy"]','KeyR');
   await expect.poll(async()=>(await read(this.page)).phase,{intervals:[50,100]}).not.toBe('idle');
   await expect.poll(async()=>(await read(this.page)).phase,{timeout:60000,intervals:[100]}).toBe('idle');
   const seconds=(await read(this.page)).seconds;await expect.poll(async()=>(await read(this.page)).seconds,{intervals:[100]}).toBeGreaterThan(seconds+.3);
  }
  expect((await read(this.page)).inventory[material],`Actual chisel strikes and nearby pickup must gather material ${material}`).toBeGreaterThanOrEqual(minimum);
 }
}

test('campaign playthrough with desktop keyboard-look or Android touch: gather, light, save and continue',async({page,isMobile},testInfo)=>{
 test.setTimeout(900000);
 testInfo.annotations.push({type:'input-mode',description:isMobile?'Actual Android touch gestures':'Actual desktop keyboard-look accessibility controls; not a raw-relative-mouse test'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 await expect(page.locator('#error')).toBeHidden();
 // Each Playwright test gets a fresh browser context. Assert this is genuinely a new journey.
 expect((await read(page)).campaign.flameTier).toBe(0);expect((await read(page)).inventory[4]).toBe(0);expect((await read(page)).inventory[3]).toBe(0);
 if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();
 await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
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
   await page.screenshot({path:testInfo.outputPath('hearth-lit.png')});
  });
 }finally{await controls.dispose();}
 await test.step('Save through the real menu, then reload persistent gameplay state',async()=>{
  if(isMobile)await page.locator('#campaign-toggle').tap();else await page.keyboard.press('KeyI');
  await expect(page.locator('#campaign-panel')).toBeVisible();
  const settings=page.getByRole('button',{name:'設定・保存',exact:true});if(isMobile)await settings.tap();else await settings.click();
  await expect.poll(async()=>(await read(page)).worldReady,{timeout:120000}).toBe(true);
  const save=page.getByRole('button',{name:'今すぐ保存',exact:true});if(isMobile)await save.tap();else await save.click();await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');
  const saved=await read(page);await testInfo.attach('saved-gameplay-checkpoint',{body:JSON.stringify({inventory:saved.inventory,campaign:saved.campaign,position:saved.position},null,2),contentType:'application/json'});
  await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).worldReady,{timeout:120000}).toBe(true);
  await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');const restored=await read(page);
  expect(restored.campaign.flameTier).toBe(1);expect(restored.inventory).toEqual(saved.inventory);expect(restored.campaign.completed).toEqual(saved.campaign.completed);expect(restored.campaign.deaths).toBe(0);
  expect(restored.position.x).toBeCloseTo(saved.position.x,2);expect(restored.position.z).toBeCloseTo(saved.position.z,2);
  if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
  await page.screenshot({path:testInfo.outputPath('hearth-continued.png')});
 });
 expect(errors).toEqual([]);
});
