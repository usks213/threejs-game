import {desktopInputLabel} from './helpers/native-input';
import {test,expect} from '@playwright/test';
import {PlayerControls,choosePerformance} from './helpers/campaign-controls';
import {regionalFirstChapter} from './helpers/regional-first-chapter';
import {RegionalCombatControls} from './helpers/regional-combat-controls';
import {readRegional,readRegionalMotion,regionalEvidence} from './helpers/regional-evidence';
import {craftRegional,consumeRegional,recoverRegional,maintainRegionalGear,upgradeRegionalGear} from './helpers/regional-transactions';

test('Q07 regional: fresh game, all seven earned seals, final guardian and save reload',async({page,isMobile},testInfo)=>{
 // A new full-campaign budget, independent of the existing 20-minute short
 // jobs and 30-minute chapter case. Zero retries; no per-action relaxation.
 test.setTimeout(90*60*1000);
 testInfo.annotations.push({type:'input-mode',description:isMobile?'Android Chromium emulation: CDP analog movement, look, retained shield and action touches, plus actual menu taps; no physical-device claim':desktopInputLabel()});
 const errors:string[]=[],consoleErrors:string[]=[],failedResponses:{status:number;url:string}[]=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});page.on('response',response=>{if(response.status()>=400)failedResponses.push({status:response.status(),url:response.url()});});
 // The Core reference uses the supported v3 sampled world. Select it through
 // its public startup URL; no save or world state is injected.
 await page.goto('/?test=1&streaming=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect(page.locator('#error')).toBeHidden();
 const initial=await readRegional(page);expect(Object.values(initial.inventory).every(n=>n===0)).toBe(true);expect(initial.campaign.items).toEqual({});expect(initial.campaign.flameTier).toBe(0);expect(initial.campaign.claimedPoints).toEqual([]);expect(initial.campaign.claimedEnemies).toEqual([]);expect(initial.campaign.unlockedRegions).toEqual([]);expect(initial.campaign.skillPoints).toBe(0);expect(initial.campaign.level).toBe(1);expect(initial.combat.mana).toBe(100);expect(initial.streamedWorld).toBe(true);
 await choosePerformance(page,isMobile);const controls=new PlayerControls(page,isMobile),combat=new RegionalCombatControls(page,controls);
 await controls.activate('#start');await expect(page.locator('#game')).toHaveAttribute('data-running','true');await controls.initialize();
 const walk=async(points:number[][])=>{for(const [x,z] of points)await controls.walkTo(x,z);};
 const checkpoint=(name:string)=>regionalEvidence(page,testInfo,name,false,['12-first-regional-seal','18-fifth-regional-seal','22-final-guardian-defeated'].includes(name));
 const unlock=async(region:string,item:string)=>{const before=await readRegional(page);await controls.interact('hearth',{x:-3,y:.9,z:4});await expect.poll(async()=>(await readRegional(page)).campaign.unlockedRegions).toContain(region);const after=await readRegional(page);expect(after.campaign.unlockedRegions).toHaveLength(before.campaign.unlockedRegions.length+1);expect(after.campaign.items[item]).toBe(before.campaign.items[item]-(item==='sun-herb'?2:3));};
 const cache=async(id:string,seal:string,point:{x:number;y:number;z:number})=>{await controls.interact(id,point);await expect.poll(async()=>(await readRegional(page)).campaign.items[seal+'-seal']).toBe(1);expect((await readRegional(page)).campaign.claimedPoints).toContain(id);};
 try{
  await regionalEvidence(page,testInfo,'00-fresh-spawn',true);
  await regionalFirstChapter(page,controls,testInfo,checkpoint);
  await test.step('Earn the field and forest seals, then unlock the eastern fen',async()=>{
   await walk([[-8,-28.5],[-10,-20],[-10,7],[-16,7],[-20,7],[-23,7]]);await controls.interact('rg-field-herb',{x:-25,y:.8,z:8});await expect.poll(async()=>(await readRegional(page)).campaign.items['sun-herb']).toBe(3);
   await controls.walkTo(-23,5.5);await controls.fight(await combat.index(101));await controls.walkTo(-24,4);await cache('rg-field-cache','field',{x:-25,y:.55,z:3});await checkpoint('12-first-regional-seal');
   await walk([[-23,7],[-20,7],[-16,7],[-10,7],[-10,5.3],[-3.5,5.3]]);await unlock('resinwood','sun-herb');
   await walk([[0,5.3],[0,9.5],[-10,9.5],[-10,-9],[-16,-9],[-22,-9],[-26,-9],[-27,-6],[-30,-6]]);await controls.fight(await combat.index(102));await controls.walkTo(-30,-9);await cache('rg-wood-cache','wood',{x:-30,y:.55,z:-11});await checkpoint('13-forest-seal');
   await walk([[-30,-6],[-27,-6],[-26,-9],[-22,-9],[-16,-9],[-10,-9],[-10,5.3],[-3.5,5.3]]);await unlock('rootfen','amber-resin');await regionalEvidence(page,testInfo,'14-home-after-forest',true);
  });
  await test.step('Climb the fen stairs, defeat the spear guard and carry its seal home',async()=>{
   await walk([[0,5.3],[11,5.3],[11,3],[16,3],[16,-12],[21,-12],[24,-12]]);await combat.approachDuel(await combat.index(104),23.5,29);await walk([[23.5,-13.3],[27.5,-13.3]]);await cache('rg-fen-cache','fen',{x:28,y:2.55,z:-14});expect((await readRegional(page)).position.y).toBeGreaterThan(2);await checkpoint('15-third-regional-seal');
   await walk([[23.5,-13.3],[24,-12],[21,-12],[16,-12],[16,3],[11,3],[11,5.3],[0,5.3],[-3.5,5.3]]);await unlock('coppermesa','marsh-fiber');
  });
  await test.step('Follow the western mine approach, defeat its guard and earn the fourth seal',async()=>{
   await walk([[0,5.3],[0,9.5],[-10,9.5],[-10,-25],[-16,-25],[-20,-25],[-22,-25]]);await combat.approachDuel(await combat.index(106),-26,-21);await walk([[-26,-25],[-28,-24],[-30,-24],[-30,-25.5],[-30,-27]]);await cache('rg-mesa-cache','mesa',{x:-30,y:3.55,z:-29});await checkpoint('16-fourth-regional-seal');
   await walk([[-30,-24],[-28,-24],[-26,-25],[-20,-25],[-16,-25],[-10,-25],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]]);await unlock('cinderkeep','singing-copper');
  });
  await test.step('Spend earned skill points and materials on the late-region preparation',async()=>{
   await controls.menu('equipment');for(const id of ['vigor','endurance','attunement']){const before=await readRegional(page);expect(before.campaign.skillPoints).toBeGreaterThan(0);await controls.row(id+':1','learn');const after=await readRegional(page);expect(after.campaign.skillRanks?.[id]).toBe(1);expect(after.campaign.skillPoints).toBe(before.campaign.skillPoints-1);}await controls.resume();await maintainRegionalGear(page,controls,true);
   await craftRegional(page,controls,'bandage',5);await craftRegional(page,controls,'berry-meal',1);await consumeRegional(page,controls,'berry-meal');await recoverRegional(page,controls);
   await controls.walkTo(-4,7);await controls.interact('berries-0',{x:-5,y:.8,z:7});await walk([[-4,8.8],[-7,8.8]]);await controls.interact('berries-1',{x:-7,y:.8,z:7});await controls.walkTo(-9,8.8);await controls.interact('berries-2',{x:-9,y:.8,z:7});await walk([[-10,8.8],[-10,5.3],[-3.5,5.3]]);await craftRegional(page,controls,'bandage',4);await checkpoint('17-earned-skills-and-repaired-gear');
  });
  await test.step('Cross the ash ruins, defeat caster and summoner, then claim the fifth seal',async()=>{
   await walk([[0,5.3],[11,5.3],[11,3],[16,3],[13,-27],[13,-33],[16,-33],[16,-30],[22,-30],[23,-28],[26,-28],[26,-30.5]]);await combat.assault(await combat.index(107));await controls.healFromInventory();await controls.walkTo(27,-31);await combat.assault(await combat.index(108));await expect.poll(async()=>(await readRegional(page)).campaign.items['bell-caller-core']).toBe(1);
   await controls.walkTo(28,-34);await cache('rg-ash-cache','ash',{x:29,y:3.55,z:-35});await checkpoint('18-fifth-regional-seal');
   await walk([[26,-32],[26,-28],[23,-28],[22,-30],[16,-30],[16,-33],[13,-33],[13,3],[11,3],[11,5.3],[0,5.3],[-3.5,5.3]]);await unlock('rimepass','ash-glass');
  });
  await test.step('Prepare medicine from finite berry beds before the snow ascent',async()=>{
   await controls.walkTo(-4,5.8);await controls.interact('berries-3',{x:-5,y:.8,z:5});await controls.walkTo(-6,4.1);await controls.interact('berries-4',{x:-7,y:.8,z:5});await controls.walkTo(-8.3,4.1);await controls.interact('berries-5',{x:-9,y:.8,z:5});await walk([[-10,4.1],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3],[-3.5,2.2]]);await controls.interact('berries-6',{x:-5,y:.8,z:3});await maintainRegionalGear(page,controls);await craftRegional(page,controls,'bandage',6);await recoverRegional(page,controls);
  });
  await test.step('Jump the snow step, defeat the ice keeper and return with the sixth seal',async()=>{
   await walk([[0,5.3],[0,9.5],[-10,9.5],[-10,-33],[-7,-33],[-7,-40],[-7,-42.5]]);await controls.action('[data-action=jump]','Space');await walk([[-7,-44],[-7,-48]]);await combat.assault(await combat.index(109),-10,-4);await expect.poll(async()=>(await readRegional(page)).campaign.items['ice-keeper-core']).toBe(1);
   await controls.walkTo(-5,-50.5);await cache('rg-rime-cache','rime',{x:-4,y:5.55,z:-52});await checkpoint('19-sixth-regional-seal');await controls.walkTo(-8.5,-51);const before=await readRegional(page);await controls.interact('rg-rime-crystal',{x:-10,y:5.9,z:-52});await expect.poll(async()=>(await readRegional(page)).campaign.claimedPoints).toContain('rg-rime-crystal');expect((await readRegional(page)).inventory[3]).toBe(before.inventory[3]+6);
   await walk([[-7,-48],[-7,-44],[-7,-40],[-7,-33],[-10,-33],[-10,9.5],[0,9.5],[0,5.3],[-3.5,2.2]]);await unlock('mirrorlake','rime-heart');await maintainRegionalGear(page,controls);await controls.menu('equipment');await upgradeRegionalGear(page,controls,'iron-blade');await controls.resume();
  });
  await test.step('Harvest actual foliage and prepare the final finite mana and medicine budget',async()=>{
   await walk([[-3.5,5.3],[0,5.3],[0,9.5],[-10,9.5],[-10,1.9],[-6,1.9]]);await controls.action('#tool-switch','Digit2');await controls.gather(7,56,[{x:-5.75,y:3.4,z:3},{x:-5.4,y:3.5,z:3},{x:-6.1,y:3.5,z:3}],'tree0');await controls.action('#tool-switch','Digit1');await walk([[-10,1.9],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]]);
   await craftRegional(page,controls,'berry-meal',1);await consumeRegional(page,controls,'berry-meal');await craftRegional(page,controls,'bandage',8);await recoverRegional(page,controls);await regionalEvidence(page,testInfo,'20-prepared-home',true);
   await walk([[0,5.3],[11,5.3],[11,3],[13,3],[13,-40],[13,-44],[15,-45.7]]);await combat.approachDuel(await combat.index(110),9.5,16.5);await controls.healFromInventory();await craftRegional(page,controls,'mana-draught',14);expect((await readRegional(page)).campaign.items['mana-draught']).toBe(14);
  });
  await test.step('Defeat the final guardian from the western shore with earned water and lightning',async()=>{
   await walk([[10,-44],[9.5,-47]]);await checkpoint('21-final-guardian-approach');await combat.shoreDuel(await combat.index(111));await expect.poll(async()=>(await readRegional(page)).campaign.items['tide-guardian-core']).toBe(1);await controls.healFromInventory();await checkpoint('22-final-guardian-defeated');
  });
  await test.step('Dive to the final cache, return with oxygen and discover the shore hearth',async()=>{
   await controls.walkTo(10,-48);await controls.aim({x:13,y:1.3,z:-50});await combat.swim(p=>p.position.x>12.1,6,'swim into lake vault');await cache('rg-lake-cache','lake',{x:13,y:1.55,z:-50});
   await controls.aim({x:10,y:4.8,z:-48});await combat.swim(p=>p.position.x<10.7&&p.position.y>2.7,12,'swim back to the western bank');await controls.walkTo(10,-46.5);await controls.interact('rg-lake-hearth',{x:10,y:3.9,z:-45});await expect.poll(async()=>(await readRegional(page)).campaign.claimedPoints).toContain('rg-lake-hearth');expect((await readRegionalMotion(page)).oxygen).toBeGreaterThan(0);await checkpoint('23-seventh-regional-seal-returned');
   const done=await readRegional(page);expect(done.campaign.deaths).toBe(0);expect(done.campaign.unlockedRegions).toHaveLength(7);for(const seal of ['field','wood','fen','mesa','ash','rime','lake'])expect(done.campaign.items[seal+'-seal']).toBe(1);expect(done.campaign.claimedEnemies).toEqual(expect.arrayContaining([101,102,104,106,107,108,109,110,111].map(id=>'regional:'+id)));expect(done.campaign.claimedPoints).toEqual(expect.arrayContaining(['rg-field-cache','rg-field-herb','rg-wood-cache','rg-fen-cache','rg-mesa-cache','rg-ash-cache','rg-rime-cache','rg-lake-cache']));await expect(page.locator('#objective')).toContainText('七つの灯をつないだ');await regionalEvidence(page,testInfo,'24-completed-shore',true);
  });
  await test.step('Save from the actual menu and reload all earned progression',async()=>{
   await controls.menu('settings');await expect.poll(async()=>(await readRegional(page)).worldReady,{timeout:120000}).toBe(true);const save=page.getByRole('button',{name:'今すぐ保存',exact:true});if(isMobile)await save.tap();else await save.click();await expect.poll(async()=>(await readRegional(page)).saveStatus).toContain('保存済み');const saved=await readRegional(page);
   await testInfo.attach('25-saved-regional-state',{body:JSON.stringify({campaign:saved.campaign,inventory:saved.inventory,position:saved.position,combat:saved.combat,weather:saved.weather,worldSamples:saved.worldSamples,spells:{casts:combat.casts,doses:combat.doses,water:combat.waterCasts,lightning:combat.lightningCasts}},null,2),contentType:'application/json'});
   await controls.dispose();await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await readRegional(page)).worldReady,{timeout:120000}).toBe(true);await expect.poll(async()=>(await readRegional(page)).saveStatus).toContain('読み込みました');const restored=await readRegional(page);
   expect(restored.restoreFailure).toBeNull();expect(restored.campaign).toEqual(saved.campaign);expect(restored.inventory).toEqual(saved.inventory);expect(restored.worldSamples).toEqual(saved.worldSamples);expect(restored.weather).toEqual(saved.weather);expect(restored.combat.mana).toBe(saved.combat.mana);expect(restored.focus).toBe(saved.focus);expect(restored.position.x).toBeCloseTo(saved.position.x,2);expect(restored.position.y).toBeCloseTo(saved.position.y,2);expect(restored.position.z).toBeCloseTo(saved.position.z,2);expect(restored.settings.graphics).toBe('performance');
   await controls.activate('#start');await expect(page.locator('#game')).toHaveAttribute('data-running','true');await controls.initialize();await expect(page.locator('#objective')).toContainText('七つの灯をつないだ');await regionalEvidence(page,testInfo,'26-completed-world-reloaded',true);
  });
 }finally{
  await combat.stop();await controls.shield(false);await controls.dispose();await testInfo.attach('browser-diagnostics',{body:JSON.stringify({errors,consoleErrors,failedResponses},null,2),contentType:'application/json'});
 }
 expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);expect(failedResponses).toEqual([]);
});
