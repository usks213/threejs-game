import {it,expect} from 'vitest';
import {createArena} from '../../src/prototype/core/world';
import {extendCampaignArena} from '../../src/prototype/core/campaign-world';
import {authorCampaignWorld} from '../../src/prototype/core/world-bootstrap';
it('real playable hub merges into the full campaign without a false terrain delta',async()=>{const arena=createArena();extendCampaignArena(arena,false);arena.field.captureBaseline('campaign-v2-hub');const packet=authorCampaignWorld();arena.field.dirty.clear();let yields=0;await arena.field.mergeAuthoredBaseline(packet.field,{budgetMs:3,yieldTask:async()=>{yields++;}});const state=arena.field.exportState();expect(state.baseline).toBe(packet.field.baseline);expect(state.base).toEqual([]);expect(state.removedBase).toEqual([]);expect(state.layers.every(l=>l.cells.length===0&&l.removed.length===0)).toBe(true);expect(yields).toBeGreaterThan(10);},30000);
