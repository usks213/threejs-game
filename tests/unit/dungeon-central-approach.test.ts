import {expect, it} from 'vitest';
import {DungeonSimulation} from '../../src/dungeon/simulation';
import {blocked, distance} from '../../src/dungeon/world';
import {movementAxes} from '../../src/dungeon/input';
import {CENTRAL_APPROACH,centralRecoveryPoints,centralRecoveryKeys,centralGuardsSplit} from '../e2e/helpers/dungeon-central-approach';

function staged() {
  const sim = new DungeonSimulation();
  const players = ['a', 'b'].map(key => sim.join(key.repeat(64), key)!);
  for (const player of players) {
    sim.command(player.actor.id, 1, {kind: 'class', classId: 'keeper'});
    sim.command(player.actor.id, 2, {kind: 'ready'});
  }
  sim.command(players[0].actor.id, 3, {kind: 'start'});
  players.forEach((player, i) => {
    player.actor.position = {...CENTRAL_APPROACH[i].point, y: 0};
    const guard=sim.state.enemies.find(enemy=>enemy.id===CENTRAL_APPROACH[i].enemy)!;
    player.actor.yaw=Math.atan2(-(guard.position.x-player.actor.position.x),-(guard.position.z-player.actor.position.z));
  });
  // Isolate the central targeting rule; the browser separately requires all
  // four original enemies and both outer encounters through ordinary input.
  sim.state.enemies.filter(enemy => ['e2', 'e3'].includes(enemy.id)).forEach(enemy => {enemy.status = 'dead'; enemy.hp = 0;});
  return {sim, players};
}
it('keeps both actual door controls reachable and guard assignments distinct despite settling error', () => {
  const {sim, players} = staged();
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
    [a, b].forEach((angle, index) => {
      const point = CENTRAL_APPROACH[index].point;
      players[index].actor.position = {x: point.x + .24 * Math.cos(angle * Math.PI / 8), y: 0, z: point.z + .24 * Math.sin(angle * Math.PI / 8)};
    });
    CENTRAL_APPROACH.forEach((approach, index) => {
      const actor = players[index].actor, guard = sim.state.enemies.find(enemy => enemy.id === approach.enemy)!;
      const door = sim.state.doors.find(door => door.id === approach.door)!;
      expect(blocked(actor.position, sim.state.seed, sim.state.doors)).toBe(false);
      expect(distance(actor.position, door.position)).toBeLessThan(2.2);
      expect(distance(players[1 - index].actor.position, guard.position) - distance(actor.position, guard.position)).toBeGreaterThan(.35);
    });
  }
});

