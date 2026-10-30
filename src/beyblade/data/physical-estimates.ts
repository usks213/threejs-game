import {independentMassFor,type MassCalibration} from './independent-masses';
import {deriveAssemblyMass,principalInertias} from './assembly-mass';
import type { BeyType, Part, Profile, Ratings } from '../core/types';
import { expandedBladeShapeFacts } from './expanded-shape-facts';
import { bladeShapeFacts, bitShapeFacts, ratchetShapeFacts } from './shape-facts';

export const MODEL_VERSION='independent-mass-informed-geometry-v6';
export interface ModelComponentInput { part:Part; ratings:Ratings|null; mode?:string }
export interface AssemblyModelInput { blade:ModelComponentInput;ratchet:ModelComponentInput|null;bit:ModelComponentInput;spin:1|-1;color:number }
export interface ModelMetadata {
  version:string;status:'source-informed-estimate'|'partial-estimate';label:string;
  components:{category:'blade'|'ratchet'|'bit';name:string;source:string;shapeStatus:'source-informed'|'unmodeled';officialRatings:Ratings|null;notes:string[]}[];
  missingInputs:string[];unsupportedMechanisms:string[];massCalibration?:MassCalibration[];
  derived:{key:string;label:string;value:number;unit:string;provenance:'estimated'|'official-relative'|'measurement-informed';inputs:string[]}[];
}
const clamp=(x:number,min:number,max:number)=>Math.min(max,Math.max(min,x));
/** Blend two 0xRRGGBB colours; used to give each assembly a tinted resin ratchet instead of one shared grey. */
const mixHex=(a:number,b:number,t:number)=>{const channel=(shift:number)=>Math.round(((a>>shift&255)*(1-t)+(b>>shift&255)*t));return channel(16)<<16|channel(8)<<8|channel(0);};
const clean=(name:string)=>name.replace(/\s*(?:ダブル)?メタルコート(?:[:：].*)?$/,'').replace(/[（）()]/g,'').trim();
interface BladeShapeFact {
  name_ja:string;row_ids?:readonly string[];source_url:string;source_image_url?:string|null;
  facts:{contact_count:number|null;spin:number|null;summary_ja:string};
  estimated_geometry?:{lobeDepthRatio?:number|null;radiusScale?:number|null;outerInertiaFactor?:number|null;massScale?:number|null;rakeSign?:number|string|null;primaryAttackPoints?:number;heightAdjustment?:number};
  image_observation?:{contour_ja:string;palette_ja:string};
  implemented_geometry?:{style:string;contactLobes:number;countBasis:string;smoothCircle?:boolean;palette:{metal:number;core:number}};
  mechanism_limits?:readonly string[];
}
const allBladeFacts:readonly BladeShapeFact[]=[...bladeShapeFacts,...expandedBladeShapeFacts];
const factFor=(name:string,id?:string)=>allBladeFacts.find(f=>id&&f.row_ids?.includes(id))??allBladeFacts.find(f=>clean(f.name_ja)===clean(name));
export const SHAPE_SOURCES=Object.fromEntries(allBladeFacts.map(f=>[clean(f.name_ja),f.source_url]));
export function shapeDescription(name:string,type:BeyType):string {
  const f=factFor(name);return f&&implementedStyle(f)!=='generic'?`${f.facts.summary_ja} 形状・寸法は出典に基づく近似です。`:`形状未再現・暫定モデル（${{attack:'攻撃',defense:'防御',stamina:'持久',balance:'バランス'}[type]}系）`;
}
const styles:Record<string,NonNullable<Profile['bladeStyle']>>={
  ドランソード:'sword',ヘルズサイズ:'scythe',ウィザードアロー:'round-wing',ナイトシールド:'shield',ドランバスター:'single-sword',
  ウィザードロッド:'round-wing',フェニックスウイング:'broad-wing',コバルトドラグーン:'uppercut',ホエールウェーブ:'smash',
  'ライトニングエルドラゴ アッパー型':'uppercut','ライトニングエルドラゴ 連打型':'smash',ドランダガー:'sword',シャークエッジ:'uppercut',シルバーウルフ:'round-wing',
};
// A researched source row alone is never enough to clear the unmodeled warning.
const supportedStyles=new Set<string>(['sword','scythe','round-wing','shield','single-sword','broad-wing','uppercut','smash']);
function implementedStyle(f:BladeShapeFact|undefined):NonNullable<Profile['bladeStyle']>{
  const value=f?.implemented_geometry?.style??(f?styles[clean(f.name_ja)]:undefined);
  return value&&supportedStyles.has(value)?value as NonNullable<Profile['bladeStyle']>:'generic';
}
const palettes:Record<string,{metal:number;core:number}>={
  ドランソード:{metal:0xb4bfcd,core:0x218fc9},ヘルズサイズ:{metal:0xb7bdc8,core:0xc52e46},ウィザードアロー:{metal:0xb4bbc8,core:0xf2c72d},
  ナイトシールド:{metal:0xb0bac4,core:0x1c7257},ドランバスター:{metal:0xb7c1ce,core:0x24a7d8},ウィザードロッド:{metal:0xb9c0cc,core:0xf4c82b},
  フェニックスウイング:{metal:0xc82e3e,core:0xf3c536},コバルトドラグーン:{metal:0xaebacd,core:0x255dbf},ホエールウェーブ:{metal:0xb5c0cd,core:0x35b1b2},
  ドランダガー:{metal:0xb6c2d0,core:0x31b2dc},シャークエッジ:{metal:0xb6becb,core:0x8b48bd},シルバーウルフ:{metal:0xbfc8d2,core:0x303744},
  'ライトニングエルドラゴ アッパー型':{metal:0xb8c3d0,core:0xbd3344},'ライトニングエルドラゴ 連打型':{metal:0xb8c3d0,core:0xbd3344},
};
const namedColors:Record<string,number>={ブラック:0x30343d,ブルー:0x2e73cf,レッド:0xca3c4a,ホワイト:0xe7eaf0,ゴールド:0xd2aa48,パープル:0x8650b2,グリーン:0x329174};
const nominalBitColors:Record<string,number>={F:0x228dce,T:0xc7384b,B:0xe5b927,N:0x287e59};
const baseTipRadius={flat:.0028,ball:.0015,needle:.00045,taper:.0015};
const baseTipFriction={flat:.24,ball:.17,needle:.14,taper:.20};
const ratingKeys=['attack','defense','stamina'] as const;

