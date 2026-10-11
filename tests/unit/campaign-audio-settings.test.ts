import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,restoreCampaignInto,defaultSettings,isCampaignSave} from '../../src/prototype/campaign-session';
import {DEFAULT_AUDIO_MIX} from '../../src/prototype/audio';
it('round-trips independent audio sliders and supplies defaults to older checkpoints',()=>{
 const sim=new CoreSimulation(true,false,true),settings=defaultSettings();settings.audioMix={music:0,effects:.8,ambience:.25};const save=captureCampaign(sim,settings);expect(isCampaignSave(save)).toBe(true);expect(restoreCampaignInto(sim,save)!.settings.audioMix).toEqual(settings.audioMix);
 delete save.settings.audioMix;expect(restoreCampaignInto(sim,save)!.settings.audioMix).toEqual(DEFAULT_AUDIO_MIX);
 save.settings.audioMix={music:NaN,effects:1,ambience:.5};expect(isCampaignSave(save)).toBe(false);expect(restoreCampaignInto(sim,save)).toBeNull();
});
