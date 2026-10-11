/** Shared facts for territory enforcement and its player-facing explanation. */
export const MAX_FLAME_TIER=5;
export const flameBuildRadius=(tier:number)=>tier>0?10+tier*3:0;
export const flameShroudMaximum=(tier:number)=>60+Math.max(0,tier-1)*30;
export const flameUpgradeSummary=(from:number,to:number)=>`建築半径 ${flameBuildRadius(from)}→${flameBuildRadius(to)}m未満 / 炉の霧猶予 ${flameShroudMaximum(from)}→${flameShroudMaximum(to)}秒`;
