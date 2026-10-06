import {expect,type Page} from '@playwright/test';
import {PlayerControls,readMotion,type CampaignProbe} from './campaign-controls';

export type RangedBuild='bow'|'staff';
export interface RangedProbe extends CampaignProbe {
 selectedElement:string;focus:number;combat:{mana:number;pending:string|null};
 enemies:(CampaignProbe['enemies'][number]&{wet:number;shock:number;scars:number;awareness:string})[];
 campaign:CampaignProbe['campaign']&{xp:number;level:number;skillPoints:number;skillRanks:Record<string,number>};
}
export const readRanged=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as RangedProbe);

/** Observe an actual input's transient cast phase, including slow CDP delivery.
 * The callback only reads the existing telemetry and retains detached evidence. */
async function observeRangedInput(page:Page){
 const handle=await page.evaluateHandle(()=>{let seen=false;const timer=setInterval(()=>{const state=Reflect.get(window,'__inputProbe') as {phase:string}|undefined;if(state?.phase==='cast')seen=true;},10);return {read:()=>seen,stop:()=>clearInterval(timer)};});
 return {read:()=>handle.evaluate(value=>value.read()),async dispose(){await handle.evaluate(value=>value.stop()).catch(()=>{});await handle.dispose().catch(()=>{});}};
}

export class RangedCampaignControls {
 shots=0;casts=0;doses=0;
 constructor(private page:Page,private controls:PlayerControls,readonly build:RangedBuild){}
 private async chooseElement(element:'water'|'lightning'){
  for(let i=0;i<5&&(await readRanged(this.page)).selectedElement!==element;i++)await this.controls.action('#element-switch','KeyF');
  expect((await readRanged(this.page)).selectedElement).toBe(element);
 }
 private async replenish(){
  const p=await readRanged(this.page);if(this.build!=='staff'||p.combat.mana>=20)return;
  expect(p.campaign.items['mana-draught'],'The mage must have crafted a finite recovery dose').toBeGreaterThan(0);
  await this.controls.menu('inventory');await this.controls.row('mana-draught','consume');
  await expect.poll(async()=>(await readRanged(this.page)).combat.mana).toBe(Math.min(100,p.combat.mana+60));
  expect((await readRanged(this.page)).campaign.items['mana-draught']).toBe(p.campaign.items['mana-draught']-1);this.doses++;await this.controls.resume();
 }
 /** Keep the shield up while aiming at surviving enemy material. The target
  * label is rendered by the real reticle ray, not an injected hit/target API. */
 private async aimEnemy(index:number){
  const name=index===1?'銅殻の番人':'灰の番兵';
  for(const height of [1.35,.95,.55,1.65]){
   const p=await readMotion(this.page),e=p.enemies[index];if(e.hp<=0)return;
   await this.controls.aim({...e.position,y:e.position.y+height},true);
   if(await this.page.locator('#target').textContent()===name)return;
  }
  await expect(this.page.locator('#target'),'A surviving enemy voxel must be visible through the real reticle').toHaveText(name);
 }
 async fight(index:number,onCombatReady?:()=>Promise<void>){
  let capturedCombat=false;
  for(let round=0;round<28&&(await readMotion(this.page)).enemies[index].hp>0;round++){
   await expect.poll(async()=>(await readMotion(this.page)).phase).toBe('idle');await this.controls.healFromInventory();await this.replenish();
   let p=await readRanged(this.page);expect(p.hp,'The ranged route must remain alive').toBeGreaterThan(0);expect(p.campaign.equipment.weapon).toBe(this.build);
   if(p.stamina<35){await this.controls.retreat();await expect.poll(async()=>(await readRanged(this.page)).stamina,{timeout:60000}).toBeGreaterThan(65);continue;}
   if(this.build==='staff')await this.chooseElement(round%3===0?'water':'lightning');
   const observer=await observeRangedInput(this.page);
   try{
    await this.controls.aim({...p.enemies[index].position,y:p.enemies[index].position.y+1.35},true);
    // The doorway activates the guard without activating the more distant
    // warden. Wait for its real approach while facing it with the shield raised.
    await expect.poll(async()=>{const state=await readMotion(this.page),enemy=state.enemies[index];expect(state.hp,'The guarded approach must preserve life').toBeGreaterThan(0);return enemy.hp<=0||Math.hypot(enemy.position.x-state.position.x,enemy.position.z-state.position.z)<2.5;},{timeout:90000,intervals:[50,100]}).toBe(true);
    if((await readMotion(this.page)).enemies[index].hp<=0)break;
    await this.aimEnemy(index);
    if(onCombatReady&&!capturedCombat){await onCombatReady();capturedCombat=true;}
    // Aiming can consume an old recovery. Counter a newly observed opening.
    if(['recover','stagger'].includes((await readMotion(this.page)).enemies[index].phase))await expect.poll(async()=>{const state=await readMotion(this.page);expect(state.hp).toBeGreaterThan(0);return state.enemies[index].hp<=0||!['recover','stagger'].includes(state.enemies[index].phase);},{timeout:90000,intervals:[50,100]}).toBe(true);
    await expect.poll(async()=>{const state=await readMotion(this.page);expect(state.hp,'Guarding must preserve life').toBeGreaterThan(0);return ['recover','stagger','dead'].includes(state.enemies[index].phase);},{timeout:90000,intervals:[50,100]}).toBe(true);
    // The newly observed attack changes pose/position after the earlier aim.
    // A damaged torso can leave that ray in empty space. Reacquire surviving
    // material through the real reticle while the shield is still held.
    if((await readMotion(this.page)).enemies[index].hp>0)await this.aimEnemy(index);
    p=await readRanged(this.page);if(p.enemies[index].hp<=0)break;
    // Precision look may consume this opening. Keep the same 28-round bound
    // and start another guarded cycle instead of committing a stale shot/cast.
    if(!['recover','stagger'].includes(p.enemies[index].phase))continue;
    // Real guard contacts during the aiming/waiting interval can exhaust the
    // action budget. Recover with the normal movement route on the next turn.
    if(p.stamina<(this.build==='staff'?18:8))continue;
    await this.controls.shield(false);
    if(this.build==='bow'){
     expect(p.campaign.items.arrows,'Every shot needs a crafted arrow').toBeGreaterThan(0);await this.controls.action('[data-action=attack]','KeyT');
     await expect.poll(async()=>(await readRanged(this.page)).campaign.items.arrows).toBe(p.campaign.items.arrows-1);this.shots++;
    }else{
     expect(p.combat.mana).toBeGreaterThanOrEqual(20);await this.controls.action('#cast','KeyG');
     await expect.poll(async()=>(await readRanged(this.page)).combat.mana).toBe(p.combat.mana-20);this.casts++;
    }
    await expect.poll(()=>observer.read()).toBe(true);
    await expect.poll(async()=>{const state=await readMotion(this.page);expect(state.hp,'The committed ranged action must preserve life').toBeGreaterThan(0);return state.phase;},{timeout:60000,intervals:[50,100]}).toBe('idle');
   }finally{await this.controls.shield(false);await observer.dispose();}
  }
  const result=await readRanged(this.page);expect(result.enemies[index].hp,`${this.build} must defeat enemy ${index} with its physical projectiles or real elemental contacts`).toBeLessThanOrEqual(0);expect(result.campaign.deaths).toBe(0);
 }
}
