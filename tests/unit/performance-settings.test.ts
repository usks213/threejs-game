import {beforeAll,it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,defaultSettings,isCampaignSave,type CampaignSave} from '../../src/prototype/campaign-session';
let source:CampaignSave;
beforeAll(()=>{source=captureCampaign(new CoreSimulation(true),defaultSettings());},20000);
it('keeps balanced as default and accepts old balanced/high saves plus the production performance preset',()=>{expect(defaultSettings().graphics).toBe('balanced');for(const graphics of ['balanced','high','performance'] as const)expect(isCampaignSave({...source,settings:{...source.settings,graphics}})).toBe(true);expect(isCampaignSave({...source,settings:{...source.settings,graphics:'fake-fast'}})).toBe(false);});
