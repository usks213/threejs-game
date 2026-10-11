import {CAMPAIGN_SKILLS,SKILL_MAX_RANK,SKILL_RANK_LEVELS,skillPointsSpent} from './core/skills';
import {GEMS,gemEffect} from './core/gems';
import {CAMPAIGN_ITEMS,type CampaignSystem} from './core/campaign';
import type {Vec3} from './core/voxel';
import type {CampaignRow} from './campaign-ui';

export function skillRows(c:CampaignSystem):CampaignRow[]{
 return CAMPAIGN_SKILLS.map(skill=>{
  const rank=c.skillRank(skill.id),max=rank===SKILL_MAX_RANK,next=Math.min(SKILL_MAX_RANK,rank+1),status=c.learnStatus(skill.id,next);
  const effect=skill.id==='vigor'?`最大HP +${rank*20}`:skill.id==='endurance'?`最大スタミナ +${rank*20}・移動速度 +${rank*8}%`:`霧の滞在上限 +${rank*30}秒`;
  return {id:`${skill.id}:${next}`,label:`${skill.label} · ランク ${rank}/${SKILL_MAX_RANK}`,detail:`現在: ${effect}。${skill.description}。${max?'上限に到達':`次のランク: ${skill.cost}ポイント・レベル${SKILL_RANK_LEVELS[next-1]}`}`,reason:status.message,completed:max,available:status.ok,action:'learn'};
 });
}
export function gemSocketRows(c:CampaignSystem,id:string,position:Vec3):CampaignRow[]{
 if(id==='build-hammer')return [{id:`socket:${id}`,label:'ジェム枠なし',detail:'建築槌は修理のみ対応',available:false,action:'gear'}];
 const socket=c.gearInfo(id).socket;
 return [...GEMS.map(gem=>{const status=c.socketStatus(id,gem.id,position);return {id:`socket:${id}:${gem.id}`,label:`${gem.label}を${socket&&socket!==gem.id?'交換装着':'装着'}`,detail:`所持 ${c.state.items[gem.id]??0}/20 · ${gemEffect(gem)}`,reason:status.message,completed:socket===gem.id,available:status.ok,action:'gear' as const};}),
  ...(socket?[{id:`unsocket:${id}`,label:`${CAMPAIGN_ITEMS[socket].label}を外す`,detail:'装着した石を1個返却。返却先の所持枠が必要',reason:c.socketStatus(id,null,position).message,available:c.socketStatus(id,null,position).ok,action:'gear' as const}]:[])];
}
export const skillResetRow=(c:CampaignSystem):CampaignRow=>({id:'reset-skills',label:'技能を再配分',detail:`習得・強化した技能の ${skillPointsSpent(c.state)}ポイントをすべて戻す。レベル10で合計9ポイント`,available:c.state.skills.length>0,action:'gear'});
