import type { BattleResult, Format, Match } from './types';

/** Japan regulations, 12th edition, effective 2026-03-13. Event overrides not modeled. */
export const RULES_VERSION = 'JP-12-2026-03-13';
export const RULES_SOURCE = 'https://beyblade.takaratomy.co.jp/beyblade-x/_image/regulation.pdf';
export const points = { spin:1, over:2, burst:2, xtreme:3 } as const;
export function createMatch(format: Format = 'basic'): Match { return { format, target:4, scores:[0,0], round:1, winner:null, last:null }; }
export function scoreRound(match: Match, result: BattleResult): Match {
  if(match.winner!==null) return match;
  if((result.finish==='draw') !== (result.winner===null)) throw new Error('Draw must have no winner');
  const scores: [number,number]=[...match.scores];
  if(result.winner!==null && result.finish!=='draw') scores[result.winner]+=points[result.finish];
  return { ...match, scores, round:match.round+(result.winner===null?0:1), winner:scores[0]>=match.target?0:scores[1]>=match.target?1:null, last:result };
}

/** Supply canonical identities, not display/color variant IDs. Individual CX components count separately. */
export interface DeckPartIdentity { category: string; canonicalId: string }
export interface DeckLegality { valid: boolean; errors: string[] }
const exceptionalChips = new Set(['valkyrie','emperor','ワルキューレ','エンペラー']);
export function validateThreeOnThreeParts(deck: readonly (readonly DeckPartIdentity[])[]): DeckLegality {
  const errors: string[]=[];
  if(deck.length!==3) errors.push('3on3 requires exactly three builds');
  const seen=new Set<string>();
  for(const build of deck) {
    if(!build.length) errors.push('A build must contain verified component identities');
    const inBuild=new Set<string>();
    for(const part of build) {
      const id=part.canonicalId.trim().toLowerCase();
      if(!id) { errors.push('Missing canonical part identity'); continue; }
      const key=`${part.category}:${id}`;
      if(inBuild.has(key)) errors.push(`Duplicate component within one build: ${key}`);
      inBuild.add(key);
      const repeatableChip=part.category==='lock_chip' && !exceptionalChips.has(id);
      if(seen.has(key) && !repeatableChip) errors.push(`Duplicate part across deck: ${key}`);
      seen.add(key);
    }
  }
  return {valid:errors.length===0,errors};
}

export type DeckOrder = [0|1|2,0|1|2,0|1|2];
export interface ThreeOnThree {
  match: Match;
  orders: [DeckOrder,DeckOrder];
  slot: 0|1|2;
  cycle: number;
  needsReorder: boolean;
}
function assertOrder(order: DeckOrder) {
  if(order.length!==3 || new Set(order).size!==3 || order.some(i=>i!==0 && i!==1 && i!==2)) throw new Error('Deck order must be a permutation of 0, 1, 2');
}
export function createThreeOnThree(orders: [DeckOrder,DeckOrder] = [[0,1,2],[0,1,2]]): ThreeOnThree {
  orders.forEach(assertOrder);
  return {match:createMatch('three-on-three'),orders:[[...orders[0]],[...orders[1]]],slot:0,cycle:1,needsReorder:false};
}
/** Index of each player's locked build; do not substitute parts between rounds. */
export function activeDeckSlots(state: ThreeOnThree): [number,number] {
  if(state.needsReorder) throw new Error('Both decks must be reordered before the next round');
  return [state.orders[0][state.slot],state.orders[1][state.slot]];
}
export function scoreThreeOnThreeRound(state: ThreeOnThree, result: BattleResult): ThreeOnThree {
  if(state.match.winner!==null) return state;
  if(state.needsReorder) throw new Error('Cannot score a new battle before deck reorder');
  const match=scoreRound(state.match,result);
  if(result.winner===null || match.winner!==null) return {...state,match};
  if(state.slot===2) return {...state,match,needsReorder:true};
  return {...state,match,slot:(state.slot+1) as 1|2};
}
export function reorderThreeOnThree(state: ThreeOnThree, orders:[DeckOrder,DeckOrder]): ThreeOnThree {
  if(!state.needsReorder || state.match.winner!==null) throw new Error('Deck reorder is only allowed after three decisive rounds without a winner');
  orders.forEach(assertOrder);
  return {...state,orders:[[...orders[0]],[...orders[1]]],slot:0,cycle:state.cycle+1,needsReorder:false};
}

/** Judge-input helper; the browser launcher does not claim to detect real shoot faults. */
export interface LaunchFaultOutcome { match: Match; counts: [number,number]; relaunch: true; penaltyTo: 0|1|null }
export function recordLaunchFaults(match: Match, counts: [number,number], offenders: readonly (0|1)[]): LaunchFaultOutcome {
  if(counts.some(n=>n!==0 && n!==1)) throw new Error('Fault counters must be 0 or 1');
  const next:[number,number]=[...counts];
  if(match.winner!==null) return {match,counts:next,relaunch:true,penaltyTo:null};
  for(const player of new Set(offenders)) next[player]++;
  if(next[0]>=2 && next[1]>=2) return {match,counts:[1,1],relaunch:true,penaltyTo:null};
  const loser=next[0]>=2 ? 0 : next[1]>=2 ? 1 : null;
  if(loser===null) return {match,counts:next,relaunch:true,penaltyTo:null};
  const winner=loser===0 ? 1 : 0;
  const scores:[number,number]=[...match.scores];scores[winner]++;
  // Penalty is not a decisive physical battle, so 3on3 slot does not advance.
  const updated: Match={...match,scores,winner:scores[winner]>=match.target ? winner : null};
  return {match:updated,counts:[0,0],relaunch:true,penaltyTo:winner};
}
