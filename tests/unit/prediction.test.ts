import {it,expect} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {SessionAuthority} from '../../src/simulation/session';
import {sessionFrame} from '../../src/networking/frame';
import {Prediction} from '../../src/networking/prediction';
it('predicts movement immediately then replays only commands the authority has not acknowledged',()=>{
 const authority=new SessionAuthority(),actor=authority.join('guest'),replica=new GameSimulation(authority.sim.save()),prediction=new Prediction(replica);
 prediction.reconcile(sessionFrame(authority,'guest'));const before=replica.player.x;
 prediction.input(1,{x:1,z:0,jump:false});expect(replica.player.x).toBeGreaterThan(before);
 authority.input('guest',{x:1,z:0,jump:false},1);authority.step();
 const frame=sessionFrame(authority,'guest');expect(frame.ack).toBe(1);
 prediction.reconcile(frame);expect(replica.player.x).toBeCloseTo(actor.player.x,6);
 prediction.input(2,{x:1,z:0,jump:false});const predicted=replica.player.x;
 prediction.reconcile(frame);expect(replica.player.x).toBeCloseTo(predicted,6);
});
