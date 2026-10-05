import {describe,it,expect} from 'vitest';
import {captureCampaign,hydrateCampaign,defaultSettings} from '../../src/prototype/campaign-session';
import {NormalPlayer,playFirstChapter} from './helpers/normal-campaign-player';
describe('first chapter through ordinary production Core controls (not browser input evidence)',()=>{
 it('gathers, rescues, equips, traverses, fights, upgrades, reaches camp and hydrates without grants',()=>{
  const d=new NormalPlayer(),s=d.sim;playFirstChapter(d);
  const saved=captureCampaign(s,defaultSettings()),restored=hydrateCampaign(JSON.parse(JSON.stringify(saved)));expect(restored).not.toBeNull();expect(restored!.sim.campaign.snapshot()).toEqual(s.campaign.snapshot());expect(restored!.sim.survival.exportState()).toEqual(s.survival.exportState());expect(restored!.sim.weather).toEqual(s.weather);
 },60000);
});
