import {buildForBlade,defaultBuild,isPlayablePart,modelMetadataFor,parts,profileFor,validateBuild} from './catalog';
import type {Build,Profile} from '../core/types';
/** Ignore display identity only. Equal signatures mean this model cannot mechanically distinguish these builds. */
export function mechanicalSignature(profile:Profile):string {
  const {name:_name,color:_color,modelPalette:_palette,...physical}=profile;
  return JSON.stringify(physical);
}
export function auditModels() {
  const rows=parts.map(part=>{
    let build:Build|undefined;
    if(part.category==='blade'&&isPlayablePart(part))build=buildForBlade(part.id);
    else if(part.category==='ratchet')build={...defaultBuild,ratchet:part.id};
    else if(part.category==='bit')build={...defaultBuild,bit:part.id,...(part.integratedBit?{ratchet:''}:{})};
    const errors=build?validateBuild(build):['構成部品単体は組立済ブレードを通じてのみ評価／発売未確認'];
    if(!build||errors.length)return {id:part.id,name:part.name,category:part.category,status:'not-individually-playable' as const,reasons:errors};
    const variants=(part.modes?.length?part.modes.map(mode=>({...build,[part.category==='bit'?'bitMode':'bladeMode']:mode.name})): [build]).map(b=>{
      const profile=profileFor(b),metadata=modelMetadataFor(b);
      return {build:b,signature:mechanicalSignature(profile),metadata,profile};
    });
    return {id:part.id,name:part.name,category:part.category,status:'modeled' as const,variants};
  });
  const groups=new Map<string,{id:string;name:string;mode?:string;fallback:boolean}[]>();
  for(const row of rows)if(row.status==='modeled')for(const v of row.variants){
    const group=groups.get(v.signature)??[];
    group.push({id:row.id,name:row.name,mode:v.build.bladeMode??v.build.bitMode,fallback:v.metadata.status==='partial-estimate'});groups.set(v.signature,group);
  }
  return {version:'rating-model-audit-v1',catalogRows:rows.length,modeledRows:rows.filter(r=>r.status==='modeled').length,
    uniqueMechanicalProfiles:groups.size,equivalentGroups:[...groups.values()].filter(g=>g.length>1).map(members=>({members,
      explanation:members.some(m=>m.fallback)?'同じ既知値または共通の暫定係数により現モデルでは機械的に区別できません。形状未確認を含み、実物の同等性を意味しません。':'同じ公式評価・同じ形状近似を共有するため現モデルでは同等。実物が同等という保証ではありません。'})),rows};
}
