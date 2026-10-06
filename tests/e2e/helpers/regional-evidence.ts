import {expect,type Page,type TestInfo} from '@playwright/test';
import type {CampaignState} from '../../../src/prototype/core/campaign';
import type {regionalInputObservation} from '../../../src/prototype/regional-input-observation';
import {readRanged,type RangedProbe} from './ranged-campaign-controls';

export type RegionalProbe=RangedProbe&{campaign:CampaignState;oxygen:number;cold:number;weather:unknown;worldRevision:number};
export const readRegional=(page:Page)=>readRanged(page) as Promise<RegionalProbe>;
export const readRegionalMotion=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__regionalInputProbe') as ReturnType<typeof regionalInputObservation>);

/** Detached evidence only. A rAF sample measures observed cadence, not a claim
 * about hardware or full-route performance; a bounded wall timer records stalls. */
export async function regionalEvidence(page:Page,testInfo:TestInfo,name:string,performanceSample=false,captureScreen=true){
 const before=await readRegional(page);expect(before.hp).toBeGreaterThan(0);expect(before.campaign.deaths).toBe(0);
 await expect(page.locator('#game')).toHaveAttribute('data-running','true');await expect(page.locator('#error')).toBeHidden();
 expect(before.settings.graphics).toBe('performance');expect(page.viewportSize()).toEqual(testInfo.project.use.isMobile?{width:844,height:390}:{width:960,height:540});
 if(captureScreen){const path=testInfo.outputPath(`${name}.png`);await page.screenshot({path});await testInfo.attach(`${name}-screen`,{path,contentType:'image/png'});}
 let sample:unknown=null;
 if(performanceSample){
  // Authored safe checkpoints only: never spend a frame sample exposed to a boss.
  expect(before.enemies.every(e=>e.hp<=0||Math.hypot(e.position.x-before.position.x,e.position.z-before.position.z)>8),name+' must be away from surviving threats').toBe(true);
  sample=await page.evaluate(()=>new Promise(resolve=>{
   const gaps:number[]=[],started=performance.now();let last=started,frame=0,done=false;
   const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frame);clearTimeout(timer);const sorted=[...gaps].sort((a,b)=>a-b),elapsed=performance.now()-started;resolve({requestedFrames:120,observedFrames:gaps.length,wallMilliseconds:elapsed,completed:gaps.length===120,framesPerSecond:gaps.length*1000/Math.max(1,elapsed),medianFrameMs:sorted.length?sorted[Math.floor((sorted.length-1)*.5)]:null,p95FrameMs:sorted.length?sorted[Math.floor((sorted.length-1)*.95)]:null,maxFrameMs:sorted.at(-1)??null,visibility:document.visibilityState,focused:document.hasFocus()});};
   const timer=setTimeout(finish,15000);const tick=(now:number)=>{gaps.push(now-last);last=now;if(gaps.length===120)finish();else frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  }));
 }
 const after=await readRegional(page);expect(after.hp).toBeGreaterThan(0);expect(after.campaign.deaths).toBe(0);
 const environment=await page.evaluate(()=>({userAgent:navigator.userAgent,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,visibility:document.visibilityState,focused:document.hasFocus()}));
 await testInfo.attach(`${name}-evidence`,{body:JSON.stringify({checkpoint:name,project:testInfo.project.name,inputMode:testInfo.project.use.isMobile?'Android Chromium touch emulation; not a physical device':'Desktop production keyboard',browserVersion:page.context().browser()?.version(),quality:'performance',renderer:'Chromium SwiftShader from playwright.config.ts; hardware performance not claimed',environment,performanceSample:sample,gameSecondsBefore:before.seconds,gameSecondsAfter:after.seconds,position:after.position,hp:after.hp,stamina:after.stamina,oxygen:after.oxygen,cold:after.cold,mana:after.combat.mana,inventory:after.inventory,campaign:after.campaign,weather:after.weather,stats:after.stats,enemies:after.enemies},null,2),contentType:'application/json'});
}
