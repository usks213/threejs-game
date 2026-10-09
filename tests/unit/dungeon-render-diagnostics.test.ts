import {describe,expect,it} from 'vitest';
import {DungeonRenderDiagnostics} from '../../src/dungeon/render-diagnostics';

describe('bounded CPU submission diagnostics',()=>{
 it('records raw RAF gaps and successful/failed submission durations in fixed bins',()=>{
  const diagnostics=new DungeonRenderDiagnostics();
  for(const now of [0,10,40,90,190,440,940,1940,3040])diagnostics.raf(now);
  diagnostics.beginSubmission(3100);diagnostics.endSubmission(3120,true);
  diagnostics.beginSubmission(3200);diagnostics.endSubmission(3700,false);
  const snapshot=diagnostics.snapshot();
  expect(snapshot.raf.callbacks).toBe(9);expect(snapshot.raf.gaps).toMatchObject({count:8,totalMs:3040,maxMs:1100,lastMs:1100,bins:[1,1,1,1,1,1,1,1]});
  expect(snapshot.submission).toMatchObject({attempts:2,successes:1,failures:1,inFlight:false,lastEntryAtMs:3200,lastReturnAtMs:3700,lastSuccessfulReturnAtMs:3120});
  expect(snapshot.submission.durations).toMatchObject({count:2,totalMs:520,maxMs:500,lastMs:500,bins:[0,1,0,0,0,1,0,0]});
  expect(snapshot.meaning).toContain('not GPU completion or presentation');
 });
 it('returns independent snapshots without growing sample arrays',()=>{
  const diagnostics=new DungeonRenderDiagnostics();for(let i=0;i<10000;i++)diagnostics.raf(i*20);
  const first=diagnostics.snapshot();first.raf.gaps.bins.fill(999);first.timingBoundsMs[0]=33.4;
  const second=diagnostics.snapshot();expect(second.raf.gaps.bins).toHaveLength(8);expect(second.raf.gaps.bins[1]).toBe(9999);expect(second.timingBoundsMs[0]).toBe(16.7);
 });
 it('resets generation clocks and stops collecting after idempotent disposal',()=>{
  const diagnostics=new DungeonRenderDiagnostics();diagnostics.raf(1);diagnostics.beginSubmission(2);diagnostics.reset();
  expect(diagnostics.snapshot()).toMatchObject({generation:1,disposed:false,raf:{callbacks:0,lastAtMs:null},submission:{attempts:0,inFlight:false}});
  diagnostics.raf(1000);expect(diagnostics.snapshot().raf.gaps.count).toBe(0);
  diagnostics.dispose();const stopped=diagnostics.snapshot();diagnostics.dispose();diagnostics.raf(1020);diagnostics.beginSubmission(1021);diagnostics.endSubmission(1022,true);diagnostics.reset();
  expect(diagnostics.snapshot()).toEqual(stopped);expect(stopped.disposed).toBe(true);
 });
});