/** Explicit estimated model: published scores constrain properties, but are not SI measurements.
 * Fixed material restitution is not boosted by attack scores. Null inputs remain visible as missing.
 */
export function estimateAssembly(input:AssemblyModelInput):{profile:Profile;metadata:ModelMetadata} {
  const {blade,ratchet,bit,spin,color}=input,name=clean(blade.part.canonicalId??blade.part.name),code=bit.part.canonicalId??bit.part.name;
  const form=factFor(blade.part.name,blade.part.id)??factFor(name),bladeStyle=implementedStyle(form),shapeImplemented=bladeStyle!=='generic',bitFact=bitShapeFacts.find(f=>f.code===code),missingInputs:string[]=[],unsupportedMechanisms:string[]=[...(form?.mechanism_limits??[])];
  const score=(c:ModelComponentInput|null,key:keyof Ratings,fallback:number,label:string)=>{
    const value=c?.ratings?.[key];if(value==null){missingInputs.push(`${label}.${key}`);return fallback/100;}return clamp(value/100,0,1.5);
  };
  const bladeMeasured=independentMassFor(blade.part),ratchetMeasured=ratchet?independentMassFor(ratchet.part):null,bitMeasured=independentMassFor(bit.part);
  const massCalibration=[bladeMeasured,ratchetMeasured,bitMeasured].filter((m):m is MassCalibration=>m!==null);
  const ba=score(blade,'attack',33,'blade'),bd=score(blade,'defense',33,'blade'),bs=score(blade,'stamina',34,'blade');
  const ta=score(bit,'attack',25,'bit'),td=score(bit,'defense',25,'bit'),ts=score(bit,'stamina',25,'bit'),dash=score(bit,'dash',25,'bit');
  // The same 2-60 ratchet cannot change mass when the blade spin changes. Use only unconditional
  // or identical-across-conditions values for its invariant geometry; the pair's asymmetry maps to FIXED skew.
  let invariantRatchet=ratchet;
  if(ratchet?.part.ratingsVariants?.length){
    const ratings={...ratchet.part.ratings} as Ratings;
    for(const key of ratingKeys){const values=ratchet.part.ratingsVariants.map(v=>v.ratings[key]);if(ratings[key]==null&&values[0]!=null&&values.every(v=>v===values[0]))ratings[key]=values[0];}
    invariantRatchet={...ratchet,ratings};
  }
  const integrated=!ratchet;
  const burstSeparationSupported=!blade.part.integratedRatchet&&!bit.part.integratedBit;
  if(!burstSeparationSupported)unsupportedMechanisms.push('一体型の実際の分離構造は未再現');
  const ra=integrated ? .11 : score(invariantRatchet,'attack',11,'ratchet'),rd=integrated ? .13 : score(invariantRatchet,'defense',13,'ratchet'),rs=integrated ? .06 : score(invariantRatchet,'stamina',6,'ratchet');
  const publishedHeight=ratchet?.ratings?.height??(bit.part.integratedBit?bit.ratings?.height:null);
  if(publishedHeight==null)missingInputs.push('ratchet.height');
  const heightIndex=publishedHeight??60;
  // Relative low/mid/high code mapping is estimated; 60 is NOT declared to be 6 mm.
  const ratchetHeightOffset=clamp((heightIndex-60)*.00008,-.0012,.0024);
  const bitHeightOffset=({LF:-.001,HN:.001,LR:-.001,LO:-.001,UN:-.002} as Record<string,number>)[code]??0;
  let tipShape:NonNullable<Profile['tipShape']>='taper';
  const contact=bitFact?.contact_shape??'';
  if(/flat/.test(contact)||/^(F|LF|R|LR|A|C|LC|GF|RF|UF|Q|RA|FF|L|J|V|GR|I)$/.test(code))tipShape='flat';
  else if(/ball|hemisphere/.test(contact)||/^(B|O|DB|FB|GB|WB|LO|Y|Nr)$/.test(code))tipShape='ball';
  else if(/needle/.test(contact)||/^(N|HN|MN|S|D|BS|DS|GN|UN|W|WW)$/.test(code))tipShape='needle';
  if(['P','GP','TP','U','GU'].includes(code))unsupportedMechanisms.push(`${code}: 中央突起と外周接触の切替は単一先端形状による近似`);
  if(['FB','FF','Nr'].includes(code))unsupportedMechanisms.push(`${code}: 独立したビット／軸受の回転自由度は未再現`);
  if(['E','Z','G','Tr','Op','H','K','TK','TP','BS'].includes(code))unsupportedMechanisms.push(`${code}: 変形・ガイド・弾性機構の実動作は未再現`);
  if(name==='ナイトシールド')unsupportedMechanisms.push('ナイトシールド: ダンパーの独立した弾性運動は未再現');
  if(name==='シルバーウルフ')unsupportedMechanisms.push('シルバーウルフ: フリー回転リングは未再現');
  if(blade.mode||bit.mode)unsupportedMechanisms.push('モードの開始時評価は適用。回転中の自動変形遷移は未再現');
  const geometry=shapeImplemented?form?.estimated_geometry:undefined;
  // Exact reviewed pair only: official UX-01 / BXG-18 images depict the same nominal outline,
  // with metal coating stated for Barcelona. Tooling revision/coating thickness are not measured.
  // Marketing-score uplift must not invent a larger or sharper mold. Other variants are not inferred.
  const sharedBusterOutline=['blade:ad2b5f965feb','blade:8ee8d8c3477d'].includes(blade.part.id);
  const ga=sharedBusterOutline?.70:ba,gd=sharedBusterOutline?.20:bd,gs=sharedBusterOutline?.10:bs;
  const contactLobes=(shapeImplemented?form?.implemented_geometry?.contactLobes??form?.facts.contact_count:null)??geometry?.primaryAttackPoints??({attack:3,defense:6,stamina:2,balance:4}[blade.part.type]);
  const contactLobeDepth=form?.implemented_geometry?.smoothCircle&&shapeImplemented?0:clamp((geometry?.lobeDepthRatio??.10)+.10*(ga-.33)-.035*(gd-.33),.025,.30);
  const outerRadius=.0265*(geometry?.radiusScale??1)*clamp(.97+.04*ga+.04*gs,.96,1.08);
  const radius=outerRadius/(1+contactLobeDepth);
  const bladeMass=bladeMeasured?bladeMeasured.adoptedGrams/1000:clamp((.026+.004*(bd-.35)+.002*(ba-.30)+.0015*(bs-.35))*(geometry?.massScale??1),.023,.035);
  const ratchetMass=ratchetMeasured?ratchetMeasured.adoptedGrams/1000:.0053+.003*(rd-.13)+.0015*(rs-.06);
  const bitDiscRadius=['DB','DS'].includes(code)?.010:0;
  const bitMass=bitMeasured?bitMeasured.adoptedGrams/1000:.0022+.0015*(td-.20)+.001*(ts-.20)+(bitDiscRadius?.0018:0)+(code==='MN'?.0007:0);
  const mass=bladeMass+ratchetMass+bitMass;
  const outerFraction=clamp((geometry?.outerInertiaFactor??.64)+.15*(bs-.35)-.06*(ba-.30)+.025*(bd-.35),.48,.88);
  const ratchetCode=ratchet?.part.canonicalId??'',lobesMatch=ratchetCode.match(/^(\d+)-/);
  const ratchetLobes=lobesMatch?Number(lobesMatch[1]):4;
  const ratchetKnown=Boolean(ratchet&&ratchetShapeFacts.some(f=>f.count===ratchetLobes));
  const ratchetRadius=clamp(.0153+.004*(ra-.11)-.002*(rd-.13)+(ratchetLobes===5?.001:ratchetLobes===8?.0013:0),.014,.019);
  const ratchetLobeDepth=ratchetLobes===0?0:clamp(.035+.45*ra-.16*rd,.025,.15);
  const left=ratchet?.part.ratingsVariants?.find(v=>v.condition==='left_spin')?.ratings;
  const right=ratchet?.part.ratingsVariants?.find(v=>v.condition==='right_spin')?.ratings;
  const ratchetSkew=left?.attack!=null&&right?.attack!=null?clamp((left.attack-right.attack)/100,-.15,.15):.08;
  const height=.028+ratchetHeightOffset+(geometry?.heightAdjustment??0),ratchetCenterHeight=.012+ratchetHeightOffset*.5;
  const centerOfMassHeight=(bladeMass*(.023+ratchetHeightOffset)+ratchetMass*ratchetCenterHeight+bitMass*.005)/mass;
  const componentMasses={blade:bladeMass,ratchet:ratchetMass,bit:bitMass};
  const componentAxialWeights={blade:bladeMass*outerRadius**2*outerFraction,ratchet:ratchetMass*ratchetRadius**2*.55,bit:bitMass*(bitDiscRadius||.006)**2*.5};
  const inertia=componentAxialWeights.blade+componentAxialWeights.ratchet+componentAxialWeights.bit;
  const transverseInertia=mass*(.25*radius**2+height**2/12);
  const tipRadius=baseTipRadius[tipShape]*clamp(.85+.50*ta-.10*ts,.7,1.3)*(code==='O'||code==='LO'?.70:code==='FB'?.65:1);
  const directionalTraction=(code==='C'||code==='LC')&&spin===-1?1.18:1;
  const tipFriction=clamp((baseTipFriction[tipShape]+.14*(ta-.35)-.05*(td-.20))*directionalTraction*(code==='MN'?.75:code==='RA'?2.2:1),.07,.6);
  const gearTeeth=['R','LR','W'].includes(code)?10:12;
  const gearRadius=.006*(gearTeeth/12)*(code==='A'?1.18:1)*clamp(.975+.1*dash,.97,1.04);
  const gearEngagementBand=/^G[FBNP]$/.test(code)?.0065:.0045;
  const rollingDrag=.000004+.000028*(1-clamp(ts,0,1));
  // Spin-loss rate lowered 2026-10-31 toward measured solo-spin durations
  // (real combinations spin ~60-170 s solo); still an estimate from ratings.
  const drag=.007+.006*(1-clamp(bs,0,1))+.004*(1-clamp(ts,0,1));
  const simpleJoint=['4-55','M-85','9-65','7-55'].includes(ratchetCode);
  const publishedBurst=score(bit,'burst_resistance',50,'bit')*100;
  const effectiveBurst=code==='DS'?20:simpleJoint?30:publishedBurst;
  // Burst barrier raised 2026-10-31 (energy scales as k * angle^2, ~1.4x,
  // combined with the detent work partition in applyRatchetWork): previously
  // a single first contact could accumulate enough ratchet work to release
  // (bursts at 0.5-0.9 s in the trajectory report), while real bursts build
  // over repeated strong hits.
  const lockStiffness=.0065+.022*effectiveBurst/100+.006*rd,lockReleaseAngle=.24+.085*effectiveBurst/100+.055*rd;
  const palette={...(form?.implemented_geometry?.palette??palettes[name]??{metal:0xaeb9c8,core:0x667488})};
  const coat=blade.part.name.match(/メタルコート[:：]([^\s]+)/)?.[1];if(coat&&namedColors[coat])palette.metal=namedColors[coat];
  const profile:Profile={name:`${blade.part.name} ${ratchet?.part.name??''}${code}`,type:blade.part.type,spin,color,mass,burstSeparationSupported,componentMasses,componentAxialWeights,radius,inertia,transverseInertia,centerOfMassHeight,height,
    grip:tipFriction,tipFriction,tipRadius,tipShape,rollingDrag,drag,restitution:.38,burstThreshold:.026,
    lockStiffness,lockReleaseAngle,gearRadius,gearHeight:.007,railEligible:true,railGrip:clamp(.55+.65*dash,.55,.94),gearTeeth,gearEngagementBand,bitHeightOffset,bitDiscRadius,bitDiscHeight:.005,bladeHandedness:form?.facts.spin===-1?-1:form?.facts.spin===1?1:spin,
    ratchetRadius,ratchetCenterHeight,ratchetHalfThickness:.0025+ratchetHeightOffset*.10,ratchetLobes,ratchetLobeDepth,ratchetSkew,
    contactLobes,contactLobeDepth,bladeStyle,bladeEdgeSharpness:clamp(.3+.6*ga-.2*gd,.15,.85),bladeThickness:.0085+(geometry?.massScale??1)*.0005+.001*(gd-.35),
    bladeRampAmplitude:typeof geometry?.rakeSign==='number'?geometry.rakeSign*(.0011+.0012*ga):0,
    bladeSkew:bladeStyle==='round-wing'?.06:bladeStyle==='single-sword'?.35:.15+.20*ga,
    modelPalette:{...palette,ratchet:mixHex(palette.core,0xdde6ee,.45),bit:nominalBitColors[code]??palette.core}};
  const distribution=deriveAssemblyMass(profile,componentMasses,outerFraction);
  profile.centerOfMass=distribution.center;profile.inertiaTensor=distribution.inertia;profile.massComponents=distribution.components;
  profile.inertia=distribution.inertia.yy;profile.transverseInertia=(distribution.inertia.xx+distribution.inertia.zz)/2;
  // Compatibility scalar is nominal-before-bit-offset; authoritative centerOfMass already includes it once.
  profile.centerOfMassHeight=distribution.center.y-bitHeightOffset;
  profile.componentAxialWeights=Object.fromEntries(distribution.components.map(c=>[c.component,c.inertia.yy+c.mass*((c.center.x-distribution.center.x)**2+(c.center.z-distribution.center.z)**2)])) as typeof componentAxialWeights;
  const components:ModelMetadata['components']=[
    {category:'blade',name:blade.part.name,source:form?.source_url??blade.part.source,shapeStatus:shapeImplemented?'source-informed':'unmodeled',officialRatings:blade.ratings,notes:[shapeImplemented?form!.facts.summary_ja:'形状未再現・暫定モデル。出典の存在だけでは形状実装と扱いません。',...(form?.image_observation?[`画像観察: ${form.image_observation.contour_ja}`]:[]),...(form?.implemented_geometry?[`接触区画 ${contactLobes}: ${form.implemented_geometry.countBasis==='official_text'?'公式明記の刃数を概形へ反映':'画像観察・推定の主区画数（公式刃数と区別）'}`]:[]),'公式評価→外径・接触深さ・質量配分・慣性への換算は未校正の推定です。','配色は代表製品の近似。個別カラーの厳密な再現ではありません。']},
    {category:'ratchet',name:ratchet?.part.name??'一体型',source:ratchet?.part.source??blade.part.source,shapeStatus:ratchetKnown?'source-informed':'unmodeled',officialRatings:ratchet?.ratings??null,notes:[ratchetKnown?`${ratchetLobes}枚の突出と高さ区分を近似。`:'一体型・未確認構造は暫定の保持部形状です。','高さ評価のSI換算は推定。数値60を6mmと断定しません。',...(ratchet?.part.ratingsVariants?.length?['左右別評価は同じ実物の質量を変えません。評価差から固定した輪郭の非対称性を推定します。']:[]),...(simpleJoint?[`シンプルジョイント条件を適用: 実効耐性 ${effectiveBurst}（ビット単体の公式値は保持）。`]:[])]},
    {category:'bit',name:bit.part.name,source:bitFact?.source_url??bit.part.source,shapeStatus:bitFact?'source-informed':'unmodeled',officialRatings:bit.ratings,notes:[bitFact?.facts_ja??'形状未再現・暫定モデル。公表評価を用いた先端分類です。','攻撃/防御/持久→接触半径・摩擦・損失、ダッシュ→ギア径と結合、耐性→ロック障壁を推定。',gearTeeth===10?'10枚歯は公式記述。歯ピッチ・ギア半径と平均噛合拘束は推定。':'12枚歯は未確認部品にも用いる共通近似。実物の歯数・歯ピッチの確認ではありません。',...(bitHeightOffset?[`軸高の相対差 ${bitHeightOffset*1000} mm は公式記述。絶対寸法は未計測。`]:[])]},
  ];
  const partial=components.some(c=>c.shapeStatus==='unmodeled')||missingInputs.length>0||unsupportedMechanisms.length>0;
  const derived:ModelMetadata['derived']=[
    {key:'mass',label:'組立質量（各部の合計）',value:mass*1000,unit:'g',provenance:massCalibration.length?'measurement-informed':'estimated',inputs:[`${massCalibration.length}/3部品に独立秤量の代表値を採用。残りは評価に拘束された推定。`,'完成した同一個体の実測値ではなく部品値の加算']},
    {key:'inertia',label:'自転慣性',value:profile.inertia,unit:'kg·m²',provenance:'estimated',inputs:['共有形状の体積積分','推定リム/コア密度','各部質量','完全な平行軸定理']},
    {key:'radius',label:'外接半径',value:outerRadius*1000,unit:'mm',provenance:'estimated',inputs:['公式形状記述','ブレード攻撃・持久']},
    {key:'com',label:'重心高さ',value:distribution.center.y*1000,unit:'mm',provenance:'estimated',inputs:['ラチェット高さ','各部質量配分','ビット軸高差']},
    {key:'tipFriction',label:'先端摩擦係数',value:tipFriction,unit:'μ',provenance:'estimated',inputs:['先端形状','ビット攻撃・防御','回転方向別の溝']},
    {key:'drag',label:'自転損失率',value:drag,unit:'s⁻¹',provenance:'estimated',inputs:['ブレード・ビット持久評価']},
    {key:'gearRadius',label:'ギアピッチ半径',value:gearRadius*1000,unit:'mm',provenance:'estimated',inputs:['ギア形状・歯数','ビットダッシュ評価']},
    {key:'lockBarrier',label:'ロック解放障壁',value:.5*lockStiffness*lockReleaseAngle**2,unit:'J',provenance:'estimated',inputs:['ビット耐性','ラチェット防御','シンプルジョイント条件']},
  ];
  for(const axis of ['x','y','z'] as const)derived.push({key:`com-${axis}`,label:`全体重心 ${axis.toUpperCase()}`,value:distribution.center[axis]*1000,unit:'mm',provenance:'estimated',inputs:['先端基準座標','形状の体積積分','各部の推定質量']});
  derived.push({key:'lateral-com',label:'軸からの横重心距離',value:Math.hypot(distribution.center.x,distribution.center.z)*1000,unit:'mm',provenance:'estimated',inputs:['横非対称形状の体積積分（人工オフセットなし）']});
  for(const key of ['xx','yy','zz','xy','xz','yz'] as const)derived.push({key:`tensor-${key}`,label:`慣性テンソル I${key}`,value:distribution.inertia[key],unit:'kg·m²',provenance:'estimated',inputs:['各部の重心テンソル','完全な平行軸定理']});
  principalInertias(distribution.inertia).forEach((value,i)=>derived.push({key:`principal-${i}`,label:`主慣性 ${i+1}`,value,unit:'kg·m²',provenance:'estimated',inputs:['推定テンソルの固有値']}));
  for(const c of distribution.components){derived.push({key:`component-${c.component}-mass`,label:`${c.component} 質量`,value:c.mass*1000,unit:'g',provenance:massCalibration.some(m=>m.component===c.component)?'measurement-informed':'estimated',inputs:[massCalibration.some(m=>m.component===c.component)?'独立した公開秤量から選択した代表値（公式仕様ではない）':'公式評価に拘束された推定質量']});for(const axis of ['x','y','z'] as const)derived.push({key:`component-${c.component}-${axis}`,label:`${c.component} 重心 ${axis}`,value:c.center[axis]*1000,unit:'mm',provenance:'estimated',inputs:['共有形状の体積積分']});}
  const zones=distribution.materialZones;
  for(const [key,label,value,unit] of [['rim-mass','金属リムの推定質量',zones.rimMass*1000,'g'],['core-hub-mass','樹脂コア/ハブの推定質量',zones.coreHubMass*1000,'g'],['rim-density','リムの推定有効密度',zones.rimDensity,'kg/m³'],['core-density','コアの推定有効密度',zones.coreDensity,'kg/m³'],['density-ratio','リム/コアの推定密度比',zones.densityRatio,'倍']] as const)derived.push({key,label,value,unit,provenance:'estimated',inputs:['外周配分制約→密度比4〜8','共有形状の体積','部品質量へ正規化（実測密度ではない）']});
  for(const c of distribution.components)derived.push({key:`component-${c.component}-iyy`,label:`${c.component} 自転慣性`,value:c.inertia.yy,unit:'kg·m²',provenance:'estimated',inputs:['部品自身の重心まわりの体積積分']});
  components[0].notes.push(...distribution.densityNotes);
  if(sharedBusterOutline)components[0].notes.push('標準版とFCバルセロナ版の公式図・塗装説明から同じ基準輪郭を共有。評価加算による輪郭拡大なし。金型番号・塗膜厚・微細改版は未確認。質量と推定密度配分は別に扱う。');
  for(const component of components)if(massCalibration.some(m=>m.component===component.category))component.notes.push('質量だけに独立した公開秤量を参照。形状・密度配分・重心・慣性は引き続き推定。');
  if(bitHeightOffset)derived.push({key:'bitHeightOffset',label:'軸高の相対差',value:bitHeightOffset*1000,unit:'mm',provenance:'official-relative',inputs:[`${code} の公式相対寸法`]});
  return {profile,metadata:{version:MODEL_VERSION,status:partial?'partial-estimate':'source-informed-estimate',label:partial?'一部未再現・暫定モデルを含む推定':'公式評価・形状情報に拘束された未校正モデル',components,massCalibration,missingInputs:[...new Set(missingInputs)],unsupportedMechanisms,derived}};
}
