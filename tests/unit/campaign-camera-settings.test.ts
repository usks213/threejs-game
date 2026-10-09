import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,restoreCampaignInto,defaultSettings,isCampaignSave} from '../../src/prototype/campaign-session';
it('persists an optional third-person view without changing actor aim and supplies old-save defaults',()=>{
 const sim=new CoreSimulation(true,false,true),settings=defaultSettings();sim.look(.25,-.1);const aim={yaw:sim.player.yaw,pitch:sim.player.pitch};
 settings.cameraMode='third';settings.cameraDistance=2.4;const save=captureCampaign(sim,settings);expect(isCampaignSave(save)).toBe(true);
 const restored=restoreCampaignInto(sim,save)!;expect(restored.settings.cameraMode).toBe('third');expect(restored.settings.cameraDistance).toBe(2.4);expect({yaw:sim.player.yaw,pitch:sim.player.pitch}).toEqual(aim);
 delete save.settings.cameraMode;delete save.settings.cameraDistance;const legacy=restoreCampaignInto(sim,save)!;expect(legacy.settings.cameraMode).toBe('first');expect(legacy.settings.cameraDistance).toBe(3);
 for(const value of [NaN,Infinity,0,4.01]){save.settings.cameraDistance=value;expect(isCampaignSave(save)).toBe(false);}save.settings.cameraDistance=3;Reflect.set(save.settings,'cameraMode','orbit');expect(isCampaignSave(save)).toBe(false);
});
