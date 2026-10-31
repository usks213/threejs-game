import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parts,buildForBlade,modelMetadataFor,profileFor,validateBuild,officialParts} from '../../../src/beyblade/data/catalog';
import {auditModels} from '../../../src/beyblade/data/model-audit';
import {getBladeOutline,createBattle} from '../../../src/beyblade/core/physics';
const find=(name:string)=>parts.find(p=>p.name===name)!;
const model=(name:string)=>profileFor(buildForBlade(find(name).id));
const metadata=(name:string)=>modelMetadataFor(buildForBlade(find(name).id));
describe('source-grounded expansion with implemented-contour guard',()=>{
  it('does not clear unsupported shape warnings merely because source facts exist',()=>{
    for(const row of auditModels().rows)if(row.status==='modeled')for(const v of row.variants){
      expect(()=>createBattle([v.profile,v.profile],[{power:.8,angle:0,tilt:.1},{power:.8,angle:0,tilt:.1}]),row.name).not.toThrow();
      if(row.category!=='blade')continue;
      if(v.metadata.components[0].shapeStatus==='source-informed')expect(v.profile.bladeStyle,row.name).not.toBe('generic');
      if(v.profile.bladeStyle==='generic')expect(v.metadata.components[0].shapeStatus,row.name).toBe('unmodeled');
    }
    expect(metadata('ヴェノム').components[0].shapeStatus).toBe('unmodeled');
    expect(metadata('バレットグリフォン').unsupportedMechanisms.join()).toContain('分離');
  });
  it('implements verified counts and circle-only Ghost instead of a fictitious three-blade contour',()=>{
    for(const [name,count] of [['ヴァイパーテイル',6],['スフィンクスカウル',9],['プテラスイング',6],['ティラノロア',3],['シャークギル',2],['レオンクレスト',7]] as const){
      expect(model(name).contactLobes).toBe(count);expect(metadata(name).components[0].shapeStatus).toBe('source-informed');
    }
    const ghost=model('ゴーストサークル'),radii=getBladeOutline(ghost).map(p=>Math.hypot(p.x,p.z));
    expect(Math.max(...radii)-Math.min(...radii)).toBeLessThan(1e-12);
    expect(metadata('クロックミラージュ').unsupportedMechanisms.join()).toContain('60枚');
    expect(model('クロックミラージュ').contactLobeDepth).toBe(0);
  });
  it('keeps elastomer, spring, shifting mass and transformation mechanisms explicitly partial',()=>{
    for(const [name,text] of [['インパクトドレイク','ラバー'],['ナイトメイル','3球'],['サムライセイバー','開閉'],['マミーカース','形状変化'],['スコーピオスピア（6枚刃ディフェンス）','6→3']] as const){
      const m=metadata(name);expect(m.status).toBe('partial-estimate');expect(m.unsupportedMechanisms.join()).toContain(text);
    }
    expect(model('スコーピオスピア（6枚刃ディフェンス）').contactLobes).toBe(6);
    expect(model('スコーピオスピア（3枚刃アタック）').contactLobes).toBe(3);
    expect(model('スコーピオスピア メタルコート:マゼンタ（6枚刃ディフェンス）').contactLobes).toBe(6);
    expect(model('スコーピオスピア メタルコート:マゼンタ（3枚刃アタック）').contactLobes).toBe(3);
  });
  it('preserves stable IDs while correcting physical part family independently from containing product',()=>{
    const cases=[['プテラスイング','blade:f8be3a0d5ad9','BX'],['ティラノロア','blade:9c33dccb7a7e','BX'],['シャークギル','assembled_blade:59aabefd87eb','BX'],['ヘルズブレイブJ','blade:ab5fa0bf8688','CX']] as const;
    const publicRows=JSON.parse(readFileSync('public/beyblade-data/parts.json','utf8'));
    const csv=readFileSync('public/beyblade-data/parts.csv','utf8');
    for(const [name,id,family] of cases){const p=find(name);expect(p.id).toBe(id);expect(p.family).toBe(family);expect(publicRows.find((r:{id:string})=>r.id===id).family).toBe(family);expect(csv.split('\n').find(row=>row.startsWith(id+','))).toContain(','+family+',');}
    const hells=find('ヘルズブレイブJ'),build=buildForBlade(hells.id);expect(validateBuild(build)).toEqual([]);
    expect(build.lock_chip).toBe('lock_chip:f2c579e3397f');expect(build.main_blade).toBe('main_blade:b1411ef24ae3');expect(build.assist_blade).toBe('assist_blade:6da43b944e49');
    expect(hells.ratings?.attack).toBe(60);expect(parts.find(p=>p.id===build.main_blade)?.ratings?.attack).toBeNull();
    expect(officialParts.find(p=>p.id===hells.id)?.product_family).toBe('UX');
  });
  it('does not fabricate removable ratchets when an integrated structure bursts',()=>{
    expect(model('バレットグリフォン').burstSeparationSupported).toBe(false);
    expect(metadata('バレットグリフォン').unsupportedMechanisms.join()).toContain('一体型の実際の分離構造は未再現');
    const bit=parts.find(p=>p.integratedBit&&p.release==='released')!,base=buildForBlade(find('ドランソード').id),build={...base,bit:bit.id,ratchet:''};
    expect(profileFor(build).burstSeparationSupported).toBe(false);expect(modelMetadataFor(build).unsupportedMechanisms.join()).toContain('一体型の実際の分離構造は未再現');
    expect(model('ドランソード').burstSeparationSupported).toBe(true);
    expect(model('ヘルズブレイブJ').burstSeparationSupported).toBe(true);
  });
  it('supplies decomposed estimated mass/inertia contributions without double-counting',()=>{
    const p=model('ドランソード');expect(p.componentMasses!.blade+p.componentMasses!.ratchet+p.componentMasses!.bit).toBeCloseTo(p.mass,14);
    expect(p.componentAxialWeights!.blade+p.componentAxialWeights!.ratchet+p.componentAxialWeights!.bit).toBeCloseTo(p.inertia,14);
  });
});
