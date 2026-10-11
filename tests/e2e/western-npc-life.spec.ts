import {test,expect,type Page} from '@playwright/test';
import type {WesternNpcLifeState} from '../../src/prototype/core/western-npc-life';
import {westernLifeFixture} from './helpers/western-life-fixture';
import {PlayerControls,read,type CampaignProbe} from './helpers/campaign-controls';
const life=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as CampaignProbe&{westernNpcLife:WesternNpcLifeState;campaign:CampaignProbe['campaign']&{xp:number}});
for(const sleep of [false,true])test(`seeded western residents: ${sleep?'separate sheltered beds':'visible walking to work'}, live targeting, finite dialogue and reload`,async({page,isMobile},testInfo)=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));const raw=westernLifeFixture(sleep);
 await page.addInitScript(raw=>{if(!sessionStorage.getItem('western-life-seeded')){localStorage.setItem('ash-campaign-v4',raw);localStorage.setItem('ash-campaign-active-format','campaign-v4');sessionStorage.setItem('western-life-seeded','1');}},raw);
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:120000});expect((await read(page)).restoreFailure).toBeNull();const initial=(await life(page)).westernNpcLife;
 if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
  await expect.poll(async()=>Object.values((await life(page)).westernNpcLife.actors).map(a=>a?.activity),{timeout:120000}).toEqual([sleep?'sleep':'work',sleep?'sleep':'work']);
  if(!sleep){const current=(await life(page)).westernNpcLife;for(const id of ['west-carpenter','west-alchemist'] as const)expect(Math.hypot(current.actors[id]!.position.x-initial.actors[id]!.position.x,current.actors[id]!.position.z-initial.actors[id]!.position.z)).toBeGreaterThan(.5);await controls.walkTo(-47.2,-13.8);}
  await page.screenshot({path:testInfo.outputPath(sleep?'western-two-sheltered-beds.png':'western-two-work-poses.png')});
  for(const id of ['west-carpenter','west-alchemist'] as const){const actor=(await life(page)).westernNpcLife.actors[id]!,before=await life(page);await controls.aim({...actor.position,y:actor.position.y+(sleep?.75:1.1)});const aimed=await life(page);await testInfo.attach(id+'-live-target',{body:JSON.stringify({expected:id,before:actor,after:aimed.westernNpcLife.actors[id],player:aimed.position,yaw:aimed.yaw,pitch:aimed.pitch,coreTarget:aimed.target,seconds:aimed.seconds}),contentType:'application/json'});await expect(page.locator('#game')).toHaveAttribute('data-target',id);for(let i=0;i<2;i++)await controls.action('[data-action="interact"]','KeyE');await expect.poll(async()=>(await life(page)).westernNpcLife.actors[id]?.activity).toBe('talking');const after=await life(page);expect(after.campaign.xp).toBe(before.campaign.xp);expect(after.inventory).toEqual(before.inventory);}
  await controls.menu('settings');const save=page.getByRole('button',{name:'今すぐ保存',exact:true});if(isMobile)await save.tap();else await save.click();await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');const saved=(await life(page)).westernNpcLife;
  await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:120000});await expect.poll(async()=>(await read(page)).saveStatus).toContain('読み込みました');expect((await life(page)).westernNpcLife).toEqual(saved);expect((await read(page)).restoreFailure).toBeNull();
 }finally{await controls.dispose();}expect(errors).toEqual([]);
});
