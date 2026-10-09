import {it,expect} from 'vitest';
import {campCargoChoices} from '../../src/ui/camp-cargo';
import type {GearContainer} from '../../src/game/equipment/items';
const held:GearContainer={version:1,revision:1,lots:[{id:10,kind:'club',count:1,quality:3,durability:7}],activeByKind:{club:10}},stored:GearContainer={version:1,revision:1,lots:[{id:20,kind:'club',count:1,quality:1,durability:100}],activeByKind:{club:20}};
it('separates same-kind gear by lot identity and exposes directional counts for exact camp commands',()=>{const choices=campCargoChoices({club:1,wood:3,resin:0},held,{items:{club:1,wood:2},gearItems:stored});expect(choices.map(c=>c.value)).toEqual(['wood','gear-10','gear-20']);expect(choices.find(c=>c.value==='gear-10')).toMatchObject({held:1,stored:0});expect(choices.find(c=>c.value==='gear-20')).toMatchObject({held:0,stored:1});expect(choices[1].label).toContain('品質3');expect(choices[2].label).toContain('品質1');});
it('does not invent hidden storage metadata or offer nonexistent zero-count items',()=>{const choices=campCargoChoices({club:1,wood:0},held,undefined);expect(choices).toHaveLength(1);expect(choices[0].value).toBe('gear-10');expect(choices[0].stored).toBe(0);});
