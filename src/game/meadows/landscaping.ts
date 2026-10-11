import type { Adventure } from '../adventure';
import { MAX_EDITS, insideBounds, type Vec3 } from '../../world/types';
/** Flat capped CSG brushes retain tunnels and other existing voxel edits outside this footprint. */
export function landscape(game:Adventure,mode:string,target:Vec3):{dirty:string[];message:string}{
 const sim=game.sim,s=game.state,p=sim.player;
 if(!['level','path','raise'].includes(mode))throw new Error('鍬の用途を選んでください');
 if(!s.inventory.hoe||s.meadows?.durability.hoe===0)throw new Error('使える鍬が必要です');
 if(!insideBounds(target,sim.world.bounds,5)||Math.hypot(target.x-p.x,target.y-p.y,target.z-p.z)>7)throw new Error('近くの地面へ照準を向けてください');
 if(s.stamina<5)throw new Error('スタミナが足りません');
 if(sim.world.edits.length>MAX_EDITS-2)throw new Error('地形の保存上限に達しました');
 if(mode==='raise'&&(s.inventory.stone??0)<2)throw new Error('盛土には石が2個必要です');
 const ground=sim.groundAt(target.x,target.z),height=mode==='raise'?ground+.5:mode==='path'?ground:Math.max(ground-.75,Math.min(ground+.75,p.y)),radius=1.5,dirty=new Set<string>();
 game.gear.prepareUse('hoe');
 if(mode==='raise')s.inventory.stone-=2;s.stamina-=5;s.equipment='hoe';game.meadowRules.wear('hoe');
 for(const kind of ['add','dig'] as const){const position={x:target.x,y:height+(kind==='add'?-radius:radius),z:target.z};for(const id of sim.world.apply({id:sim.world.edits.length+1,kind,position,radius,shape:'cylinder',surface:'soil',material:'stone',tick:sim.tick}))dirty.add(id);}
 for(const body of sim.bodies)body.sleeping=false;game.support();
 return {dirty:[...dirty],message:mode==='raise'?'土を上げました':mode==='path'?'土の道を作りました':'敷地を平らにしました'};
}
