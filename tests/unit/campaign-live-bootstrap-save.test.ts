import {it,expect} from 'vitest';
import {CoreSimulation,type Controls} from '../../src/prototype/core/simulation';
import {bootstrapCampaignWorld,authorCampaignWorld,type AuthoredWorldPacket} from '../../src/prototype/core/world-bootstrap';
import {captureCampaign,restoreCampaignInto,defaultSettings,isCampaignSave,getCampaignRestoreFailure} from '../../src/prototype/campaign-session';
const idle:Controls={x:0,z:0,sprint:false,block:false,water:false};
const worker=(packet:AuthoredWorldPacket)=>{const mock={onmessage:null as ((event:MessageEvent)=>void)|null,onerror:null,onmessageerror:null,terminate(){},postMessage(){queueMicrotask(()=>this.onmessage?.({data:packet} as MessageEvent));}};return mock as unknown as Worker;};
it('saves live hub play during bootstrap and resumes after a second bootstrap',async()=>{
 const packet=authorCampaignWorld(),first=new CoreSimulation(true,true);for(let i=0;i<60;i++)first.tick(1/60,idle);let liveMergeTicks=0;
 await bootstrapCampaignWorld(first.arena,{workerFactory:()=>worker(packet),budgetMs:1,yieldTask:async()=>{if(liveMergeTicks<30){first.tick(1/60,idle);liveMergeTicks++;}}});first.worldReady=true;first.protectQuestObjects();first.water.refreshSolids();
 expect(liveMergeTicks).toBeGreaterThan(0);expect(first.seconds).toBeGreaterThan(1);const saved=captureCampaign(first,defaultSettings());expect(isCampaignSave(saved)).toBe(true);
 const second=new CoreSimulation(true,true);await bootstrapCampaignWorld(second.arena,{workerFactory:()=>worker(packet),yieldTask:async()=>{}});second.worldReady=true;second.protectQuestObjects();second.water.refreshSolids();
 expect(restoreCampaignInto(second,JSON.parse(JSON.stringify(saved))),getCampaignRestoreFailure(second)??'valid played checkpoint').not.toBeNull();expect(getCampaignRestoreFailure(second)).toBeNull();expect(second.seconds).toBe(first.seconds);expect(second.player.hp).toBe(first.player.hp);expect(second.player.position).toEqual(first.player.position);expect(second.campaign.snapshot()).toEqual(first.campaign.snapshot());expect(second.survival.exportState()).toEqual(first.survival.exportState());expect(second.elements.exportState()).toEqual(first.elements.exportState());expect(second.arena.field.exportState()).toEqual(first.arena.field.exportState());
},30000);
