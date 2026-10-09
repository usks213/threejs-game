import {describe,it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {VoxelField} from '../../src/prototype/core/voxel';
import {VoxelWater} from '../../src/prototype/core/water';
import {WatermillSystem,WATERMILL_ID,WATERMILL_POSITION,WATERMILL_ROTOR,validWatermillState,validWatermillSave} from '../../src/prototype/core/watermill';
const ctx={authority:'host' as const,alive:true,baseActive:true,position:{x:2.5,y:.25,z:-1.3},blockers:[]};
const materials=()=>({2:0,3:20,4:20,6:10,7:20,10:0});
function setup(){const s=new CoreSimulation(true,false,true);Object.assign(s.survival.inventory,materials());s.campaign.state.flameTier=1;s.player.position={...ctx.position};return s;}
describe('bounded waterwheel',()=>{
 it('builds only paid finite frame at clear fixed location',()=>{const s=setup(),m=s.watermill;const r=m.build(ctx);expect(r).toEqual({ok:true,message:expect.any(String)});expect(m.frameIntact()).toBe(true);expect(m.rotorReason()).toBe('');expect(s.survival.inventory[4]).toBe(12);expect(s.survival.inventory[3]).toBe(16);expect(s.survival.inventory[6]).toBe(8);expect(validWatermillSave(m.snapshot(),s.arena.field.exportState())).toBe(true);});
 it('only actual downward face transfers produce work; stop and resume preserve escrow',()=>{const s=setup(),m=s.watermill;expect(m.build(ctx).ok).toBe(true);expect(m.start(ctx).ok).toBe(true);const input=s.survival.inventory[7];for(let i=0;i<20;i++){s.water.step();m.step();}expect(m.state.job!.remaining).toBe(8);expect(m.flow).toBe(0);for(let i=0;i<22;i++){for(let z=20;z<26;z++)s.water.add(2,10,z,.8);s.water.step();m.step();}expect(m.state.job!.remaining).toBeLessThan(7);for(let i=0;i<30;i++){s.water.step();m.step();}const paused=m.state.job!.remaining,angle=m.state.angle;for(let i=0;i<20;i++){s.water.step();m.step();}expect(m.state.job!.remaining).toBe(paused);expect(m.state.angle).toBe(angle);expect(s.survival.inventory[7]).toBe(input);for(let i=0;i<1000;i++){for(let z=20;z<26;z++)s.water.add(2,10,z,.8);s.water.step();m.step();m.step();}expect(m.state.job!.remaining).toBe(0);const id=m.state.job!.id;expect(m.claim(id,ctx).ok).toBe(true);expect(m.claim(id,ctx).ok).toBe(false);expect(s.survival.inventory[10]).toBe(2);});
});

it('static full basin never powers; blocked intake and blocked rotor stop despite an open valve',()=>{
 const s=setup(),m=s.watermill;expect(m.build(ctx).ok).toBe(true);expect(m.start(ctx).ok).toBe(true);s.water.volume.fill(1);s.water.step();m.step();expect(m.state.job!.remaining).toBe(8);expect(m.flow).toBe(0);
 s.water.volume.fill(0);s.arena.field.box({x:4.2,y:.5,z:-2},{x:4.45,y:.75,z:-1.75},3,'test-obstruction');s.water.refreshSolids();for(let i=0;i<5;i++){s.water.add(2,10,24,.8);s.water.step();m.step();}expect(m.state.job!.remaining).toBe(8);expect(m.blockedReason).toContain('塞がれ');
 s.arena.field.removeObject('test-obstruction');s.water.refreshSolids();for(let i=0;i<3;i++){s.water.add(2,10,24,.8);s.water.step();m.step([WATERMILL_ROTOR]);}expect(m.state.job!.remaining).toBe(8);expect(m.blockedReason).toContain('人・動物');
});
it('failed build, escrow, repair and claim are atomic; damage never refunds or regenerates itself',()=>{
 const s=setup(),m=s.watermill,inventory=JSON.stringify(s.survival.inventory),field=JSON.stringify(s.arena.field.exportState());
 for(const c of [{...ctx,authority:'guest' as const},{...ctx,alive:false},{...ctx,baseActive:false},{...ctx,position:{x:0,y:.25,z:6}},{...ctx,blockers:[WATERMILL_POSITION]}])expect(m.build(c).ok).toBe(false);
 expect(JSON.stringify(s.survival.inventory)).toBe(inventory);expect(JSON.stringify(s.arena.field.exportState())).toBe(field);s.survival.inventory[6]=0;expect(m.build(ctx).ok).toBe(false);s.survival.inventory[6]=10;
 expect(m.build(ctx).ok).toBe(true);const built=JSON.stringify(s.survival.inventory);expect(m.build(ctx).ok).toBe(false);expect(m.build(ctx,true).ok).toBe(false);expect(JSON.stringify(s.survival.inventory)).toBe(built);expect(m.start(ctx).ok).toBe(true);const escrow=m.snapshot(),paid=JSON.stringify(s.survival.inventory);expect(m.start(ctx).ok).toBe(false);expect(m.claim(escrow.job!.id,ctx).ok).toBe(false);expect(JSON.stringify(s.survival.inventory)).toBe(paid);
 s.arena.field.removeObject(WATERMILL_ID);s.water.step();m.step();expect(m.blockedReason).toContain('破損');expect(m.state.job).toEqual(escrow.job);expect(s.survival.dismantle(WATERMILL_ID,ctx.position).ok).toBe(false);expect(JSON.stringify(s.survival.inventory)).toBe(paid);expect(m.build(ctx,true).ok).toBe(true);expect(m.state.job).toEqual(escrow.job);expect(m.frameIntact()).toBe(true);expect(s.survival.inventory[4]).toBe(JSON.parse(paid)[4]-4);
 const blocked=setup();blocked.arena.field.box({x:3.1,y:.3,z:-1.8},{x:3.9,y:1,z:-1},3,'protected:test');const before=JSON.stringify(blocked.arena.field.exportState());expect(blocked.watermill.build(ctx).ok).toBe(false);expect(JSON.stringify(blocked.arena.field.exportState())).toBe(before);
});
it('all volume including injected and solid-displaced water stays accounted; unrelated transfers are not power',()=>{
 const f=new VoxelField(),w=new VoxelWater(f),m=new WatermillSystem(f,w,materials());const initial=w.total();for(let i=0;i<40;i++){w.add(20,10,20,.8);w.step();expect(w.downwardTransfer(2,9,24)).toBe(0);}expect(w.total()).toBeCloseTo(initial+w.injected,5);
 f.box({x:4,y:-.5,z:-5},{x:4.5,y:.75,z:-4.5},3);w.refreshSolids();for(let i=0;i<5;i++)w.step();expect(w.total()).toBeCloseTo(initial+w.injected,5);expect(w.downwardTransfer(-1,9,24)).toBe(0);const before=w.volume.slice();m.step();expect(w.volume).toEqual(before);
});
it('schema rejects duplicate ownership, non-finite progress and unknown output; restore does not mutate failed state',()=>{
 const s=setup(),m=s.watermill;expect(m.build(ctx).ok).toBe(true);expect(m.start(ctx).ok).toBe(true);const before=m.snapshot();
 for(const bad of [{...before,built:false},{...before,nextJobId:1},{...before,angle:Infinity},{...before,job:{...before.job!,remaining:NaN}},{...before,job:{...before.job!,remaining:9}},{...before,job:{...before.job!,recipe:'gold'}},{...before,job:{...before.job!,output:20}},{...before,jobs:[before.job,before.job]}]){expect(validWatermillState(bad)).toBe(false);expect(m.restore(bad)).toBe(false);expect(m.snapshot()).toEqual(before);}
 const saved=s.arena.field.exportState();expect(validWatermillSave(undefined,saved)).toBe(false);saved.layers.find(l=>l.id===WATERMILL_ID)!.cells.push([0,0,0,-.5,4]);expect(validWatermillSave(before,saved)).toBe(false);
});
it('built frame collision is real SDF and mining it cannot mint salvage',()=>{
 const s=setup(),m=s.watermill;expect(m.build(ctx).ok).toBe(true);expect(s.arena.field.overlaps({x:3.5,y:.25,z:-1.4})).toBe(true);const hit=s.arena.field.ray({x:2.4,y:.7,z:-1.4},{x:1,y:0,z:0},2)!;expect(hit.cell.object).toBe(WATERMILL_ID);s.elements.damage(hit,1000,.4);expect(s.elements.drainDrops()).toEqual([]);expect(m.frameIntact()).toBe(false);s.water.step();m.step();expect(m.flow).toBe(0);
});
