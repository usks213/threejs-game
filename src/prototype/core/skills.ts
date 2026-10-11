/** Nine earned level points fund three finite, three-rank skills. */
export const SKILL_MAX_RANK=3;
export const SKILL_RANK_LEVELS=[2,4,7] as const;
export const MAX_SHROUD_SECONDS=270;
export interface SkillDefinition {id:string;label:string;description:string;cost:number;requires?:string}
export const CAMPAIGN_SKILLS:readonly SkillDefinition[]=[
 {id:'vigor',label:'丈夫な身体',description:'ランクごとに最大HP +20（最大 +60）。ランク1で剣・両手剣・短剣の集中技を解放',cost:1},
 {id:'endurance',label:'旅人の呼吸',description:'ランクごとに最大スタミナ +20・移動速度 +8%（最大 +60・+24%）',cost:1},
 {id:'attunement',label:'霞への適応',description:'ランクごとに霧の滞在上限 +30秒（最大 +90秒）。前提: 旅人の呼吸が同じランク以上',cost:1,requires:'endurance'},
];
export interface SkillProgress {skills:string[];skillRanks?:Record<string,number>;skillPoints:number;level:number}
/** An absent rank map is the original one-point-per-skill save format. */
export const skillRank=(state:SkillProgress,id:string)=>state.skillRanks?.[id]??(state.skills.includes(id)?1:0);
export const skillPointsSpent=(state:SkillProgress)=>CAMPAIGN_SKILLS.reduce((n,skill)=>n+skillRank(state,skill.id)*skill.cost,0);
export function validSkillProgress(state:SkillProgress):boolean {
 if(!Array.isArray(state.skills)||state.skills.length>CAMPAIGN_SKILLS.length||new Set(state.skills).size!==state.skills.length||state.skills.some(id=>!CAMPAIGN_SKILLS.some(skill=>skill.id===id)))return false;
 const ranks=state.skillRanks;
 if(ranks!==undefined&&(!ranks||typeof ranks!=='object'||Array.isArray(ranks)||Object.keys(ranks).length!==state.skills.length||Object.entries(ranks).some(([id,rank])=>!state.skills.includes(id)||!Number.isSafeInteger(rank)||rank<1||rank>SKILL_MAX_RANK)))return false;
 for(const skill of CAMPAIGN_SKILLS){const rank=skillRank(state,skill.id);if(!Number.isSafeInteger(rank)||rank<0||rank>SKILL_MAX_RANK||state.skills.includes(skill.id)!==(rank>0)||rank>0&&state.level<SKILL_RANK_LEVELS[rank-1]||skill.requires&&rank>skillRank(state,skill.requires))return false;}
 return state.skillPoints+skillPointsSpent(state)===state.level-1;
}
export function skillLearnStatus(state:SkillProgress,id:string,target=skillRank(state,id)+1):{ok:boolean;message:string} {
 const skill=CAMPAIGN_SKILLS.find(skill=>skill.id===id);if(!skill)return {ok:false,message:'未知のスキル'};
 const rank=skillRank(state,id);
 if(rank>=SKILL_MAX_RANK)return {ok:false,message:'ランク上限 3/3'};
 if(!Number.isSafeInteger(target)||target!==rank+1)return {ok:false,message:'技能ランクが変わりました。現在のランクを確認してください'};
 const level=SKILL_RANK_LEVELS[target-1];if(state.level<level)return {ok:false,message:`ランク${target}にはレベル${level}が必要`};
 if(skill.requires&&skillRank(state,skill.requires)<target)return {ok:false,message:`前提: 旅人の呼吸 ランク${target}`};
 if(state.skillPoints<skill.cost)return {ok:false,message:'スキルポイントが不足'};
 return {ok:true,message:`ランク${target}へ · ${skill.cost}ポイント · 必要レベル${level}`};
}
