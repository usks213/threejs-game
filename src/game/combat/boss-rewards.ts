import {ADVENTURE_BOSS_REWARDS,hasAdventureBossReward} from '../../content/adventure-boss-rewards';
import {planItemDrops,commitItemDrops} from '../interaction/drops';
import type {Adventure} from '../adventure';
import type {EnemyState} from '../types';
/** A failed placement never consumes the receipt or partially publishes a payout. */
function placeReward(game:Adventure,enemy:EnemyState):boolean{
 if(!enemy.rewardPending||!hasAdventureBossReward(enemy.definition))return true;
 try{
  const loot=ADVENTURE_BOSS_REWARDS[enemy.definition],ids=game.sim.reserveEntityIds(loot.reduce((n,[,count])=>n+Math.ceil(count/100)+1,0));let planned=game.state.resources;
  for(const[kind,count]of loot)planned=planItemDrops(game,kind,count,enemy,ids.allocate,undefined,planned);
  ids.commit();commitItemDrops(game,planned);delete enemy.rewardPending;return true;
 }catch{return false;}
}
/** Victory remains valid if a full drop budget prevents immediate loot placement.
 * The pending receipt is saved on the dead boss, and survives server restart. */
export function completeAdventureBoss(game:Adventure,enemy:EnemyState):boolean{
 if(!enemy.boss||!hasAdventureBossReward(enemy.definition))return false;
 if(!game.state.defeated.includes(enemy.definition)){game.state.defeated.push(enemy.definition);enemy.rewardPending=true;}
 placeReward(game,enemy);return true;
}
export function flushPendingBossRewards(game:Adventure):void{
 for(const enemy of game.state.enemies)if(enemy.health<=0&&enemy.rewardPending)placeReward(game,enemy);
}
