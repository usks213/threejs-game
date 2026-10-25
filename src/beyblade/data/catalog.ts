import type { BeyType, Build, Part, PartCategory, Profile, Ratings } from '../core/types';
import { validateThreeOnThreeParts } from '../core/rules';
import { officialParts, officialProducts } from './official-data';
import type { OfficialPart } from './source-types';
export { officialParts, officialProducts } from './official-data';
export const CATALOG_AS_OF='2026-10-25';
export const CATALOG_COVERAGE='Partial verified catalog: missing limited releases, some random-booster combinations and unpublished component values remain. Store availability is not verified.';
const category=(raw:OfficialPart):PartCategory=>raw.category==='assembled_blade'||raw.category==='ratchet_integrated_blade'?'blade':raw.category==='ratchet_integrated_bit'?'bit':raw.category as PartCategory;
const canonical=(name:string)=>name.replace(/\s*(?:ダブル)?メタルコート[:：].*$/,'').replace(/\s*(?:クリア|ホロステッカー)Ver\.?.*$/,'').replace(/（[^）]*モード）/g,'').trim();
const leftSpin=/コバルトドラグーン|ラスタードラグーン|ライトニングエルドラゴ|メテオドラグーン|ドラグーンストーム/;
const simpleRatchets=new Set(['M-85','9-65','7-55','4-55']);
const cxCategories:PartCategory[]=['lock_chip','main_blade','metal_blade','over_blade','assist_blade'];
const statusNotes:Record<string,string>={source_image_404:'公式指定画像が404のため数値未確認。',source_image_http200_empty_body:'公式指定画像の本文が空のため数値未確認。',published_numeric_source_not_yet_verified:'名称・構成の出典は確認済みですが、数値の一次出典は未検証です。',no_individual_ratings_in_reviewed_official_detail_image:'確認済み公式画像に個別構成部品の数値掲載なし。',no_assembled_ratings_in_reviewed_official_detail_image:'確認済み公式画像にこの完成ブレードの数値掲載なし。'};
function typeFromSource(raw:OfficialPart):BeyType {
  const linked=officialProducts.find(p=>raw.source_urls.includes(p.source_url));
  if(linked?.classes.includes('atack'))return 'attack';
  if(linked?.classes.includes('defence'))return 'defense';
  if(linked?.classes.includes('stamina'))return 'stamina';
  return 'balance';
}
function normalize(raw:OfficialPart):Part {
  const linked=officialProducts.filter(p=>raw.source_urls.includes(p.source_url)||(p.detail_image_urls??[]).some(u=>raw.source_image_urls.includes(u))||(Array.isArray(p.manual_urls)&&p.manual_urls.some(u=>typeof u==='string'&&raw.source_urls.includes(u))));
  const evidenceDates=Array.isArray(raw.evidence_release_dates)?raw.evidence_release_dates.filter((d):d is string=>typeof d==='string'):[];
  const dates=[...linked.map(p=>p.release_date),...evidenceDates].filter((d):d is string=>Boolean(d)).sort();
  const released=linked.some(p=>p.date_status==='dated_on_or_before_cutoff')||evidenceDates.some(d=>d<=CATALOG_AS_OF);
  const upcoming=dates.length>0&&dates.every(d=>d>CATALOG_AS_OF);
  const components:Partial<Record<PartCategory,string>>={};
  (raw.component_names??[]).forEach((name,i)=>{const kind=raw.component_types?.[i];const part=officialParts.find(p=>p.category===kind&&p.name_ja===name);if(part)components[kind as PartCategory]=part.id;});
  const modes=(raw.modes??[]).flatMap(m=>{
    const values=raw.category==='ratchet_integrated_bit'?m.integrated_ratchet_bit_stats:m.blade_stats;
    if(!values)return [];
    return [{name:m.name,ratings:{attack:values[0]??null,defense:values[1]??null,stamina:values[2]??null,...(raw.category==='ratchet_integrated_bit'?{dash:values[3]??null,burst_resistance:values[4]??null,height:values[5]??null}:{})}}];
  });
  return {
    id:raw.id,name:raw.category==='bit'&&raw.display_name_ja&&raw.display_name_ja!==raw.name_ja?`${raw.name_ja} · ${raw.display_name_ja}`:raw.name_ja,
    category:category(raw),family:raw.family as Part['family'],type:typeFromSource(raw),ratings:raw.official_ratings,
    release:released?'released':upcoming?'upcoming':'unknown',releaseDate:dates[0]??null,
    source:raw.source_urls[0]??raw.source_image_urls[0]??'https://beyblade.takaratomy.co.jp/beyblade-x/lineup/',sourceImages:raw.source_image_urls,
    sourceCategory:raw.category,ratingScope:raw.rating_scope,canonicalId:canonical(raw.name_ja),
    integratedRatchet:raw.category==='ratchet_integrated_blade',integratedBit:raw.category==='ratchet_integrated_bit',
    requiresSimpleRatchet:raw.compatibility?.ratchet_requires==='simple_type',
    ...(category(raw)==='blade'?{spin:leftSpin.test(raw.name_ja)?-1:1,spinVerification:leftSpin.test(raw.name_ja)?'official' as const:'unverified_model_default' as const}:{}),
    requiresOverBlade:Boolean(components.over_blade),components,modes,
    ratingsVariants:raw.official_rating_variants?.map(v=>({condition:v.condition,ratings:v.ratings,source:v.source_image_url})),
    notes:[raw.notes,raw.gimmick,statusNotes[String(raw.parameter_status??'')],raw.rating_scope==='assembled_blade'?'組立済ブレードの値。構成部品への配賦はしません。':''].filter(Boolean).join(' '),availability:'unknown_not_verified',
  };
}
export const parts:Part[]=officialParts.map(normalize);
/** Named CX products with missing assembly identities remain in the archive, not the launcher. */
export function isPlayablePart(part:Part):boolean {
  if(part.release!=='released')return false;
  const raw=officialParts.find(p=>p.id===part.id);
  if(raw?.category==='assembled_blade'&&raw.family==='CX') {
    // Two non-CX blades included in CX sets are explicitly identified in the reviewed source.
    if(!raw.component_names?.length)return Boolean(raw.notes?.includes('同梱UXベイ')||raw.notes?.includes('同梱BXベイ'));
    if(raw.component_names.length!==Object.keys(part.components??{}).length)return false;
  }
  return true;
}
const byId=new Map(parts.map(p=>[p.id,p]));
const requiredPart=(category:PartCategory,name:string)=>{const p=parts.find(p=>p.category===category&&p.canonicalId===name);if(!p)throw new Error(`Catalog seed missing: ${name}`);return p.id;};
export const defaultBuild:Build={blade:requiredPart('blade','ヘルズサイズ'),ratchet:requiredPart('ratchet','4-60'),bit:requiredPart('bit','T')};
export function requiredBuildKeys(build:Build): (keyof Build)[] {
  const blade=byId.get(build.blade),bit=byId.get(build.bit);
  return ['blade',...Object.keys(blade?.components??{}) as PartCategory[],...(!blade?.integratedRatchet&&!bit?.integratedBit?['ratchet' as const]:[]),'bit'];
}
/** Conservative compatibility: CX component selection is restricted to source-verified assemblies. */
export function selectableParts(key:keyof Build,build:Build):Part[] {
  const blade=byId.get(build.blade),locked=blade?.components?.[key as PartCategory];
  return parts.filter(p=>p.category===key&&isPlayablePart(p)&&(!locked||p.id===locked)
    && !(key==='bit'&&blade?.integratedRatchet&&p.integratedBit)
    && !(key==='bit'&&blade?.requiresSimpleRatchet&&p.integratedBit)
    && !(key==='ratchet'&&blade?.requiresSimpleRatchet&&!simpleRatchets.has(p.canonicalId??'')));
}
/** Selecting a different assembled blade fills the verified component list, not guessed combinations. */
export function buildForBlade(bladeId:string,previous:Build=defaultBuild):Build {
  const blade=byId.get(bladeId);if(!blade||blade.category!=='blade')throw new Error('Unknown blade');
  const build:Build={blade:bladeId,ratchet:previous.ratchet,bit:previous.bit,...blade.components};
  if(blade.modes?.length)build.bladeMode=blade.modes[0].name;
  const bitOptions=selectableParts('bit',build);if(!bitOptions.some(p=>p.id===build.bit))build.bit=bitOptions[0]?.id??'';
  const bit=byId.get(build.bit);if(bit?.modes?.length)build.bitMode=bit.modes[0].name;
  if(blade.integratedRatchet||bit?.integratedBit)build.ratchet='';
  else {const ratchets=selectableParts('ratchet',build);if(!ratchets.some(p=>p.id===build.ratchet))build.ratchet=ratchets[0]?.id??'';}
  return build;
}
export function validateBuild(build:Build):string[] {
  if(!build||typeof build!=='object')return ['ベイ構成が不正です'];
  const errors:string[]=[],blade=byId.get(build.blade),bit=byId.get(build.bit);
  if(!blade||blade.category!=='blade')errors.push('ブレードを選択してください');
  else if(!isPlayablePart(blade))errors.push('発売日または組立構成の確認が完了していないため対戦に使用できません');
  for(const key of requiredBuildKeys(build)){
    const id=build[key];const part=typeof id==='string'?byId.get(id):undefined;
    if(!part||part.category!==key)errors.push(`${key} が不足または互換性なし`);
    else if(part.release!=='released')errors.push(`${part.name} は発売確認前です`);
  }
  for(const key of cxCategories){const expected=blade?.components?.[key];if(expected&&build[key]!==expected)errors.push(`${key}: 確認済みの組立構成を選択してください`);if(!expected&&build[key])errors.push(`${key}: このブレードには装着できません`);}
  if((blade?.integratedRatchet||bit?.integratedBit)&&build.ratchet)errors.push('一体型に別のラチェットは装着できません');
  if(blade?.integratedRatchet&&bit?.integratedBit)errors.push('ラチェット一体型ブレードと一体型ビットは併用できません');
  if(blade?.requiresSimpleRatchet&&!simpleRatchets.has(byId.get(build.ratchet)?.canonicalId??''))errors.push('クロックミラージュにはシンプルタイプのラチェットが必要です');
  for(const [part,key] of [[blade,'bladeMode'],[bit,'bitMode']] as const){if(build[key]&&!part?.modes?.some(m=>m.name===build[key]))errors.push(`${key} は未確認のモードです`);}
  return errors;
}
export function validateDeck(builds:Build[]):string[] {
  const identities=builds.map(build=>requiredBuildKeys(build).flatMap(key=>{
    const part=byId.get(build[key]??'');if(!part)return [];
    // Assembly is not an additional physical part beyond its CX components.
    if(key==='blade'&&Object.keys(part.components??{}).length)return [];
    return [{category:part.category,canonicalId:part.canonicalId??part.id}];
  }));
  return [...builds.flatMap(validateBuild),...validateThreeOnThreeParts(identities).errors];
}
export function ratingsFor(part:Part,spin:1|-1=1,mode?:string):Ratings|null {
  return part.modes?.find(m=>m.name===mode)?.ratings??part.ratingsVariants?.find(v=>v.condition===(spin===1?'right_spin':'left_spin'))?.ratings??part.ratings;
}
/** Explicit, uncalibrated GAME MODEL. Official ratings are not mass/friction/inertia measurements. */
export function profileFor(build:Build,color=0x335dff):Profile {
  const errors=validateBuild(build);if(errors.length)throw new Error(errors.join(' / '));
  const blade=byId.get(build.blade)!,bit=byId.get(build.bit)!,ratchet=byId.get(build.ratchet);const spin=blade.spin??1;
  const b=ratingsFor(blade,spin,build.bladeMode),t=ratingsFor(bit,spin,build.bitMode),r=ratchet?ratingsFor(ratchet,spin):null;
  const normalized=(value:number|null|undefined,fallback:number)=>Math.max(0,Math.min(1,(value??fallback)/100));
  const attack=normalized(b?.attack,33),stamina=normalized(b?.stamina,33),defense=normalized(r?.defense,12);
  const grip=.15+normalized(t?.attack,30)*.35;
  const mass=.035,radius=.024,inertia=(.50+normalized(b?.defense,33)*.12)*mass*radius*radius;
  const simple=Boolean(ratchet&&simpleRatchets.has(ratchet.canonicalId??''));
  const burst=simple?(bit.canonicalId==='DS'?20:30):(t?.burst_resistance??50);
  return {name:`${blade.name} ${ratchet?.name??''}${bit.canonicalId??bit.name}`,type:blade.type,spin,mass,radius,inertia,grip,
    drag:.025+(1-stamina)*.018+(1-normalized(t?.stamina,30))*.004,
    restitution:.43+attack*.27+defense*.06,burstThreshold:.012+normalized(burst,50)*.018,
    height:.024+normalized(r?.height??t?.height,60)*.005,gearRadius:.006,gearHeight:.007,railEligible:true,contactLobes:{attack:3,defense:6,stamina:12,balance:4}[blade.type],contactLobeDepth:{attack:.06,defense:.015,stamina:.003,balance:.025}[blade.type],railGrip:.45+normalized(t?.dash,25)*.55,color};
}
