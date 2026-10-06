import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {PlayerControls,read} from './campaign-controls';

/** The established browser first chapter, with sixteen additionally harvested
 * stone for fourteen final mana doses and the net late gear-upgrade reserve,
 * plus five grass to cover guaranteed medicine/food costs. The existing case
 * is unchanged. All inputs, waypoint tolerance and harvest bounds are shared. */
export async function regionalFirstChapter(page:Page,controls:PlayerControls,testInfo:TestInfo,checkpoint:(name:string)=>Promise<void>){
  await test.step('Harvest a real material budget and establish the hearth',async()=>{
   await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,24,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95}],'sample-wood');
   await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,22,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
   await controls.walkTo(-3.45,6.65);await controls.gather(7,19,[{x:-3.45,y:.5,z:7.9},{x:-3.1,y:.5,z:7.9},{x:-3.8,y:.5,z:7.9}],'sample-grass');
   await controls.walkTo(-3.45,5.3);await controls.walkTo(2.5,5.3);await controls.walkTo(2.5,5.75);await controls.gather(6,4,[{x:2.5,y:.8,z:7.1},{x:2.8,y:.8,z:7.1},{x:2.2,y:.8,z:7.1}],'sample-metal');
   await controls.walkTo(2.5,5.3);await controls.walkTo(-3.5,5.3);await controls.interact('hearth',{x:-3,y:.9,z:4});await expect.poll(async()=>(await read(page)).campaign.flameTier).toBe(1);await checkpoint('01-hearth-materials');
  });
  await test.step('Enter the crypt and physically rescue the artisan',async()=>{
   await controls.action('#tool-switch','Digit1');await controls.walkTo(0,5.3);await controls.walkTo(0,3.2);await controls.interact('door',{x:0,y:1.4,z:1});
   // The normal Core route lures from z3.2 after opening the real door.
   // Keep that margin: crossing inside while the guard approaches can wake the warden.
   // Clear the entrance guard before turning away toward the artisan. The trace
   // showed an unguarded rescue approach taking fatal hits during the turn.
   if((await read(page)).enemies[0].hp>0)await controls.fight(0);await controls.healFromInventory();
   // The browser trace rescues successfully, then takes three warden hits
   // while making the interaction/return turns. Resolve its approach facing
   // north at the open doorway before turning toward the left-hand alcove.
   await controls.walkTo(0,0);if((await read(page)).enemies[1].hp>0)await controls.fight(1);await controls.walkTo(0,0);
   await controls.walkTo(-2.4,-1.8);await controls.interact('artisan',{x:-2.5,y:1.1,z:-3.5});await expect.poll(async()=>(await read(page)).campaign.artisanRescued).toBe(true);
   await controls.walkTo(0,0);await controls.walkTo(0,3.2);await controls.walkTo(0,5.3);await controls.walkTo(-3.5,5.3);await checkpoint('02-artisan-rescued');
  });
  await test.step('Craft and equip travel gear through the actual menus',async()=>{
   await controls.menu('crafting');for(const id of ['iron-blade','hide-coat','grapple','glider','bandage','bandage','berry-meal'])await controls.row(id,'craft');
   await controls.activate('[data-tab="inventory"]');for(const id of ['iron-blade','hide-coat','grapple','glider'])await controls.row(id,'equip');await controls.row('berry-meal','consume');
   // Food raises the HP ceiling without healing. The rescue trace returned with
   // 24 HP and a pursuing warden; spend only the two crafted bandages here,
   // while the inventory is already open, before attempting a combat turn.
   for(let used=0;used<2;used++){
    const before=await read(page);if(before.hp>=70)break;
    expect(before.campaign.items.bandage,'Rescue recovery must use an owned bandage').toBeGreaterThan(0);await controls.row('bandage','consume');
    await expect.poll(async()=>(await read(page)).hp).toBe(before.hp+25);expect((await read(page)).campaign.items.bandage).toBe(before.campaign.items.bandage-1);
   }
   expect((await read(page)).hp,'Recover before resuming near the pursuing warden').toBeGreaterThanOrEqual(70);
   const c=(await read(page)).campaign;expect(c.equipment).toMatchObject({weapon:'iron-blade',armor:'hide-coat',grapple:'grapple',glider:'glider'});expect(c.completed).toContain('traverse');await controls.resume();await checkpoint('03-crafted-equipped');
  });
  await test.step('Fight pursuing crypt guards using shield and counter-attacks',async()=>{
   // Both original guards can pursue the rescue. Fight where they actually are;
   // do not turn through extra crypt waypoints with the warden already in reach.
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
   await controls.walkTo(8,-8);await controls.walkTo(8,-7.5);const p=await read(page);await controls.aim({x:7,y:p.position.y+1.52,z:4});await controls.action('[data-action="jump"]','Space');await expect.poll(async()=>(await read(page)).position.y).toBeGreaterThan(p.position.y+.12);await controls.action('[data-action="jump"]','Space');await expect.poll(async()=>(await read(page)).gliding).toBe(true);
   await expect.poll(async()=>(await read(page)).position.z,{timeout:120000}).toBeGreaterThan(1.4);
   // Fold over solid southern ground instead of gliding beyond the map edge.
   await controls.action('[data-action="jump"]','Space');await expect.poll(async()=>(await read(page)).gliding).toBe(false);await expect.poll(async()=>(await read(page)).position.y,{timeout:90000}).toBeLessThan(.4);expect((await read(page)).position.y).toBeGreaterThan(-.1);await controls.healFromInventory();await controls.walkTo(7,4);await controls.walkTo(0,5.3);await controls.walkTo(-3.5,5.3);await checkpoint('06-glide-return');
  });
  await test.step('Defeat the warden if it stayed in the crypt, then upgrade the flame',async()=>{
   if((await read(page)).enemies[1].hp>0){await controls.walkTo(0,5.3);await controls.walkTo(0,3.2);await controls.walkTo(0,-3);await controls.fight(1);await controls.walkTo(0,3.2);await controls.walkTo(0,5.3);await controls.walkTo(-3.5,5.3);}
   expect((await read(page)).campaign.items['warden-core']).toBe(1);await controls.interact('hearth',{x:-3,y:.9,z:4});await expect.poll(async()=>(await read(page)).campaign.flameTier).toBe(2);expect((await read(page)).campaign.items['mist-core']).toBe(0);expect((await read(page)).campaign.items['warden-core']).toBe(0);await checkpoint('07-flame-two');
   // Keep a finite reserve for the final guard: six of the grass collected at
   // spawn and two cloth from the actual rescue/warden rewards. The CI trace
   // reached this point at 68.2 HP after using both bandages and its one flask.
   await controls.menu('crafting');const before=await read(page);
   for(let count=0;count<2;count++)await controls.row('bandage','craft');
   const prepared=await read(page);expect(prepared.inventory[7]).toBe(before.inventory[7]-6);expect(prepared.inventory[10]).toBe(before.inventory[10]-2);expect(prepared.campaign.items.bandage).toBe((before.campaign.items.bandage??0)+2);
   await controls.activate('[data-tab="inventory"]');
   if(prepared.hp<70){await controls.row('bandage','consume');await expect.poll(async()=>(await read(page)).hp).toBe(prepared.hp+25);}
   await controls.resume();await checkpoint('08-ridge-supplies');
  });
  await test.step('Pass the real northern passage and reach the ridge camp',async()=>{
   for(const [x,z] of [[0,5.3],[0,3.2],[0,-3],[2,-8],[2,-11.1],[0,-11.1],[0,-14],[0,-15]])await controls.walkTo(x,z);await controls.interact('ridge-gate',{x:0,y:1.3,z:-17});await expect.poll(async()=>(await read(page)).campaign.gateOpen).toBe(true);
   // Meet the approaching guard before walking past it. The failed trace
   // continued through z=-28.5 and spent three enemy attacks turning back.
   for(const [x,z] of [[-1.5,-15],[-1.5,-19],[-1.5,-24]])await controls.walkTo(x,z);await checkpoint('09-ridge-approach');
   if((await read(page)).enemies[3].hp>0)await controls.fight(3);await checkpoint('10-ridge-guard-defeated');
   await controls.walkTo(-1.5,-27);await controls.walkTo(0,-28.5);await controls.interact('nextcamp',{x:0,y:3.8,z:-31});await expect.poll(async()=>(await read(page)).campaign.campUnlocked).toBe(true);expect((await read(page)).campaign.completed).toContain('ridge');await checkpoint('11-ridge-camp');
   await page.screenshot({path:testInfo.outputPath('chapter-one-complete.png')});
  });
}
