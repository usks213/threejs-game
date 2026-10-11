import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {ensureCampaignAnchor} from '../../src/prototype/core/campaign-repairs';
import {captureCampaign,hydrateCampaign,defaultSettings} from '../../src/prototype/campaign-session';
it('repairs the sub-voxel anchor without changing the legacy baseline and grapples onto a clear ledge',()=>{
 const s=new CoreSimulation(true);expect(s.arena.field.exportState().baseline).toBe('campaign-v2:c1602605');expect(ensureCampaignAnchor(s.arena.field)).toBe(false);
 s.player.position={x:7,y:.25,z:-3};s.campaign.state.items.grapple=1;s.campaign.equip('grapple');const eye=s.eye(),point={x:7,y:4.1,z:-6.8};s.player.yaw=Math.atan2(-(point.x-eye.x),-(point.z-eye.z));s.player.pitch=Math.atan2(point.y-eye.y,Math.hypot(point.x-eye.x,point.z-eye.z));expect(s.target(7)?.hit.cell.object).toBe('grapple-mist');s.action('interact',{x:0,z:0,sprint:false,block:false,water:false});expect(s.grapple).not.toBeNull();for(let i=0;i<240;i++)s.tick(1/60,{x:0,z:0,sprint:false,block:false,water:false});expect(s.player.hp).toBeGreaterThan(0);expect(s.player.position.z).toBeLessThan(-6.7);expect(s.player.position.y).toBeGreaterThan(3);expect(s.arena.field.overlaps(s.player.position)).toBe(false);
 const data=captureCampaign(s,defaultSettings()),restored=hydrateCampaign(data);expect(restored).not.toBeNull();expect(restored!.sim.arena.field.get(28,15,-28)?.object).toBe('grapple-mist');
},30000);
