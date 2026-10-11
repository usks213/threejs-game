import type {Action,Snapshot} from '../../../src/dungeon/types';

interface Sample {stage:string;tick:number;elapsed:number;lastAction:number;actor:Pick<Snapshot['actors'][number],'id'|'phase'|'kind'|'status'>}
interface SentAction {sequence:number;action:Action}
export interface ExpectedAttack {
 stage:string;actorId:string;sequence:number;heavy:boolean;kind:Sample['actor']['kind'];
 sampleStart:number;actionStart:number;tick:number;elapsed:number;
}
/** The real touch command may finish awaiting CDP ACKs after the attack has
 * returned to idle. Require its observed authoritative transition, never just
 * an ACK or whatever phase happens to be current after the input call returns. */
export function dungeonAttackObserved(samples:readonly Sample[],actions:readonly SentAction[],expected:ExpectedAttack){
 const sent=actions.slice(expected.actionStart);
 if(sent.length!==1||sent[0].sequence!==expected.sequence||sent[0].action.kind!=='attack'||!!sent[0].action.heavy!==expected.heavy)return false;
 return samples.slice(expected.sampleStart).some(sample=>sample.stage===expected.stage&&sample.actor.id===expected.actorId&&
  sample.lastAction===expected.sequence&&sample.tick>=expected.tick&&sample.elapsed>=expected.elapsed&&
  sample.actor.status==='alive'&&sample.actor.kind===expected.kind&&
  (sample.actor.phase==='windup'||sample.actor.phase==='strike'||sample.actor.phase==='recover'));
}
