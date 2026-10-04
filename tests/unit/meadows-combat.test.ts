import { expect,it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { inStagAttack,stepStag,STAG_ATTACKS } from '../../src/game/meadows/boss';
import { movementSpeed } from '../../src/game/meadows/movement';
function setup(){const sim=new GameSimulation(),g=sim.adventure,p=sim.player;const altar=g.state.resources.find(n=>n.kind==='altar')!;Object.assign(p,altar);g.state.inventory.deerTrophy=2;g.action('summon');const e=g.state.enemies.find(e=>e.boss)!;e.cooldown=0;e.x=p.x;e.z=p.z-3;e.y=p.y;g.state.enemies=[e];return{sim,g,p,e};}
it('uses directional antlers and lightning, with independent cooldowns and fixed tell aim',()=>{
 const {g,p,e}=setup();e.attackReady={stomp:100,beam:100};stepStag(g,e,.1);expect(e.attackKind).toBe('antler');const yaw=e.attackYaw;p.x+=3;stepStag(g,e,.3);expect(e.attackYaw).toBe(yaw);expect(inStagAttack(e,p,'antler')).toBe(false);const hp=g.state.health;stepStag(g,e,1);expect(g.state.health).toBe(hp);expect(e.attackReady.antler).toBe(g.state.seconds+5);expect(STAG_ATTACKS.beam.cooldown).toBe(25);expect(STAG_ATTACKS.stomp.cooldown).toBe(40);
});
it('hits in front but not behind, and a exhausted guard does not nullify damage',()=>{
 const {g,p,e}=setup();e.attackYaw=0;expect(inStagAttack(e,p,'beam')).toBe(true);expect(inStagAttack(e,{...p,z:e.z-2},'beam')).toBe(false);expect(inStagAttack(e,{...p,z:e.z-2},'stomp')).toBe(true);g.state.inventory.shield=1;g.guarding=true;g.state.stamina=0;p.heading=Math.PI;g.hurtPlayer(10,'physical',p,e);expect(g.guarding).toBe(false);expect(g.state.health).toBeLessThan(25);
});
it('recovers stamina when a run toggle is on but the player is standing still',()=>{
 const {g}=setup();g.state.stamina=10;g.state.meadows!.sprinting=true;movementSpeed(g,false,0,1/30);g.stepPersonal(1);expect(g.state.stamina).toBeGreaterThan(10);
});
