import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {executeGameCommand} from '../../src/prototype/campaign-commands';
import {captureCampaign,restoreCampaignInto,defaultSettings} from '../../src/prototype/campaign-session';
import {freshWatermillState,WATERMILL_ID} from '../../src/prototype/core/watermill';

it('optional legacy state loads cleanly; corrupted snapshot is rejected before changing any ledger',()=>{
 const s=new CoreSimulation(true,false,true),legacy=captureCampaign(s,defaultSettings());delete legacy.watermill;expect(restoreCampaignInto(s,legacy)).not.toBeNull();expect(s.watermill.snapshot()).toEqual(freshWatermillState());
 Object.assign(s.survival.inventory,{4:20,3:20,6:20,7:20});s.campaign.state.flameTier=1;s.player.position={x:2.5,y:.25,z:-1.3};expect(executeGameCommand(s,{type:'homestead',id:'watermill-build'}).ok).toBe(true);expect(executeGameCommand(s,{type:'homestead',id:'watermill-start'}).ok).toBe(true);const save=captureCampaign(s,defaultSettings()),before=JSON.stringify(save);
 const corrupt=structuredClone(save);corrupt.watermill!.job!.remaining=-1;corrupt.survival.inventory[10]=999;expect(restoreCampaignInto(s,corrupt)).toBeNull();expect(JSON.stringify(captureCampaign(s,defaultSettings()))).toBe(before);
 const corruptGeometry=structuredClone(save);corruptGeometry.field.layers.find(l=>l.id===WATERMILL_ID)!.cells.push([200,3,200,-.2,4]);expect(restoreCampaignInto(s,corruptGeometry)).toBeNull();expect(JSON.stringify(captureCampaign(s,defaultSettings()))).toBe(before);
 expect(restoreCampaignInto(s,save)).not.toBeNull();expect(s.watermill.snapshot()).toEqual(save.watermill);expect(s.watermill.flow).toBe(0);expect(s.survival.inventory[7]).toBe(14);
 s.arena.field.removeObject(WATERMILL_ID);const broken=captureCampaign(s,defaultSettings());expect(restoreCampaignInto(s,broken)).not.toBeNull();expect(s.watermill.frameIntact()).toBe(false);expect(s.watermill.state.job).toEqual(save.watermill!.job);
});
it('guest menu requests cannot create, repair, start or claim, even with build permission and reconnect',()=>{
 const s=new CoreSimulation(true,false,true);Object.assign(s.survival.inventory,{4:20,3:20,6:20,7:20});s.campaign.state.flameTier=1;s.player.position={x:2.5,y:.25,z:-1.3};expect(executeGameCommand(s,{type:'homestead',id:'watermill-build'}).ok).toBe(true);expect(executeGameCommand(s,{type:'homestead',id:'watermill-start'}).ok).toBe(true);s.enableCompanion({x:2.1,y:.25,z:-1.3});s.companionCanEdit=true;const before=s.watermill.snapshot(),inventory={...s.survival.inventory};
 for(const id of ['watermill-build','watermill-repair','watermill-start','watermill-claim:1'])expect(s.withCompanion(()=>executeGameCommand(s,{type:'homestead',id}))!.ok).toBe(false);
 s.setCompanionConnected(false);s.setCompanionConnected(true);expect(s.watermill.snapshot()).toEqual(before);expect(s.survival.inventory).toEqual(inventory);
});
