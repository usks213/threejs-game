import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {flameBuildRadius,flameShroudMaximum} from '../../src/prototype/core/flame';
import {hearthRows} from '../../src/prototype/hearth-presenter';
import {REGIONAL_POINTS} from '../../src/prototype/core/regions';
const home={x:-3,y:.25,z:4};
it('enforces and explains the same real territory boundary as the flame grows',()=>{
 const s=new CoreSimulation(true,false,true);
 expect(s.buildingHomes).toEqual([]);expect(s.campaign.buildingRadius).toBe(0);expect(s.soilContext(home).permission).toContain('点火');
 for(const [tier,radius] of [[1,13],[2,16],[5,25]]){
  s.campaign.state.flameTier=tier;expect(flameBuildRadius(tier)).toBe(radius);expect(s.campaign.buildingRadius).toBe(radius);
  const inside={...home,x:home.x+radius-.01},boundary={...home,x:home.x+radius};expect(s.withinBuildingTerritory(inside)).toBe(true);expect(s.soilContext(inside).permission).toBe('');expect(s.withinBuildingTerritory(boundary)).toBe(false);expect(s.soilContext(boundary).permission).toContain(`半径${radius}m未満`);
  const rows=hearthRows(s);expect(rows.find(r=>r.id==='hearth-territory')?.label).toContain(`半径${radius}m未満`);expect(rows.find(r=>r.id==='hearth-resistance')?.label).toContain(`炉${flameShroudMaximum(tier)}秒`);
 }
 expect(hearthRows(s).find(r=>r.id==='hearth-territory')?.detail).toContain('最大');
});
it('lists only real active construction origins and distinguishes respawn from regional travel',()=>{
 const s=new CoreSimulation(true,false,true);s.campaign.state.flameTier=2;s.campaign.state.gateOpen=true;
 const regional=REGIONAL_POINTS.find(p=>p.id==='rg-rime-hearth')!;s.campaign.state.claimedPoints.push(regional.id);
 expect(s.buildingHomes.map(p=>p.id)).toEqual(['hearth',regional.id]);expect(s.withinBuildingTerritory(regional.position)).toBe(true);
 expect(hearthRows(s).find(r=>r.id==='hearth-territory')?.detail).toContain(regional.name);expect(hearthRows(s).find(r=>r.id==='hearth-respawn')?.label).toContain('灯守りの炉');
 s.campaign.interact('nextcamp',{x:0,y:3,z:-31});expect(s.campaign.spawnPoint.id).toBe('nextcamp');expect(s.campaign.respawn()).toEqual(s.campaign.spawnPoint.position);expect(hearthRows(s).find(r=>r.id==='hearth-respawn')?.label).toContain('尾根の野営地');
 expect(s.buildingHomes.map(p=>p.id)).not.toContain('nextcamp');
});
it('shows expansion and resistance independently, including the no-resistance increase at first ignition',()=>{
 const s=new CoreSimulation(true,false,true),rows=hearthRows(s);
 expect(rows.find(r=>r.id==='hearth-conditions')?.detail).toContain('木材8・石6');expect(rows.find(r=>r.id==='hearth-territory')?.detail).toContain('半径13m未満');expect(rows.find(r=>r.id==='hearth-resistance')?.detail).toContain('段階1の炉では60秒');
 s.campaign.state.flameTier=1;expect(hearthRows(s).find(r=>r.id==='hearth-territory')?.detail).toContain('半径16m未満');expect(hearthRows(s).find(r=>r.id==='hearth-resistance')?.detail).toContain('段階2の炉では90秒');
});
it('reports actual ignition and upgrade changes immediately at the furnace',()=>{
 const s=new CoreSimulation(true,false,true),c=s.campaign;Object.assign(c.materials,{3:6,4:8});
 const ignition=c.interact('hearth',home);expect(ignition.ok).toBe(true);expect(ignition.message).toContain('建築半径 0→13m未満');expect(ignition.message).toContain('炉の霧猶予 60→60秒');
 c.state.items['mist-core']=1;c.state.items['warden-core']=1;const upgraded=c.interact('hearth',home);expect(upgraded.ok).toBe(true);expect(upgraded.message).toContain('建築半径 13→16m未満');expect(upgraded.message).toContain('炉の霧猶予 60→90秒');expect(c.buildingRadius).toBe(16);expect(c.shroudMaximum).toBe(90);
});
