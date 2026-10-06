/** Recipe-defined base quality and level, independent of saved wear/upgrades/gems.
 * Levels compare power within an archetype; they are not player-level requirements.
 * Fixed recipes preserve their established combat values and never roll random loot. */
export type EquipmentQuality='standard'|'refined';
export const BOW_DAMAGE=28;
export interface EquipmentProfile {level:1|2|3;quality:EquipmentQuality;power:'physical'|'spell'|'tool'|'none';armorBaseline?:number}
const standard=(power:EquipmentProfile['power']='none',armorBaseline?:number):EquipmentProfile=>({level:1,quality:'standard',power,...(armorBaseline===undefined?{}:{armorBaseline})});
const refined=(level:EquipmentProfile['level'],power:EquipmentProfile['power']='none',armorBaseline?:number):EquipmentProfile=>({level,quality:'refined',power,...(armorBaseline===undefined?{}:{armorBaseline})});
export const EQUIPMENT_PROFILES:Readonly<Record<string,EquipmentProfile>>={
 'iron-blade':refined(2,'physical'),bow:standard('physical'),staff:refined(1,'spell'),'resin-staff':refined(3,'spell'),greatsword:standard('physical'),dagger:standard('physical'),
 'hide-coat':standard('none',.2),'copper-mail':refined(2,'none',.2),
 'cloth-hood':standard('none',.08),'copper-helm':refined(2,'none',.08),
 'cloth-leggings':standard('none',.1),'copper-greaves':refined(2,'none',.1),'copper-shield':standard('none',0),
 'wood-axe':standard('tool'),'stone-pick':standard('tool'),'terrain-rake':standard('tool'),'build-hammer':standard(),
};
export const EQUIPMENT_QUALITY_LABELS:Record<EquipmentQuality,string>={standard:'標準',refined:'精製'};
const precise=(n:number)=>Math.round(n*10000)/10000;
/** Each level adds 10% of the archetype baseline. Refined quality adds 20%
 * weapon power or 40% of the armor baseline, before upgrades and socket effects. */
export function equipmentBaseStats(profile:EquipmentProfile){
 const levelBonus=(profile.level-1)*.1,refined=profile.quality==='refined';
 const power=precise(1+levelBonus+(refined?.2:0));
 return {attackMultiplier:profile.power==='physical'?power:1,spellMultiplier:profile.power==='spell'?power:1,toolMultiplier:profile.power==='tool'?power:1,reduction:precise((profile.armorBaseline??0)*(1+levelBonus+(refined?.4:0)))};
}
export function itemBaseStats(id:string|null){const profile=id?EQUIPMENT_PROFILES[id]:undefined;return profile?equipmentBaseStats(profile):{attackMultiplier:1,spellMultiplier:1,toolMultiplier:1,reduction:0};}
