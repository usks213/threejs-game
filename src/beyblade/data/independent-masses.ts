import type {Part} from '../core/types';
/** Independent small-sample observations, NOT manufacturer specifications or measured COM/inertia. */
export interface MassCalibration {
  component:'blade'|'ratchet'|'bit';partId:string;name:string;adoptedGrams:number;
  observedRangeGrams:[number,number];sampleCount:number|null;reportedReadingCount:number;
  sourceUrl:string;method:string;uncertaintyNote:string;matchedVariant:string;basis:'measured-independent';
}
interface Reference {partId:string;component:MassCalibration['component'];exactName:string;product:string;readings:number[];adopt:number;otherReports?:string;photo?:boolean}
const database='https://beybase.com/beyblade-part-weights-database/';
const scalePhoto='https://okuyama3093.com/dragonbuster-barcelona-review/';
/** Deliberately bounded to product-matched base assemblies and the separately identified coating.
 * Do not match by canonical blade family: coatings, V2 and integrated structures are different records.
 * Values are selected reported readings, never averages of unknown specimens or pooled batches.
 */
export const independentMassReferences:readonly Reference[]=[
  {partId:'blade:e383f65c06a2',component:'blade',exactName:'ドランソード',product:'BX-01 標準版',readings:[34.77,35.12],adopt:34.77,otherReports:'競技玩具研究所のBX-01 D23は34.7g。製造個体・反復数の対応は不明で平均しない。'},
  {partId:'ratchet:3-60',component:'ratchet',exactName:'3-60',product:'BX-01由来3-60',readings:[6.33,6.32],adopt:6.33},
  {partId:'bit:F',component:'bit',exactName:'F',product:'BX-01由来F',readings:[2.22,2.26],adopt:2.22},
  {partId:'blade:a347771f4214',component:'blade',exactName:'ヘルズサイズ',product:'BX-02 標準版',readings:[33.12],adopt:33.12,otherReports:'競技玩具研究所のBX-02 D23は32.7g（自己申告誤差約±0.2〜0.3g）。0.42gの資料差は未解決で平均しない。'},
  {partId:'ratchet:4-60',component:'ratchet',exactName:'4-60',product:'BX-02由来4-60',readings:[6.35],adopt:6.35},
  {partId:'bit:T',component:'bit',exactName:'T',product:'BX-02由来T',readings:[2.22],adopt:2.22},
  {partId:'blade:ad2b5f965feb',component:'blade',exactName:'ドランバスター',product:'UX-01 標準版（塗装版とは別）',readings:[36.5],adopt:36.5,otherReports:'競技玩具研究所のUX-01 L23も36.5g。共通の校正保証や同一標本の証明ではない。'},
  {partId:'ratchet:1-60',component:'ratchet',exactName:'1-60',product:'UX-01由来1-60',readings:[6.03],adopt:6.03},
  {partId:'bit:A',component:'bit',exactName:'A',product:'UX-01由来A',readings:[2.61],adopt:2.61},
  {partId:'blade:cd31341f19d7',component:'blade',exactName:'ウィザードロッド',product:'UX-03 標準版',readings:[35.4],adopt:35.4,otherReports:'競技玩具研究所のUX-03 L23も35.4g。共通の校正保証や同一標本の証明ではない。'},
  {partId:'ratchet:5-70',component:'ratchet',exactName:'5-70',product:'UX-03由来5-70',readings:[6.74],adopt:6.74},
  {partId:'bit:DB',component:'bit',exactName:'DB',product:'UX-03由来DB（統合カタログ行に複数製品の出典あり）',readings:[3.19],adopt:3.19},
  {partId:'blade:8ee8d8c3477d',component:'blade',exactName:'ドランバスター メタルコート:ブルー FCバルセロナVer.',product:'メタルコート:ブルー FCバルセロナVer. 単独写真標本',readings:[36.6],adopt:36.6,photo:true},
];
export function independentMassFor(part:Part):MassCalibration|null {
  if(part.integratedRatchet||part.integratedBit)return null;
  const row=independentMassReferences.find(r=>r.partId===part.id&&r.component===part.category&&(r.component==='blade'?r.exactName===part.name:r.exactName===part.canonicalId));
  if(!row)return null;
  return{component:row.component,partId:row.partId,name:part.name,adoptedGrams:row.adopt,observedRangeGrams:[Math.min(...row.readings),Math.max(...row.readings)],sampleCount:row.photo?1:null,reportedReadingCount:row.readings.length,
    sourceUrl:row.photo?scalePhoto:database,
    method:row.photo?'2025-03-02記事の秤写真を研究担当が目視確認。TANITA表示36.6g、0.1g表示。':'測定者が開封した部品をポケットスケールで秤量した公開表。個別秤量日・反復数は不明。',
    uncertaintyNote:(row.photo?'単一写真標本。秤の校正・真贋・隠れた荷重・反復誤差は未検証。':'校正・標本数・反復数・個体対応は不明。小数2桁は精度保証ではない。')+' 掲載範囲は観測値の最小/最大であり、誤差帯や母集団範囲ではない。'+(row.otherReports??''),
    matchedVariant:row.product+'の報告値をモデルの代表値として選択。他色・金型・摩耗個体への実測保証ではない。',basis:'measured-independent'};
}
