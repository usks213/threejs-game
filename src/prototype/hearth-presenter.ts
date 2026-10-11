import type {CoreSimulation} from './core/simulation';
import {flameBuildRadius,flameShroudMaximum,MAX_FLAME_TIER} from './core/flame';
import type {CampaignRow} from './campaign-ui';

export function hearthRows(sim:CoreSimulation):CampaignRow[]{
 const c=sim.campaign,tier=c.state.flameTier,next=Math.min(MAX_FLAME_TIER,Math.max(1,tier+1)),spawn=c.spawnPoint;
 return [
  {id:'hearth-conditions',label:`灯守りの炉 · ${tier?'段階'+tier:'未点火'}`,detail:'谷の固定の炉を木材8・石6で点火。炉の移設・自由配置はできません。建築は点火した領域内の支持された地面へ、身体や固体を避けて設置します。'},
  {id:'hearth-territory',label:`建築領域 · 半径${c.buildingRadius}m未満`,detail:(tier?`中心: ${sim.buildingHomes.map(p=>p.name).join(' / ')}。`:'点火後に建築と盛土を解放。')+(tier<MAX_FLAME_TIER?`炉が段階${next}になると半径${flameBuildRadius(next)}m未満へ拡大。`:'炉の段階と範囲は最大。')+'範囲拡大は霧への耐性とは別の効果です。'},
  {id:'hearth-resistance',label:`霧の猶予 · 炉${flameShroudMaximum(tier)}秒 / 技能込み${c.shroudMaximum}秒`,detail:(tier<MAX_FLAME_TIER?`段階${next}の炉では${flameShroudMaximum(next)}秒。`:'炉による猶予は最大。')+'段階2で谷の濃い霧の急速な消耗を抑えます。炉を強化しても霧に無期限には滞在できません。'},
  {id:'hearth-respawn',label:`現在の復活先 · ${spawn.label}`,detail:`基準座標 (${spawn.position.x}, ${spawn.position.y}, ${spawn.position.z}) 周辺の安全な地面へ戻ります。周辺が塞がれると開始地点側へ退避します。地域の帰還炉へ移動しても復活先は変わりません。尾根の野営地を点火すると復活先が切り替わります。`},
 ];
}
