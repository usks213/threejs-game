import { describe,expect,it } from 'vitest';
import { activeDeckSlots,createMatch,createThreeOnThree,points,recordLaunchFaults,reorderThreeOnThree,scoreRound,scoreThreeOnThreeRound,validateThreeOnThreeParts } from '../../../src/beyblade/core/rules';
import type { BattleResult,Finish } from '../../../src/beyblade/core/types';
const finish=(kind:Finish,winner:0|1=0):BattleResult=>({finish:kind,winner,points:points[kind]});
const draw:BattleResult={finish:'draw',winner:null,points:0};
describe('Japanese 12th edition match rules',()=>{
  it.each([['spin',1],['over',2],['burst',2],['xtreme',3]] as const)('scores %s as %s', (kind,score)=>{
    const state=scoreRound(createMatch(),{...finish(kind),points:999});
    expect(state.scores).toEqual([score,0]);
  });
  it('first to at least four wins, including overshoot, and result is terminal',()=>{
    let state=scoreRound(createMatch(),finish('xtreme'));
    state=scoreRound(state,finish('over'));
    expect(state.winner).toBe(0);expect(state.scores).toEqual([5,0]);
    expect(scoreRound(state,finish('xtreme',1))).toBe(state);
    expect(scoreRound(scoreRound(createMatch(),finish('burst')),finish('burst')).winner).toBe(0);
  });
  it('draws award no points and retain same round',()=>{
    const state=scoreRound(createMatch(),draw);expect(state.round).toBe(1);expect(state.scores).toEqual([0,0]);
    expect(()=>scoreRound(state,{...draw,winner:0})).toThrow();
  });
  it('3on3 draws retain active slot and reorder follows three decisive rounds',()=>{
    let state=createThreeOnThree([[2,0,1],[1,2,0]]);
    state=scoreThreeOnThreeRound(state,draw);expect(activeDeckSlots(state)).toEqual([2,1]);
    state=scoreThreeOnThreeRound(state,finish('spin'));expect(activeDeckSlots(state)).toEqual([0,2]);
    state=scoreThreeOnThreeRound(state,finish('spin',1));expect(activeDeckSlots(state)).toEqual([1,0]);
    state=scoreThreeOnThreeRound(state,finish('spin'));expect(state.needsReorder).toBe(true);
    expect(()=>activeDeckSlots(state)).toThrow();expect(()=>scoreThreeOnThreeRound(state,draw)).toThrow();
    state=reorderThreeOnThree(state,[[1,2,0],[0,2,1]]);
    expect(state.cycle).toBe(2);expect(state.match.scores).toEqual([2,1]);expect(activeDeckSlots(state)).toEqual([1,0]);
  });
  it('rejects early reorder and invalid orders; ends before reorder if four points reached',()=>{
    expect(()=>reorderThreeOnThree(createThreeOnThree(),[[0,1,2],[0,1,2]])).toThrow();
    expect(()=>createThreeOnThree([[0,0,2],[0,1,2]])).toThrow();
    const state=scoreThreeOnThreeRound(scoreThreeOnThreeRound(createThreeOnThree(),finish('xtreme')),finish('spin'));
    expect(state.match.winner).toBe(0);expect(state.needsReorder).toBe(false);
  });
  it('requires canonical identities to reject color-variant duplicate parts',()=>{
    const deck=[[{category:'blade',canonicalId:'dransword'}],[{category:'blade',canonicalId:'DranSword'}],[{category:'blade',canonicalId:'hellscythe'}]];
    expect(validateThreeOnThreeParts(deck).valid).toBe(false);
  });
  it('allows ordinary repeated CX lockchips but not Valkyrie or Emperor',()=>{
    for(const chip of ['dran','ワルキューレ','valkyrie','emperor','エンペラー']){
      const deck=[0,1,2].map(i=>[{category:'main_blade',canonicalId:`blade${i}`},{category:'lock_chip',canonicalId:chip}]);
      expect(validateThreeOnThreeParts(deck).valid).toBe(chip==='dran');
    }
  });
  it('second shoot fault awards one point and relaunches without advancing round',()=>{
    const first=recordLaunchFaults(createMatch(),[0,0],[0]);expect(first.penaltyTo).toBe(null);expect(first.counts).toEqual([1,0]);
    const second=recordLaunchFaults(first.match,first.counts,[0]);expect(second.penaltyTo).toBe(1);expect(second.match.scores).toEqual([0,1]);expect(second.counts).toEqual([0,0]);expect(second.match.round).toBe(1);
  });
  it('simultaneous second faults retain one each and award no points',()=>{
    const result=recordLaunchFaults(createMatch(),[1,1],[0,1]);expect(result.counts).toEqual([1,1]);expect(result.match.scores).toEqual([0,0]);
  });
});
