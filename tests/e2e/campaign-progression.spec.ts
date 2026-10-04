import {test,expect,type Page,type CDPSession} from '@playwright/test';

interface Point {x:number;y:number;z:number}
interface CampaignProbe {
 position:Point;yaw:number;pitch:number;phase:string;seconds:number;tool:boolean;hp:number;stamina:number;gliding:boolean;grapple:Point|null;enemies:{position:Point;phase:string;time:number;hp:number}[];
 inventory:Record<number,number>;target?:string;worldReady:boolean;saveStatus:string;
 campaign:{flameTier:number;completed:string[];artisanRescued:boolean;deaths:number;items:Record<string,number>;equipment:Record<string,string|null>;campUnlocked:boolean;gateOpen:boolean};
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
 async dispose(){if(!this.mobile)for(const key of ['KeyW','KeyS','KeyZ','ShiftLeft','Home','End','PageUp','PageDown'])await this.page.keyboard.up(key).catch(()=>{});if(this.touch){await this.endTouch().catch(()=>{});await this.touch.detach().catch(()=>{});this.touch=null;}}
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
  for(let i=0;i<20&&(await read(this.page)).inventory[material]<minimum;i++){
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
 async activate(selector:string){if(this.mobile)await this.page.locator(selector).tap();else await this.page.locator(selector).click();}
 async menu(tab:string){await this.action('#campaign-toggle','KeyI');await expect(this.page.locator('#campaign-panel')).toBeVisible();await this.activate(`[data-tab="${tab}"]`);}
 async resume(){const button=this.page.getByRole('button',{name:'探索に戻る',exact:true});if(this.mobile)await button.tap();else await button.click();await expect(this.page.locator('#game')).toHaveAttribute('data-running','true');}
 async row(id:string,action:string){const button=this.page.locator(`[data-item="${id}"] [data-command="${action}"]`);await expect(button).toBeEnabled();if(this.mobile)await button.tap();else await button.click();}
 async interact(id:string,point:Point){await this.aim(point);await expect(this.page.locator('#game')).toHaveAttribute('data-target',id);await this.action('[data-action="interact"]','KeyE');}
 async shield(held:boolean){
  if(!this.mobile){if(held)await this.page.keyboard.down('KeyZ');else await this.page.keyboard.up('KeyZ');return;}
  if(!held){await this.endTouch();return;}const box=await this.page.locator('[data-action="block"]').boundingBox();expect(box).not.toBeNull();await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:8,x:box!.x+box!.width/2,y:box!.y+box!.height/2}]});this.liveTouch=true;
 }
 async retreat(){const start=(await read(this.page)).seconds;try{if(this.mobile){const b=await this.page.locator('#move-pad').boundingBox();await this.touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:b!.x+b!.width/2,y:b!.y+b!.height-10}]});this.liveTouch=true;}else await this.page.keyboard.down('KeyS');await expect.poll(async()=>(await read(this.page)).seconds,{timeout:60000}).toBeGreaterThan(start+1.2);}finally{if(this.mobile)await this.endTouch();else await this.page.keyboard.up('KeyS');}}
 async healFromInventory(){const p=await read(this.page);if(p.hp>=70||!(p.campaign.items.bandage>0))return;await this.menu('inventory');await this.row('bandage','consume');await expect.poll(async()=>(await read(this.page)).hp).toBeGreaterThan(p.hp);await this.resume();}
 async fight(index:number){
  for(let strikes=0;strikes<18&&(await read(this.page)).enemies[index].hp>0;strikes++){
   await this.healFromInventory();let p=await read(this.page);expect(p.hp,'Combat must preserve a living player').toBeGreaterThan(0);const enemy=p.enemies[index];
   await this.aim({...enemy.position,y:enemy.position.y+1.52});
   if(p.stamina<45){await this.retreat();await expect.poll(async()=>(await read(this.page)).stamina,{timeout:60000}).toBeGreaterThan(65);continue;}
   await this.shield(true);try{await expect.poll(async()=>{const state=await read(this.page);expect(state.hp).toBeGreaterThan(0);return ['recover','stagger','dead'].includes(state.enemies[index].phase);},{timeout:90000,intervals:[50,100]}).toBe(true);}finally{await this.shield(false);}
   if((await read(this.page)).enemies[index].hp<=0)break;
   await this.action('[data-action="attack"]','KeyT');await expect.poll(async()=>(await read(this.page)).phase,{intervals:[50,100]}).not.toBe('idle');await expect.poll(async()=>(await read(this.page)).phase,{timeout:60000,intervals:[100]}).toBe('idle');
  }
  expect((await read(this.page)).enemies[index].hp,`Enemy ${index} must be defeated through guarded, aimed attacks`).toBeLessThanOrEqual(0);
 }

}


