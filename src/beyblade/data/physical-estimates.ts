import type { BeyType, Profile } from '../core/types';

/** Shape observations are factual; ALL dimensions/material constants below are unmeasured estimates.
 * No marketing rating enters this module. Sources describe form, not SI calibration.
 */
export const SHAPE_SOURCES = {
  ドランソード: 'https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx01.html',
  ヘルズサイズ: 'https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx02.html',
  ウィザードアロー: 'https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx03.html',
  ナイトシールド: 'https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx04.html',
};
const bladeForms: Record<string,{lobes:number;depth:number}> = {
  ドランソード: {lobes:3,depth:.15}, // Official: three uppercut blades; sweep/depth remain estimated.
  ヘルズサイズ: {lobes:4,depth:.10}, // Official: four smash blades.
  ウィザードアロー: {lobes:2,depth:.08}, // Official: two large circular blades.
  ナイトシールド: {lobes:6,depth:.06}, // Official: six defensive blades; damper is not yet solved.
};
export function shapeDescription(name:string,type:BeyType):string {
  const form=bladeForms[name];
  return form?`公式の刃数 ${form.lobes}枚を反映した近似形状 / 寸法・材質係数は未計測`:`${{attack:"攻撃",defense:"防御",stamina:"持久",balance:"バランス"}[type]}系の仮形状 / この部品の実形状は未計測`;
}
export function estimatedProfile(name:string,bladeName:string,type:BeyType,bitCode:string,spin:1|-1,color:number):Profile {
  const shape=bladeForms[bladeName]??{lobes:{attack:3,defense:6,stamina:2,balance:4}[type],depth:{attack:.13,defense:.05,stamina:.04,balance:.08}[type]};
  const tipShape: NonNullable<Profile['tipShape']> = /^(?:F|LF|GF|RF|UF|LR|R|A|Q)$/.test(bitCode)?'flat':/^(?:B|O|DB|FB|GB|OB|WB)$/.test(bitCode)?'ball':/^(?:N|HN|MN|SN|GN)$/.test(bitCode)?'needle':'taper';
  const tipRadius={flat:.0028,ball:.0015,needle:.00045,taper:.0015}[tipShape];
  const tipFriction={flat:.24,ball:.17,needle:.14,taper:.20}[tipShape];
  const mass=.035,radius=.024,centerOfMassHeight=.019;
  return {name,type,spin,color,mass,radius,inertia:.55*mass*radius*radius,
    transverseInertia:mass*(.25*radius*radius+.028**2/12),centerOfMassHeight,
    grip:tipFriction,tipFriction,tipRadius,tipShape,rollingDrag:.00001,
    drag:.018,restitution:.48,burstThreshold:.026,height:.028,
    gearRadius:.006,gearHeight:.007,railEligible:true,railGrip:.8,
    contactLobes:shape.lobes,contactLobeDepth:shape.depth,
    bladeRampAmplitude:bladeName==='ドランソード'?.0015:0,bladeSkew:bladeName==='ドランソード'?.25:0};
}
