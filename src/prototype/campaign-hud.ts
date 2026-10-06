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
 if(s.cold&&s.cold>=80)dangers.push({text:'寒冷 '+Math.ceil(s.cold)+'%',help:s.warmth?'火のそばで暖まり中':'火へ避難／退域で回復'});
 const coldCue=s.coldWarning==='approaching'?'寒冷地域が近い':s.coldWarning==='inside'?'寒冷地域'+(s.cold?' '+Math.ceil(s.cold)+'%':''):undefined;
 const coldAdvice=s.coldWarning==='approaching'?'服・食事・火で備える':s.coldWarning==='inside'?'服・食・火／外で回復':undefined;
 const conditions=[s.mistWarning??'',coldCue??'',s.coldWarning?'保温装備・食事・火で寒さを軽減 · 寒冷地域の外で回復':'',s.shroud!==undefined?'霧の猶予 '+timer(s.shroud):'',s.oxygen!==undefined?'酸素 '+Math.ceil(s.oxygen):'',s.burning?'炎上 '+Math.ceil(s.burning)+'秒':'',s.shock?'感電':'',s.wet?'濡れ '+Math.ceil(s.wet)+'秒':'',s.cold?'寒冷 '+Math.ceil(s.cold)+'%':'',s.warmth?'火のぬくもり':'',s.food?'食事 '+timer(s.food):'',s.rest?'休息 '+timer(s.rest):'',s.focus?'集中 '+Math.floor(s.focus):''].filter(Boolean);
 return {headline:dangers[0]?.text??coldCue??`Lv.${s.level} · ${s.region}`,detail:dangers.length>1?dangers[1].text+(dangers.length>2?' ほか'+(dangers.length-2):''):dangers[0]?.help??(s.shroud!==undefined?'霧 '+timer(s.shroud):coldAdvice??(s.wet?'濡れ '+Math.ceil(s.wet)+'秒':s.mistWarning??s.weather??'探索中')),danger:dangers.length>0,full:[`Lv.${s.level}`,s.region,s.weather,...conditions].filter(Boolean).join(' · ')};
}

/** Refer to the touch toolbar's visible labels instead of unavailable keys. */
export function campaignBuildingHint(mobile:boolean){
 return mobile?'地面を狙い「置く」をタップ · 部材名で切替':'建築: V部品 / F回転 / B設置 / X戻す / G終了';
}
