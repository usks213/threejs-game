import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
const idle={x:0,z:0,sprint:false,block:false,water:false};
it('a mathematically elapsed 0.7s cast cooldown does not retain a floating point lockout',()=>{const sim=new CoreSimulation(true,false,true),p=sim.player,eye=sim.eye(),point={x:-1.7,y:.58,z:6.25};p.yaw=Math.atan2(-(point.x-eye.x),-(point.z-eye.z));p.pitch=Math.atan2(point.y-eye.y,Math.hypot(point.x-eye.x,point.z-eye.z));sim.selectedElement='water';expect(sim.target(7)).not.toBeNull();sim.action('cast',idle);expect(p.phase).toBe('cast');for(let i=0;i<21;i++)sim.tick(1/30,idle);expect(p.phase).toBe('idle');const stamina=p.stamina;sim.action('cast',idle);expect(p.phase).toBe('cast');expect(p.stamina).toBe(stamina-18);});
