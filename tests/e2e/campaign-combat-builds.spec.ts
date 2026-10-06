import {test,expect,type Page} from '@playwright/test';
import {PlayerControls,choosePerformance} from './helpers/campaign-controls';
import {RangedCampaignControls,readRanged} from './helpers/ranged-campaign-controls';

async function craftExactly(page:Page,controls:PlayerControls,id:string,count:number,cost:Record<number,number>,outputCount=1){
 const before=await readRanged(page);for(let i=0;i<count;i++)await controls.row(id,'craft');
 const after=await readRanged(page);expect(after.campaign.items[id]).toBe((before.campaign.items[id]??0)+count*outputCount);
 for(const [key,n] of Object.entries(cost))expect(after.inventory[Number(key)],`${id} must spend its actually gathered material ${key}`).toBe(before.inventory[Number(key)]-n*count);
}

/** These are independent new games. Context isolation supplies empty browser
 * storage; no saved fixture, simulation mutation or direct Core action is used. */
for(const build of ['bow','staff'] as const)test(`Q03 ${build}: fresh game, earned supplies, artisan rescue and crypt core boss through real controls`,async({page,isMobile},testInfo)=>{
 // Same budget as the existing real-input first-chapter route. No test retries
 // or extended movement/aim/guard tolerances are introduced for these builds.
 test.setTimeout(1800000);testInfo.annotations.push({type:'input-mode',description:isMobile?'Actual Android touch movement, held shield, look drag and ranged actions':'Production keyboard movement/look, Z shield and T/G ranged actions'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 const initial=await readRanged(page);expect(Object.values(initial.inventory).every(n=>n===0)).toBe(true);expect(initial.campaign.items).toEqual({});expect(initial.campaign.flameTier).toBe(0);expect(initial.campaign.artisanRescued).toBe(false);expect(initial.campaign.level).toBe(1);expect(initial.campaign.skillPoints).toBe(0);expect(initial.combat.mana).toBe(100);
 await choosePerformance(page,isMobile);if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 const controls=new PlayerControls(page,isMobile),combat=new RangedCampaignControls(page,controls,build);await controls.initialize();
 const screenshot=async(name:string)=>{const path=testInfo.outputPath(`${build}-${name}.png`);await page.screenshot({path});await testInfo.attach(`${build}-${name}`,{path,contentType:'image/png'});};
 await screenshot('01-fresh-start');
 const checkpoint=async(name:string)=>{const p=await readRanged(page);expect(p.hp).toBeGreaterThan(0);expect(p.campaign.deaths).toBe(0);await testInfo.attach(`${build}-${name}`,{body:JSON.stringify({position:p.position,hp:p.hp,stamina:p.stamina,mana:p.combat.mana,selectedElement:p.selectedElement,inventory:p.inventory,campaign:p.campaign,enemies:p.enemies.slice(0,2),used:{arrows:combat.shots,casts:combat.casts,manaDoses:combat.doses}},null,2),contentType:'application/json'});};
 try{
  await test.step('Gather finite material reserves and light the actual hearth',async()=>{
   await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,24,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95}],'sample-wood');
   await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,24,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5},{x:-4.6,y:.5,z:7}],'sample-stone');
   await controls.walkTo(-3.45,6.65);await controls.gather(7,20,[{x:-3.45,y:.5,z:7.9},{x:-3.1,y:.5,z:7.9},{x:-3.8,y:.5,z:7.9}],'sample-grass');await controls.walkTo(-3.5,5.3);
   const before=await readRanged(page);await controls.interact('hearth',{x:-3,y:.9,z:4});await expect.poll(async()=>(await readRanged(page)).campaign.flameTier).toBe(1);const after=await readRanged(page);expect(after.inventory[4]).toBe(before.inventory[4]-8);expect(after.inventory[3]).toBe(before.inventory[3]-6);expect(after.campaign.completed).toEqual(expect.arrayContaining(['gather','hearth']));
   // The three spawn plants are finite. The shared open-perimeter route reaches
   // real tree foliage for medicine, meals and the mage's recovery reserve.
   for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,1.9],[-6,1.9]])await controls.walkTo(x,z);
   await controls.gather(7,48,[{x:-5.75,y:3.4,z:3},{x:-5.4,y:3.5,z:3},{x:-6.1,y:3.5,z:3}],'tree0');await screenshot('02-forest-gathering');
   for(const [x,z] of [[-10,1.9],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]])await controls.walkTo(x,z);await checkpoint('01-gathered-budget');
  });
  await test.step('Handcraft and equip the chosen build before its first enemy',async()=>{
   await controls.menu('crafting');await expect(page.locator('[data-item=hide-coat] [data-command=craft]')).toBeDisabled();
   await craftExactly(page,controls,build,1,build==='bow'?{4:6,7:4}:{4:4,3:3,7:2});
   if(build==='bow')await craftExactly(page,controls,'arrows',4,{4:1,3:1},8);else await craftExactly(page,controls,'mana-draught',12,{7:2,3:1});
   await craftExactly(page,controls,'berry-meal',2,{7:4});await controls.activate('[data-tab=inventory]');await controls.row(build,'equip');await controls.row('berry-meal','consume');
   const p=await readRanged(page);expect(p.campaign.equipment.weapon).toBe(build);expect(p.campaign.artisanRescued).toBe(false);expect(p.campaign.skillPoints).toBe(0);expect(p.campaign.items[build==='bow'?'arrows':'mana-draught']).toBe(build==='bow'?32:12);await controls.resume();await controls.action('#tool-switch','Digit1');expect((await readRanged(page)).tool,'Equipping and selecting a weapon must not toggle back to the mobile chisel').toBe(false);await expect(page.locator('[data-action=block]')).toBeEnabled();await checkpoint('02-crafted-build');await screenshot('03-equipped-hearth');
  });
  await test.step('Defeat the entrance guard with the chosen ranged build and physically rescue the artisan',async()=>{
   await controls.walkTo(0,5.3);await controls.walkTo(0,3.2);await controls.interact('door',{x:0,y:1.4,z:1});const lure=await readRanged(page);expect(Math.hypot(lure.position.x,lure.position.z-3.2)).toBeLessThan(.18);expect(lure.enemies[1].awareness,'The first-guard lure must stay outside warden awareness').toBe('idle');await combat.fight(0,()=>screenshot('04-guarded-crypt-combat'));expect((await readRanged(page)).enemies[1].awareness,'Defeat the entrance guard before entering warden range').toBe('idle');await controls.healFromInventory();
   expect((await readRanged(page)).enemies[0].hp).toBe(0);await controls.walkTo(0,0);await controls.walkTo(-2.4,-1.8);await controls.interact('artisan',{x:-2.5,y:1.1,z:-3.5});await expect.poll(async()=>(await readRanged(page)).campaign.artisanRescued).toBe(true);
   for(const [x,z] of [[0,0],[0,3.2],[0,5.3],[-3.5,5.3]])await controls.walkTo(x,z);await checkpoint('03-earned-artisan');
  });
  await test.step('Use the earned forge and level point, then prepare finite recovery',async()=>{
   await controls.menu('crafting');await expect(page.locator('[data-item=hide-coat] [data-command=craft]')).toBeEnabled();await craftExactly(page,controls,'hide-coat',1,{7:6,10:4});await craftExactly(page,controls,'bandage',2,{7:3,10:1});
   await controls.activate('[data-tab=inventory]');await controls.row('hide-coat','equip');await controls.row('berry-meal','consume');
   const earned=await readRanged(page);expect(earned.campaign.completed).toEqual(expect.arrayContaining(['rescue','forge']));expect(earned.campaign.xp).toBeGreaterThanOrEqual(80);expect(earned.campaign.skillPoints).toBeGreaterThan(0);
   await controls.activate('[data-tab=equipment]');await controls.row('vigor:1','learn');const learned=await readRanged(page);expect(learned.campaign.skillRanks.vigor).toBe(1);expect(learned.campaign.skillPoints).toBe(earned.campaign.skillPoints-1);
   await controls.activate('[data-tab=inventory]');for(let i=0;i<2;i++){const before=await readRanged(page);if(before.hp>=70)break;await controls.row('bandage','consume');expect((await readRanged(page)).campaign.items.bandage).toBe(before.campaign.items.bandage-1);await expect.poll(async()=>(await readRanged(page)).hp).toBe(before.hp+25);}
   expect((await readRanged(page)).hp,'Spend owned recovery before the boss approach').toBeGreaterThanOrEqual(70);await controls.resume();await checkpoint('04-earned-gear-and-skill');
  });
  await test.step('Defeat the actual crypt boss and verify finite supply accounting',async()=>{
   const p=await readRanged(page),boss=p.enemies[1];if(Math.hypot(boss.position.x-p.position.x,boss.position.z-p.position.z)>=8)for(const [x,z] of [[0,5.3],[0,3.2],[0,-3]])await controls.walkTo(x,z);
   await combat.fight(1,()=>screenshot('05-warden-combat'));await expect.poll(async()=>(await readRanged(page)).campaign.items['warden-core']).toBe(1);const done=await readRanged(page);expect(done.enemies[0].hp).toBe(0);expect(done.enemies[1].hp).toBe(0);expect(done.campaign.completed).toContain('warden');expect(done.campaign.artisanRescued).toBe(true);expect(done.campaign.equipment).toMatchObject({weapon:build,armor:'hide-coat'});expect(done.campaign.deaths).toBe(0);expect(done.hp).toBeGreaterThan(0);
   if(build==='bow'){expect(combat.shots).toBeGreaterThan(0);expect(done.campaign.items.arrows).toBe(32-combat.shots);expect(done.combat.mana).toBe(100);expect(combat.casts).toBe(0);}
   else{expect(combat.casts).toBeGreaterThan(5);expect(combat.doses).toBeGreaterThan(0);expect(done.campaign.items['mana-draught']).toBe(12-combat.doses);expect(done.combat.mana).toBe(100+60*combat.doses-20*combat.casts);expect(done.enemies[1].scars).toBeGreaterThan(0);expect(combat.shots).toBe(0);}
   await checkpoint('05-core-boss-defeated');await screenshot('06-core-boss-defeated');
  });
 }finally{await controls.shield(false);await controls.dispose();}
 expect(errors).toEqual([]);
});