test('campaign first chapter through normal keyboard or touch play: rescue, gear, grapple, glide, warden and ridge',async({page,isMobile},testInfo)=>{
 test.setTimeout(1800000);testInfo.annotations.push({type:'input-mode',description:isMobile?'Actual Android touches':'Production keyboard-look, T attack and Z held shield; no relative-mouse claim'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 expect((await read(page)).campaign.flameTier).toBe(0);expect((await read(page)).inventory[4]).toBe(0);
 if(isMobile)await page.locator('#quality-toggle').tap();else await page.locator('#quality-toggle').click();
 if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');const controls=new PlayerControls(page,isMobile);await controls.initialize();
 const checkpoint=async(name:string)=>{const p=await read(page);expect(p.hp).toBeGreaterThan(0);expect(p.campaign.deaths).toBe(0);await testInfo.attach(name,{body:JSON.stringify({position:p.position,inventory:p.inventory,campaign:p.campaign},null,2),contentType:'application/json'});};
 try{
  await test.step('Harvest a real material budget and establish the hearth',async()=>{
   await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,24,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95}],'sample-wood');
   await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,6,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
   await controls.walkTo(-3.45,6.65);await controls.gather(7,8,[{x:-3.45,y:.5,z:7.9},{x:-3.1,y:.5,z:7.9},{x:-3.8,y:.5,z:7.9}],'sample-grass');
   await controls.walkTo(-3.45,5.3);await controls.walkTo(2.5,5.3);await controls.walkTo(2.5,5.75);await controls.gather(6,4,[{x:2.5,y:.8,z:7.1},{x:2.8,y:.8,z:7.1},{x:2.2,y:.8,z:7.1}],'sample-metal');
   await controls.walkTo(2.5,5.3);await controls.walkTo(-3.5,5.3);await controls.interact('hearth',{x:-3,y:.9,z:4});await expect.poll(async()=>(await read(page)).campaign.flameTier).toBe(1);await checkpoint('01-hearth-materials');
  });
  await test.step('Enter the crypt and physically rescue the artisan',async()=>{
   await controls.action('#tool-switch','Digit1');await controls.walkTo(0,5.3);await controls.walkTo(0,3.2);await controls.interact('door',{x:0,y:1.4,z:1});
   await controls.walkTo(0,0);await controls.walkTo(-2.4,-1.8);await controls.interact('artisan',{x:-2.5,y:1.1,z:-3.5});await expect.poll(async()=>(await read(page)).campaign.artisanRescued).toBe(true);
   await controls.walkTo(0,0);await controls.walkTo(0,3.2);await controls.walkTo(0,5.3);await controls.walkTo(-3.5,5.3);await checkpoint('02-artisan-rescued');
  });
  await test.step('Craft and equip travel gear through the actual menus',async()=>{
   await controls.menu('crafting');for(const id of ['iron-blade','hide-coat','grapple','glider','bandage','bandage','berry-meal'])await controls.row(id,'craft');
   await controls.activate('[data-tab="inventory"]');for(const id of ['iron-blade','hide-coat','grapple','glider'])await controls.row(id,'equip');await controls.row('berry-meal','consume');
   const c=(await read(page)).campaign;expect(c.equipment).toMatchObject({weapon:'iron-blade',armor:'hide-coat',grapple:'grapple',glider:'glider'});expect(c.completed).toContain('traverse');await controls.resume();await checkpoint('03-crafted-equipped');
  });
  await test.step('Fight pursuing crypt guards using shield and counter-attacks',async()=>{
   await controls.walkTo(0,5.3);await controls.walkTo(0,3.2);
   // Both original guards can pursue the rescue. Fight where they actually are;
   // no teleport, HP edits, action calls, or forced reward grants are used.
   for(const i of [0,1]){const p=await read(page),e=p.enemies[i];if(e.hp>0&&Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<8)await controls.fight(i);}
   await checkpoint('04-crypt-threats');
  });
  await test.step('Reach the mist from the east perimeter, grapple, and collect the cache',async()=>{
   await controls.healFromInventory();for(const [x,z] of [[0,5.3],[3.5,5.3],[11,5.3],[11,-5.5],[7,-5.5]])await controls.walkTo(x,z);
   await controls.interact('grapple-mist',{x:7,y:4.1,z:-6.8});await expect.poll(async()=>(await read(page)).position.y,{timeout:90000}).toBeGreaterThan(3.15);await expect.poll(async()=>(await read(page)).grapple,{timeout:90000}).toBeNull();
   await controls.walkTo(7,-8);await controls.interact('mist-cache',{x:7,y:3.65,z:-9});await expect.poll(async()=>(await read(page)).campaign.items['mist-core']).toBe(1);await checkpoint('05-mist-cache');
  });
  await test.step('Use the equipped glider to return across the basin',async()=>{
   await controls.walkTo(7,-7);const p=await read(page);await controls.aim({x:7,y:p.position.y+1.52,z:4});await controls.action('[data-action="jump"]','Space');await expect.poll(async()=>(await read(page)).position.y).toBeGreaterThan(p.position.y+.12);await controls.action('[data-action="jump"]','Space');await expect.poll(async()=>(await read(page)).gliding).toBe(true);
   await expect.poll(async()=>(await read(page)).position.z,{timeout:120000}).toBeGreaterThan(1.4);await expect.poll(async()=>(await read(page)).gliding,{timeout:90000}).toBe(false);await controls.walkTo(7,4);await controls.walkTo(0,5.3);await controls.walkTo(-3.5,5.3);await checkpoint('06-glide-return');
  });
  await test.step('Defeat the warden if it stayed in the crypt, then upgrade the flame',async()=>{
   if((await read(page)).enemies[1].hp>0){await controls.walkTo(0,3.2);await controls.walkTo(0,-3);await controls.fight(1);await controls.walkTo(0,3.2);await controls.walkTo(0,5.3);await controls.walkTo(-3.5,5.3);}
   expect((await read(page)).campaign.items['warden-core']).toBe(1);await controls.interact('hearth',{x:-3,y:.9,z:4});await expect.poll(async()=>(await read(page)).campaign.flameTier).toBe(2);expect((await read(page)).campaign.items['mist-core']).toBe(0);expect((await read(page)).campaign.items['warden-core']).toBe(0);await checkpoint('07-flame-two');
  });
  await test.step('Pass the real northern passage and reach the ridge camp',async()=>{
   for(const [x,z] of [[0,3.2],[0,-3],[0,-10],[0,-14],[0,-15]])await controls.walkTo(x,z);await controls.interact('ridge-gate',{x:0,y:1.3,z:-17});await expect.poll(async()=>(await read(page)).campaign.gateOpen).toBe(true);
   for(const [x,z] of [[-1.5,-15],[-1.5,-19],[-1.5,-27],[0,-28.5]])await controls.walkTo(x,z);if((await read(page)).enemies[3].hp>0)await controls.fight(3);await controls.interact('nextcamp',{x:0,y:3.8,z:-31});await expect.poll(async()=>(await read(page)).campaign.campUnlocked).toBe(true);expect((await read(page)).campaign.completed).toContain('ridge');await checkpoint('08-ridge-camp');
   await page.screenshot({path:testInfo.outputPath('chapter-one-complete.png')});
  });
  await controls.menu('settings');const save=page.getByRole('button',{name:'今すぐ保存',exact:true});if(isMobile)await save.tap();else await save.click();await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');
 }finally{await controls.dispose();}
 expect(errors).toEqual([]);
});
