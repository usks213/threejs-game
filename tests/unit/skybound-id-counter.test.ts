import {expect,it} from 'vitest';
import {SkyboundPowers} from '../../src/game/skybound/powers';
import {validateSkybound} from '../../src/game/skybound/validation';
import {WORLD} from '../../src/world/types';
import type {SkyContext} from '../../src/game/skybound/types';
const aim={x:1,y:0,z:0};
const context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:1,z:0},inventory:{wood:50},actors:[],solid:()=>false};
it('never reuses the highest removed part identity after save and restart',()=>{
 const powers=new SkyboundPowers();powers.action('host','sky-part','block:wood',{x:2,y:2,z:0},aim,context);const old=powers.state.parts[0].id;powers.action('host','sky-grab',String(old),undefined,aim,context);powers.action('host','sky-salvage',String(old),undefined,aim,context);expect(powers.state.parts).toHaveLength(0);const saved=powers.save();expect(saved.nextId).toBeGreaterThan(old);const restored=new SkyboundPowers(saved);restored.action('host','sky-part','block:wood',{x:2,y:2,z:0},aim,context);expect(restored.state.parts[0].id).toBeGreaterThan(old);expect(()=>restored.action('host','sky-grab',String(old),undefined,aim,context)).toThrow('見つかりません');
});
it('migrates missing counters and rejects stale or unsafe counters before accepting saves',()=>{
 const powers=new SkyboundPowers();powers.action('host','sky-part','block:wood',{x:2,y:2,z:0},aim,context);const save=powers.save();delete save.nextId;expect(validateSkybound(save).nextId).toBe(2);expect(()=>validateSkybound({...save,nextId:1})).toThrow('カウンター');expect(()=>validateSkybound({...save,nextId:NaN})).toThrow('カウンター');const full=new SkyboundPowers({...save,nextId:Number.MAX_SAFE_INTEGER});expect(()=>full.action('host','sky-part','block:wood',{x:4,y:2,z:0},aim,context)).toThrow('上限');expect(full.state.parts).toHaveLength(1);
});