it.each([0,1])('keeps delayed-door recovery alive and split under settling and held-input error, first=%i',first=>{
  for(const pollTicks of [1,4,8])for(const a of [0,4,8,12])for(const b of [0,4,8,12]){
    const {sim,players}=staged(),ids=players.map(player=>player.actor.id);
    [a,b].forEach((angle,index)=>{
      const actor=players[index].actor,point=CENTRAL_APPROACH[index].point;
      actor.position={x:point.x+.24*Math.cos(angle*Math.PI/8),y:0,z:point.z+.24*Math.sin(angle*Math.PI/8)};
      const guard=sim.state.enemies.find(enemy=>enemy.id===CENTRAL_APPROACH[index].enemy)!;
      actor.yaw=Math.atan2(-(guard.position.x-actor.position.x),-(guard.position.z-actor.position.z))+(index===0?.12:-.12);
    });
    expect(sim.command(ids[first],4,{kind:'interact',target:CENTRAL_APPROACH[first].door})).toBe('扉を開きました');
    for(let tick=0;tick<20;tick++)sim.step();
    expect(sim.command(ids[1-first],4,{kind:'interact',target:CENTRAL_APPROACH[1-first].door})).toBe('扉を開きました');
    const plan=centralRecoveryPoints(sim.snapshot(ids[0]));
    let elapsed=0;
    while(elapsed<160&&!centralGuardsSplit(sim.snapshot(ids[0]),ids)){
      const held=players.map((player,index)=>movementAxes(new Set(centralRecoveryKeys(player.actor,plan[index]))));
      // The normal input pump renews held keys even between browser observations.
      for(let tick=0;tick<pollTicks;tick++,elapsed++){
        players.forEach((player,index)=>sim.input(player.actor.id,player.actor.seq+1,{...player.actor.input,...held[index],yaw:player.actor.yaw}));
        sim.step();
        players.forEach(player=>{
          expect(blocked(player.actor.position,sim.state.seed,sim.state.doors)).toBe(false);
          expect(player.actor.hp,JSON.stringify({first,pollTicks,a,b,elapsed})).toBe(110);
        });
      }
    }
    expect(centralGuardsSplit(sim.snapshot(ids[0]),ids),JSON.stringify({first,pollTicks,a,b,elapsed})).toBe(true);
    expect(sim.state.enemies.filter(enemy=>enemy.status==='alive').every(enemy=>enemy.hp===70)).toBe(true);
  }
});
it.each([0, 1])('recovers split targeting through ordinary movement when door %i opens a second earlier', first => {
  const {sim, players} = staged();
  const open = (index: number) => sim.command(players[index].actor.id, 4, {kind: 'interact', target: CENTRAL_APPROACH[index].door});
  expect(open(first)).toBe('扉を開きました');
  for (let tick = 0; tick < 20; tick++) sim.step();
  const assigned = sim.state.enemies.find(enemy => enemy.id === CENTRAL_APPROACH[first].enemy)!;
  const waiting = sim.state.enemies.find(enemy => enemy.id === CENTRAL_APPROACH[1 - first].enemy)!;
  expect(Math.sign(assigned.position.z)).toBe(first === 0 ? 1 : -1);
  // With only one doorway open, both guards must pursue the visible explorer.
  expect(Math.sign(waiting.position.z)).toBe(first === 0 ? 1 : -1);
  expect(open(1 - first)).toBe('扉を開きました');
  const ids=players.map(player=>player.actor.id),plan=centralRecoveryPoints(sim.snapshot(ids[0]));
  expect(centralGuardsSplit(sim.snapshot(ids[0]),ids)).toBe(false);
  for(let tick=0;tick<160&&!centralGuardsSplit(sim.snapshot(ids[0]),ids);tick++){
    players.forEach((player,index)=>{
      const actor=player.actor,keys=centralRecoveryKeys(actor,plan[index]);
      sim.input(actor.id,actor.seq+1,{...actor.input,...movementAxes(new Set(keys)),yaw:actor.yaw});
    });
    const before=players.map(player=>({...player.actor.position}));sim.step();
    players.forEach((player,index)=>{
      expect(distance(player.actor.position,before[index])).toBeLessThanOrEqual(.150001);
      expect(blocked(player.actor.position,sim.state.seed,sim.state.doors)).toBe(false);
      expect(player.actor.hp,JSON.stringify({tick,plan,actors:players.map(p=>({position:p.actor.position,hp:p.actor.hp})),enemies:sim.state.enemies.filter(e=>e.status==='alive').map(e=>({id:e.id,position:e.position,phase:e.phase}))})).toBe(110);
    });
  }
  expect(centralGuardsSplit(sim.snapshot(ids[0]),ids)).toBe(true);
  const before=sim.state.enemies.filter(enemy=>enemy.status==='alive').map(enemy=>({...enemy.position}));
  players.forEach(player=>sim.input(player.actor.id,player.actor.seq+1,{...player.actor.input,x:0,z:0}));
  for(let tick=0;tick<12;tick++)sim.step();
  expect(sim.state.enemies.find(enemy=>enemy.id==='e0')!.position.z).toBeGreaterThan(before[0].z);
  expect(sim.state.enemies.find(enemy=>enemy.id==='e1')!.position.z).toBeLessThan(before[1].z);
  expect(centralGuardsSplit(sim.snapshot(ids[0]),ids)).toBe(true);
  expect(sim.state.enemies.filter(enemy=>enemy.status==='alive').every(enemy=>enemy.hp===70)).toBe(true);
  expect(players.every(player => player.actor.hp === 110)).toBe(true);
});
