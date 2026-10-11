import {expect,it} from 'vitest';
import {dungeonAttackObserved,type ExpectedAttack} from '../e2e/helpers/dungeon-attack-observed';
import type {Action} from '../../src/dungeon/types';
const expected:ExpectedAttack={stage:'followthrough-heavy-1',actorId:'p1',sequence:17,heavy:true,kind:'overhead',sampleStart:0,actionStart:0,tick:82,elapsed:4.1};
const command={sequence:17,action:{kind:'attack',heavy:true} as Action};
const sample={stage:expected.stage,tick:87,elapsed:4.35,lastAction:17,actor:{id:'p1',phase:'windup' as const,kind:'overhead' as const,status:'alive' as const}};
it('accepts the exact observed attack even when a delayed input ACK returns after idle',()=>{
 const history=[sample,{...sample,tick:114,elapsed:5.7,actor:{...sample.actor,phase:'recover' as const}},
  {...sample,tick:130,elapsed:6.5,actor:{...sample.actor,phase:'idle' as const}}];
 expect(dungeonAttackObserved(history,[command],expected)).toBe(true);
 for(const phase of ['windup','strike','recover'] as const)expect(dungeonAttackObserved([{...sample,actor:{...sample.actor,phase}}],[command],expected)).toBe(true);
});
it('rejects missing, duplicate, stale-sequence and wrong-type outgoing commands',()=>{
 for(const actions of [[],[command,command],[{...command,sequence:16}],[{...command,sequence:18}],
  [{sequence:17,action:{kind:'attack'} as Action}],[{sequence:17,action:{kind:'skill'} as Action}]])
  expect(dungeonAttackObserved([sample],actions,expected)).toBe(false);
 expect(dungeonAttackObserved([sample],[command],{...expected,actionStart:1})).toBe(false);
 expect(dungeonAttackObserved([sample],[{...command,sequence:3},command],{...expected,actionStart:1})).toBe(true);
});
it('rejects ACK-only idle, unrelated phases, stale samples, and wrong stage/actor/sequence/type',()=>{
 for(const patch of [{stage:'baseline-heavy-1'},{tick:81},{elapsed:4},{lastAction:16},{lastAction:18},
  {actor:{...sample.actor,id:'p2'}},{actor:{...sample.actor,phase:'idle' as const}},
  {actor:{...sample.actor,phase:'heal' as const}},{actor:{...sample.actor,kind:'slash' as const}},
  {actor:{...sample.actor,status:'dead' as const}}])expect(dungeonAttackObserved([{...sample,...patch}],[command],expected)).toBe(false);
 expect(dungeonAttackObserved([sample],[command],{...expected,sampleStart:1})).toBe(false);
});
it('checks light-attack type and permits a command transition in the same server tick',()=>{
 const light={...expected,heavy:false,kind:'return' as const};
 const sameTick={...sample,tick:expected.tick,elapsed:expected.elapsed,actor:{...sample.actor,kind:'return' as const}};
 expect(dungeonAttackObserved([sameTick],[{sequence:17,action:{kind:'attack'}}],light)).toBe(true);
 expect(dungeonAttackObserved([sameTick],[command],light)).toBe(false);
});
