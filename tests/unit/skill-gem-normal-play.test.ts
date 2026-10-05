import {it,expect} from 'vitest';
import {NormalPlayer,playFirstChapter} from './helpers/normal-campaign-player';
import {captureCampaign,restoreCampaignInto,defaultSettings} from '../../src/prototype/campaign-session';
import {skillPointsSpent} from '../../src/prototype/core/skills';

it('earns points and all gem inputs by normal play, buys ranks and forge tiers, then saves without losing any payment',()=>{
 const driver=new NormalPlayer(),sim=driver.sim,c=sim.campaign;playFirstChapter(driver,{reserveRidgeMedicine:true,reserveGemMaterials:true});
 expect(c.state.level).toBeGreaterThanOrEqual(4);const earned=c.state.skillPoints;expect(earned).toBe(c.state.level-1);
 for(const id of ['vigor:1','endurance:1','attunement:1','vigor:2'])driver.menu('learn',id);
 expect(c.state.skillPoints+skillPointsSpent(c.state)).toBe(earned);expect(c.maxHp).toBeGreaterThanOrEqual(140);
 driver.menu('travel','hearth');const stone=sim.survival.inventory[3],metal=sim.survival.inventory[6];expect(stone).toBeGreaterThanOrEqual(19);expect(metal).toBeGreaterThanOrEqual(13);
 for(const id of ['ember-gem','ember-gem-2','ember-gem-3'])driver.menu('craft',id);
 expect(sim.survival.inventory[3]).toBe(stone-19);expect(sim.survival.inventory[6]).toBe(metal-13);expect(c.state.items['ember-gem']).toBe(0);expect(c.state.items['ember-gem-2']).toBe(0);expect(c.state.items['ember-gem-3']).toBe(1);
 driver.menu('gear','socket:iron-blade:ember-gem-3');expect(c.state.items['ember-gem-3']).toBe(0);expect(c.gearInfo('iron-blade').socket).toBe('ember-gem-3');driver.menu('gear','reset-skills');expect(c.state.skillPoints).toBe(earned);
 const saved=captureCampaign(sim,defaultSettings());expect(restoreCampaignInto(sim,saved)).not.toBeNull();expect(c.snapshot()).toEqual(saved.campaign);expect(sim.survival.inventory[3]).toBe(stone-19);expect(sim.survival.inventory[6]).toBe(metal-13);
},150000);
