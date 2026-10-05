import type {CampaignUISnapshot} from './campaign-ui';
const timer=(n:number)=>`${Math.floor(Math.max(0,n)/60)}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
/** Two deliberately short lines fit the mobile HUD. Critical countdowns precede
 * region/buff text; the complete readout is retained for the journal and ARIA. */
export function campaignHudText(s:CampaignUISnapshot['stats']){
 const dangers:{text:string;help:string}[]=[];
 if(s.shroud!==undefined&&s.shroud<30)dangers.push({text:'霧 '+timer(s.shroud),help:'霧の外へ退避'});
 if(s.oxygen!==undefined&&s.oxygen<8)dangers.push({text:'酸素 '+Math.ceil(s.oxygen)+'秒',help:'水面へ浮上'});
 if(s.burning)dangers.push({text:'炎上 '+Math.ceil(s.burning)+'秒',help:'水で消火する'});
 if(s.shock)dangers.push({text:'感電',help:'金属から離れる'});
 if(s.cold&&s.cold>=80)dangers.push({text:'寒冷 '+Math.ceil(s.cold)+'%',help:s.warmth?'火のそばで暖まり中':'暖かい炉へ'});
 const conditions=[s.mistWarning??'',s.shroud!==undefined?'霧の猶予 '+timer(s.shroud):'',s.oxygen!==undefined?'酸素 '+Math.ceil(s.oxygen):'',s.burning?'炎上 '+Math.ceil(s.burning)+'秒':'',s.shock?'感電':'',s.wet?'濡れ '+Math.ceil(s.wet)+'秒':'',s.cold?'寒冷 '+Math.ceil(s.cold)+'%':'',s.warmth?'火のぬくもり':'',s.food?'食事 '+timer(s.food):'',s.rest?'休息 '+timer(s.rest):'',s.focus?'集中 '+Math.floor(s.focus):''].filter(Boolean);
 return {headline:dangers[0]?.text??`Lv.${s.level} · ${s.region}`,detail:dangers.length>1?dangers[1].text+(dangers.length>2?' ほか'+(dangers.length-2):''):dangers[0]?.help??(s.shroud!==undefined?'霧 '+timer(s.shroud):s.wet?'濡れ '+Math.ceil(s.wet)+'秒':s.mistWarning??s.weather??'探索中'),danger:dangers.length>0,full:[`Lv.${s.level}`,s.region,s.weather,...conditions].filter(Boolean).join(' · ')};
}
