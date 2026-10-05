import { expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { TRIALS, GUIDES } from '../../src/content/adventure-trials';
import { validateSave } from '../../src/save/format';
import { foodStats } from '../../src/game/meadows/state';
import { skyContext } from '../../src/game/skybound/context';
const aim={x:0,y:0,z:1};
function settle(sim:GameSimulation,times=18){for(let i=0;i<times;i++){sim.tick++;sim.skybound.step(1/30,skyContext(sim));sim.adventure.trials.step();}}
function at(sim:GameSimulation,id:number){const n=sim.adventure.state.resources.find(n=>n.id===id)!;Object.assign(sim.player,{x:n.x,y:n.y,z:n.z,grounded:true,vy:0});return n;}
function openFlatTrial(id:number){const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.buildings=[];sim.adventure.state.resources=sim.adventure.state.resources.filter(n=>n.id<3000000);const n=at(sim,id);sim.world.density=p=>p.y-n.y;sim.adventure.action('trial-reset',String(id));return {sim,n,game:sim.adventure,parts:sim.skybound.state.parts.filter(p=>p.trial===id)};}
it('rejects button-only completion, creates bounded reusable loan fixtures and forbids free salvage rewards',()=>{
 const {sim,game,parts}=openFlatTrial(825001);expect(()=>game.action('trial','825001')).toThrow('質量');
 const block=parts.find(p=>p.kind==='block')!;sim.skybound.action('host','sky-grab',String(block.id),undefined,aim,skyContext(sim));const result=sim.skybound.action('host','sky-salvage',String(block.id),undefined,aim,skyContext(sim));expect(result.drops).toEqual([]);
 game.action('trial-reset','825001');expect(sim.skybound.state.parts.filter(p=>p.trial===825001)).toHaveLength(2);expect(sim.adventure.state.trialWorld!.epochs[825001]).toBe(2);
});
it('completes a real weight placement once, shares growth with late joins, and never reissues the material pool',()=>{
 const {sim,game,parts}=openFlatTrial(825001),base=parts.find(p=>p.anchored)!,block=parts.find(p=>p.kind==='block')!;
 sim.skybound.action('host','sky-grab',String(block.id),undefined,aim,skyContext(sim));sim.skybound.action('host','sky-move',String(block.id),{x:base.position.x,y:base.position.y+.625,z:base.position.z},aim,skyContext(sim));sim.skybound.action('host','sky-release',String(block.id),undefined,aim,skyContext(sim));
 settle(sim);expect(game.action('trial','825001').message).toContain('達成');const reward=()=>game.state.resources.filter(n=>n.drop&&n.kind==='stone').reduce((sum,n)=>sum+n.amount,0),count=reward();
 game.action('trial','825001');expect(reward()).toBe(count);expect(game.state.trialWorld!.completed).toEqual([825001]);expect(foodStats(game.state).health).toBe(27);expect(foodStats(game.state).stamina).toBe(53);
 const room=new SessionAuthority(validateSave(sim.save())),late=room.join('late');expect(foodStats(late.adventure.state).health).toBe(27);expect(late.adventure.state.inventory.stone??0).toBe(0);expect(room.sim.adventure.state.resources.filter(n=>n.drop&&n.kind==='stone').reduce((s,n)=>s+n.amount,0)).toBe(count);
});
it('requires powered connectivity and observed heating then wet extinguishing, not dialogue acceptance',()=>{
 const circuit=openFlatTrial(825004),battery=circuit.parts.find(p=>p.kind==='battery')!,lamp=circuit.parts.find(p=>p.kind==='lamp')!;
 expect(()=>circuit.game.action('trial','825004')).toThrow('接着');
 circuit.sim.skybound.action('host','sky-grab',String(lamp.id),undefined,aim,skyContext(circuit.sim));circuit.sim.skybound.action('host','sky-move',String(lamp.id),{x:battery.position.x+.625,y:battery.position.y,z:battery.position.z},aim,skyContext(circuit.sim));circuit.sim.skybound.action('host','sky-glue',`${lamp.id}:${battery.id}`,undefined,aim,skyContext(circuit.sim));circuit.sim.skybound.action('host','sky-release',String(lamp.id),undefined,aim,skyContext(circuit.sim));circuit.sim.skybound.action('host','sky-toggle',String(lamp.id),undefined,aim,skyContext(circuit.sim));circuit.sim.tick++;circuit.sim.skybound.step(1/30,skyContext(circuit.sim));expect(circuit.game.action('trial','825004').message).toContain('達成');
 const heat=openFlatTrial(825005),wood=heat.parts.find(p=>p.kind==='block')!;expect(()=>heat.game.action('trial','825005')).toThrow('加熱');
 heat.sim.skybound.affect(wood.id,'fire',6,skyContext(heat.sim));expect(()=>heat.game.action('trial','825005')).toThrow('消火');
 const context=skyContext(heat.sim);context.immersion=()=>.5;heat.sim.tick++;context.tick=heat.sim.tick;heat.sim.skybound.step(1/30,context);expect(heat.game.action('trial','825005').message).toContain('達成');
});
it('records genuine recall travel and confirmed ascent against the loaned ceiling',()=>{
 const recall=openFlatTrial(825006),stone=recall.parts.find(p=>p.kind==='block')!;
 for(let i=0;i<25;i++){recall.sim.tick++;recall.sim.skybound.step(1/30,skyContext(recall.sim));}
 expect(()=>recall.game.action('trial','825006')).toThrow('軌跡');recall.sim.skybound.action('host','sky-recall',String(stone.id),undefined,aim,skyContext(recall.sim));
 for(let i=0;i<25;i++){recall.sim.tick++;recall.sim.skybound.step(1/30,skyContext(recall.sim));}
 expect(stone.recalled).toBeGreaterThan(1);expect(recall.game.action('trial','825006').message).toContain('達成');
 const ascent=openFlatTrial(825007),base=ascent.parts.sort((a,b)=>a.position.y-b.position.y)[0];Object.assign(ascent.sim.player,{x:base.position.x,y:base.position.y+.125,z:base.position.z});
 expect(()=>ascent.game.action('trial','825007')).toThrow('天抜け');ascent.game.action('sky-ascend-preview');ascent.game.action('sky-ascend');expect(ascent.game.action('trial','825007').message).toContain('達成');
});
it('validates dialogue choices and distance, stores personal journal without completing physics or duplicating progression',()=>{
 const sim=new GameSimulation(),game=sim.adventure;at(sim,GUIDES[0].id);game.action('talk',String(GUIDES[0].id));expect(game.snapshot().dialogue!.choices.some(c=>c.id==='accept-825001')).toBe(true);
 game.action('dialogue','accept-825001');game.action('dialogue','accept-825001');expect(game.state.trialJournal).toEqual([825001]);expect(game.state.trialWorld!.completed).toEqual([]);
 expect(()=>game.action('dialogue','accept-999999')).toThrow('選択肢');sim.player.x+=100;expect(()=>game.action('dialogue','hint-825001')).toThrow('近づいて');game.action('dialogue','bye');expect(game.snapshot().dialogue).toBeUndefined();
 const restored=new GameSimulation(validateSave(sim.save()));expect(restored.adventure.state.trialJournal).toEqual([825001]);expect(restored.adventure.trials.dialogue).toBeUndefined();
});
it('keeps all seven resets within the 64-part budget and restores a platform over removed terrain',()=>{
 const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.resources=sim.adventure.state.resources.filter(n=>n.id<3000000);sim.adventure.state.buildings=[];
 for(const trial of TRIALS){const n=at(sim,trial.id);sim.world.density=p=>p.y-n.y;sim.adventure.action('trial-reset',String(trial.id));}
 expect(sim.skybound.state.parts.length).toBeLessThanOrEqual(16);
 const n=at(sim,825001);sim.world.density=()=>1;sim.adventure.action('trial-reset','825001');const base=sim.skybound.state.parts.find(p=>p.trial===825001&&p.anchored)!,y=base.position.y;
 sim.skybound.step(1/30,skyContext(sim));expect(base.position.y).toBe(y);expect(sim.adventure.state.trialWorld!.epochs[825001]).toBe(2);
 const legacy=new GameSimulation(undefined,3);expect(legacy.adventure.state.trialWorld).toBeUndefined();expect(foodStats(legacy.adventure.state)).toMatchObject({health:25,stamina:50});
});
it.each(TRIALS)('creates $name fixtures on the actual authored terrain',trial=>{
 const sim=new GameSimulation();at(sim,trial.id);expect(()=>sim.adventure.action('trial-reset',String(trial.id))).not.toThrow();expect(sim.skybound.state.parts.some(p=>p.trial===trial.id)).toBe(true);
});
it('checks real carrying distance and observed wind ascent instead of accepting a marker click',()=>{
 const carry=openFlatTrial(825002),base=carry.parts.find(p=>p.anchored)!,payload=carry.parts.find(p=>p.kind==='block')!;
 expect(()=>carry.game.action('trial','825002')).toThrow('2m');carry.sim.skybound.action('host','sky-grab',String(payload.id),undefined,aim,skyContext(carry.sim));
 carry.sim.skybound.action('host','sky-move',String(payload.id),{x:base.position.x,y:base.position.y+.625,z:base.position.z},aim,skyContext(carry.sim));carry.sim.skybound.action('host','sky-release',String(payload.id),undefined,aim,skyContext(carry.sim));settle(carry.sim);expect(carry.game.action('trial','825002').message).toContain('達成');
 const wind=openFlatTrial(825003);expect(()=>wind.game.action('trial','825003')).toThrow('上昇風');Object.assign(wind.sim.player,{x:10,y:25,z:-15,grounded:false,vy:0});wind.game.traversal.gliding=true;wind.game.trials.step();
 for(let i=0;i<30;i++){wind.game.traversal.beforeMove({x:0,z:0,jump:false},1/30);wind.sim.player.y+=wind.sim.player.vy/30;wind.game.trials.step();}
 expect(wind.game.state.trialWorld!.evidence).toContain(825003);at(wind.sim,825003);expect(wind.game.action('trial','825003').message).toContain('達成');
});
it('grants a shared completion and material reward once for two authority actors, and preserves custom parts during reset',()=>{
 const {sim,parts}=openFlatTrial(825001),base=parts.find(p=>p.anchored)!,block=parts.find(p=>p.kind==='block')!;
 sim.skybound.action('host','sky-grab',String(block.id),undefined,aim,skyContext(sim));sim.skybound.action('host','sky-move',String(block.id),{x:base.position.x,y:base.position.y+.625,z:base.position.z},aim,skyContext(sim));sim.skybound.action('host','sky-release',String(block.id),undefined,aim,skyContext(sim));
 settle(sim);const room=new SessionAuthority(sim.save()),a=room.join('a'),b=room.join('b');Object.assign(a.player,room.sim.player);Object.assign(b.player,room.sim.player);
 room.action('a',{type:'game-action',action:'trial',id:'825001',aim});room.action('b',{type:'game-action',action:'trial',id:'825001',aim});
 expect(room.sim.adventure.state.trialWorld!.completed).toEqual([825001]);expect(room.sim.adventure.state.resources.filter(n=>n.drop&&n.kind==='stone').reduce((s,n)=>s+n.amount,0)).toBe(3);expect(foodStats(a.adventure.state).health).toBe(27);expect(foodStats(b.adventure.state).health).toBe(27);
 const custom={id:999999,kind:'beam' as const,material:'wood' as const,mass:4,position:{x:50,y:30,z:50},velocity:{x:0,y:0,z:0},rotation:0,links:[],epoch:0};room.sim.skybound.state.parts.push(custom);room.sim.world.density=()=>1;room.sim.adventure.action('trial-reset','825001');expect(room.sim.skybound.state.parts).toContain(custom);expect(room.sim.adventure.state.trialWorld!.completed).toEqual([825001]);
});
it('ascends through the authored loan ceiling in the actual terrain without bypassing its exit check',()=>{
 const sim=new GameSimulation();at(sim,825007);sim.adventure.action('trial-reset','825007');const base=sim.skybound.state.parts.filter(p=>p.trial===825007).sort((a,b)=>a.position.y-b.position.y)[0];Object.assign(sim.player,{x:base.position.x,y:base.position.y+.125,z:base.position.z,grounded:true});
 sim.adventure.action('sky-ascend-preview');const exit=sim.adventure.snapshot().skybound!.ascendPreview!.exit;sim.adventure.action('sky-ascend');expect(sim.player.y).toBeCloseTo(exit.y);expect(sim.adventure.action('trial','825007').message).toContain('達成');
});
it('does not count held weights, latches stable placement, and clears only unclaimed proof on reset',()=>{
 const {sim,game,parts}=openFlatTrial(825001),base=parts.find(p=>p.anchored)!,block=parts.find(p=>p.kind==='block')!;
 sim.skybound.action('host','sky-grab',String(block.id),undefined,aim,skyContext(sim));sim.skybound.action('host','sky-move',String(block.id),{x:base.position.x,y:base.position.y+.625,z:base.position.z},aim,skyContext(sim));settle(sim,20);
 expect(game.state.trialWorld!.evidence).not.toContain(825001);expect(()=>game.action('trial','825001')).toThrow('質量');
 sim.skybound.action('host','sky-release',String(block.id),undefined,aim,skyContext(sim));settle(sim,10);expect(()=>game.action('trial','825001')).toThrow('0.5秒');settle(sim,10);expect(game.state.trialWorld!.evidence).toContain(825001);
 game.action('trial-reset','825001');expect(game.state.trialWorld!.evidence).not.toContain(825001);expect(()=>game.action('trial','825001')).toThrow('質量');
});
it('latches recall completion before the stone falls again and survives save/reload before reporting',()=>{
 const {sim,game,parts}=openFlatTrial(825006),stone=parts.find(p=>p.kind==='block')!;settle(sim,25);sim.skybound.action('host','sky-recall',String(stone.id),undefined,aim,skyContext(sim));settle(sim,25);
 expect(game.state.trialWorld!.evidence).toContain(825006);settle(sim,60);expect(stone.position.y).toBeLessThan(game.state.resources.find(n=>n.id===825006)!.y+3);
 const restored=new GameSimulation(validateSave(sim.save()));at(restored,825006);expect(restored.adventure.action('trial','825006').message).toContain('達成');
});
it('retains a proven powered circuit and heated/cooled wood after their temporary conditions end',()=>{
 const circuit=openFlatTrial(825004),battery=circuit.parts.find(p=>p.kind==='battery')!,lamp=circuit.parts.find(p=>p.kind==='lamp')!;
 circuit.sim.skybound.action('host','sky-grab',String(lamp.id),undefined,aim,skyContext(circuit.sim));circuit.sim.skybound.action('host','sky-move',String(lamp.id),{x:battery.position.x+.625,y:battery.position.y,z:battery.position.z},aim,skyContext(circuit.sim));circuit.sim.skybound.action('host','sky-glue',`${lamp.id}:${battery.id}`,undefined,aim,skyContext(circuit.sim));circuit.sim.skybound.action('host','sky-release',String(lamp.id),undefined,aim,skyContext(circuit.sim));circuit.sim.skybound.action('host','sky-toggle',String(lamp.id),undefined,aim,skyContext(circuit.sim));settle(circuit.sim,1);
 expect(circuit.game.state.trialWorld!.evidence).toContain(825004);battery.energy=0;settle(circuit.sim,1);expect(circuit.sim.skybound.isPowered(lamp.id)).toBe(false);expect(circuit.game.action('trial','825004').message).toContain('達成');
 const heat=openFlatTrial(825005),wood=heat.parts.find(p=>p.kind==='block')!;heat.sim.skybound.affect(wood.id,'fire',6,skyContext(heat.sim));const wet=skyContext(heat.sim);wet.immersion=()=>.5;heat.sim.tick++;wet.tick=heat.sim.tick;heat.sim.skybound.step(1/30,wet);heat.game.trials.step();expect(heat.game.state.trialWorld!.evidence).toContain(825005);
 wood.wet=0;heat.sim.tick++;heat.game.trials.step();expect(heat.game.action('trial','825005').message).toContain('達成');
});
