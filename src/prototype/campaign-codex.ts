import {CAMPAIGN_ITEMS,CAMPAIGN_MATERIALS,CAMPAIGN_RECIPES,type CampaignItem,type CampaignSystem} from './core/campaign';
import {REGIONS,REGIONAL_POINTS,REGIONAL_ENEMIES,REGIONAL_UPGRADES} from './core/regions';
import {PROCESSING_RECIPES,FURNITURE} from './core/homestead';
import {SURVIVAL_RECIPES} from './core/survival';
import {materialDiscoveryId,itemDiscoveryId} from './core/discovery';

export interface CampaignCodexEntry {id:string;label:string;category:string;discovered:boolean;region:string;source:string;uses:string}
export interface CodexFilter {query:string;status:'all'|'discovered'|'unknown'}
const categories:Record<CampaignItem['category'],string>={weapon:'武器',armor:'防具',tool:'道具',food:'食料',medicine:'回復',quest:'重要品・記録',accessory:'装飾・強化',ammunition:'矢弾',resource:'素材',farming:'農業'};
const unique=(values:string[])=>[...new Set(values)];
function regionsForItem(id:string){
 const sources=[...REGIONAL_POINTS,...REGIONAL_ENEMIES].filter(source=>(source.reward.items?.[id]??0)>0);
 if(sources.length)return unique(sources.map(source=>REGIONS.find(r=>r.id===source.region)!.name)).join(' / ');
 if(['herb-seed','herbs','milk'].includes(id))return '拠点の畑・山羊の庭';
 if(id==='silverfin')return '火守りの谷の水辺 / 澄鐘の湖';
 if(id==='mist-core')return '火守りの谷・霞の高台';
 if(id==='warden-core')return '火守りの谷・地下墓所';
 if(id==='ember-charm')return '銅風の尾根';
 const recipe=CAMPAIGN_RECIPES.find(r=>r.output===id);
 if(recipe?.requiresProfession)return '西方遠征の職人を救出した後の拠点';
 return recipe?.station==='hand'?'各地（手作り）':recipe?.station==='forge'?'拠点の鍛冶設備':recipe?.station==='hearth'?'点火済みの灯守りの炉':'拠点';
}
function usesForItem(item:CampaignItem){
 const recipes=CAMPAIGN_RECIPES.filter(r=>(r.itemCost?.[item.id]??0)>0).map(r=>r.label+'の制作');
 const processing=PROCESSING_RECIPES.filter(r=>(r.itemCost[item.id]??0)>0).map(r=>r.label);
 const upgrades=REGIONAL_UPGRADES.filter(r=>(r.requires as readonly string[]).includes(item.id)||Object.hasOwn(r.cost,item.id)).map(r=>REGIONS.find(region=>region.id===r.opens)!.name+'の解放');
 const locks=REGIONAL_POINTS.filter(p=>p.requires?.includes(item.id)).map(p=>p.name+'の開封');
 const description=item.id==='lake-pearl'?'湖の探索で集める収集品。現時点では制作や強化に消費しない。':item.description;
 return [description,...unique([...recipes,...processing,...upgrades,...locks])].join(' / ');
}
function usesForMaterial(id:number,description:string){
 const uses=[...CAMPAIGN_RECIPES.filter(r=>(r.cost[id]??0)>0).map(r=>r.label),...PROCESSING_RECIPES.filter(r=>(r.materialCost[id]??0)>0).map(r=>r.label),...FURNITURE.filter(f=>(f.cost[id]??0)>0).map(f=>f.label)];
 if(id===4)uses.push(...Object.values(SURVIVAL_RECIPES).map(r=>r.label),'灯守りの炉の点火');
 if(id===3)uses.push('灯守りの炉の点火');
 if(id===2||id===7)uses.push('野草の種の選別');
 if(id===7)uses.push('山羊の手なずけ・餌');
 return [description,...unique(uses)].join(' / ');
}
const catalog:Omit<CampaignCodexEntry,'discovered'>[]=[
 ...Object.values(CAMPAIGN_MATERIALS).map(m=>({id:materialDiscoveryId(m.id),label:m.icon+' '+m.label,category:'基礎素材',region:m.id===10?'拠点の鍛冶師・繊維加工 / 各地の探索':'火守りの谷 / 各地の採集',source:m.source,uses:usesForMaterial(m.id,m.description)})),
 ...Object.values(CAMPAIGN_ITEMS).map(item=>({id:itemDiscoveryId(item.id),label:item.icon+' '+item.label,category:categories[item.category],region:regionsForItem(item.id),source:item.source,uses:usesForItem(item)})),
];
/** The catalog is read-only and never awards discovery, materials, XP or map pins.
 * Unknown entries show a checklist name, but no source, secret POI or region hints. */
export function campaignCodex(campaign:CampaignSystem):CampaignCodexEntry[]{
 return catalog.map(entry=>campaign.hasDiscovered(entry.id)?{...entry,discovered:true}:{...entry,discovered:false,region:'未確認',source:'初めて入手すると記録されます。',uses:'入手後に確認できます。'});
}
export function filterCodex(entries:readonly CampaignCodexEntry[],filter:CodexFilter){
 const query=filter.query.trim().toLocaleLowerCase();
 return entries.filter(entry=>(filter.status==='all'||entry.discovered===(filter.status==='discovered'))&&`${entry.label} ${entry.category} ${entry.region} ${entry.source} ${entry.uses}`.toLocaleLowerCase().includes(query));
}
