import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {ContinuousCoopJourney} from '../../scripts/playthrough-coop';
import {validateSave} from '../../src/save/format';

it('continuously earns both tutorials, all seven trials and three beacons from a pristine two-player world across genuine save/restarts',()=>{
 const output=mkdtempSync(join(tmpdir(),'voxel-continuous-test-'));
 try{
  const journey=new ContinuousCoopJourney(output,undefined,true);
  expect(journey.sim.adventure.state.trialWorld!.completed).toEqual([]);
  expect(journey.sim.world.edits).toEqual([]);
  expect(journey.players.map(id=>journey.actor(id).adventure.state.inventory)).toEqual([
   {ragTunic:1,club:1,glider:1,berry:6},
   {ragTunic:1,club:1,glider:1,berry:6},
  ]);
  journey.tutorial();journey.surfaceTrials();journey.skyTrials();journey.depthTrials();
  expect([...journey.sim.adventure.state.trialWorld!.completed].sort()).toEqual([825001,825002,825003,825004,825005,825006,825007]);
  expect(journey.players.map(id=>journey.actor(id).adventure.state.progression!.tutorial)).toEqual([5,5]);
  expect(journey.players.every(id=>journey.actor(id).adventure.state.health>0)).toBe(true);
  for(const id of [810001,810002,810003])expect(journey.sim.adventure.state.resources.find(r=>r.id===id)!.ready).toBe(1e10);
  expect(journey.sim.world.edits).toHaveLength(2);
  expect(journey.trace.filter(e=>e.kind==='restart')).toHaveLength(3);
  const saved=validateSave(JSON.parse(readFileSync(join(output,'seven-trials-three-layers.save.json'),'utf8')));
  expect(saved.members).toHaveLength(2);
  expect(saved.adventure!.trialWorld!.completed).toHaveLength(7);
  // This deliberately does not claim regional wardens, final boss, browser,
  // real WebSocket or device-performance coverage.
  expect(saved.adventure!.siteWorld!.completed).toEqual([]);
  expect(saved.adventure!.defeated).not.toContain('stormcore');
 }finally{rmSync(output,{recursive:true,force:true});}
},240_000);
