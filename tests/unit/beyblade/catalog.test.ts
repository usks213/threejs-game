import {describe,it,expect} from 'vitest';
import {parts,officialParts,officialProducts,defaultBuild,buildForBlade,requiredBuildKeys,selectableParts,validateBuild,validateDeck,ratingsFor,profileFor,isPlayablePart} from '../../../src/beyblade/data/catalog';
import type {Part} from '../../../src/beyblade/core/types';
const find=(name:string,category='blade')=>parts.find(p=>p.canonicalId===name&&p.category===category)!;
describe('source-backed parts catalog and safe assemblies',()=>{
  it('preserves every source row without replacing unknown physical constants',()=>{
    expect(parts.length).toBe(officialParts.length);expect(parts.length).toBeGreaterThan(250);
    expect(new Set(parts.map(p=>p.id)).size).toBe(parts.length);
    expect(officialParts.every(p=>p.physical_parameters===null)).toBe(true);
    expect(officialProducts.length).toBeGreaterThan(150);
    expect(officialProducts.some(p=>p.date_status==='upcoming')).toBe(true);
    for(const p of parts)expect(p.source).toMatch(/^https:\/\/(?:beyblade|www)\.takaratomy\.co\.jp\//);
  });
  it('archives unresolved CX assemblies without creating invented component presets',()=>{
    const unresolved=parts.find(p=>p.name==='ドランブレイブS メタルコート:ブラック')!;
    expect(unresolved).toBeDefined();expect(isPlayablePart(unresolved)).toBe(false);
    expect(selectableParts('blade',defaultBuild).some(p=>p.id===unresolved.id)).toBe(false);
    expect(validateBuild(buildForBlade(unresolved.id)).length).toBeGreaterThan(0);
  });
  it('has a valid default and every released blade has a valid supported preset',()=>{
    expect(validateBuild(defaultBuild)).toEqual([]);
    for(const p of parts.filter(p=>p.category==='blade'&&isPlayablePart(p)))expect(validateBuild(buildForBlade(p.id)),p.name).toEqual([]);
  });
  it('keeps published CX assembly values separate from unknown component values',()=>{
    const blade=find('ドランブレイブS');expect(blade.ratings?.attack).toBe(60);
    const build=buildForBlade(blade.id);expect(requiredBuildKeys(build)).toContain('main_blade');
    expect(parts.find(p=>p.id===build.main_blade)?.ratings?.attack).toBeNull();
    const other=parts.find(p=>p.category==='main_blade'&&p.id!==build.main_blade)!;
    expect(validateBuild({...build,main_blade:other.id}).join(' ')).toContain('確認済み');
    expect(selectableParts('main_blade',build).map(p=>p.id)).toEqual([build.main_blade]);
  });
  it('supports 2026 four-piece CX without demanding a main blade',()=>{
    const blade=find('バハムートブリッツBK');const build=buildForBlade(blade.id);
    expect(build.metal_blade).toBeTruthy();expect(build.over_blade).toBeTruthy();expect(build.main_blade).toBeUndefined();
    expect(validateBuild(build)).toEqual([]);
  });
  it('rejects extra ratchets and incompatible integrated constructions',()=>{
    const blade=find('バレットグリフォン');const build=buildForBlade(blade.id);
    expect(build.ratchet).toBe('');expect(requiredBuildKeys(build)).not.toContain('ratchet');
    expect(validateBuild({...build,ratchet:defaultBuild.ratchet}).length).toBeGreaterThan(0);
    const bit=parts.find(p=>p.integratedBit)!;
    expect(validateBuild({...build,bit:bit.id}).length).toBeGreaterThan(0);
    expect(selectableParts('bit',build).some(p=>p.integratedBit)).toBe(false);
  });
  it('requires a simple ratchet for ClockMirage and forbids integrated bits there',()=>{
    const build=buildForBlade(find('クロックミラージュ').id);
    expect(validateBuild(build)).toEqual([]);
    expect(validateBuild({...build,ratchet:defaultBuild.ratchet}).join(' ')).toContain('シンプル');
  });
  it('selects 2-60 published rating variant by spin rather than silently averaging',()=>{
    const ratchet=find('2-60','ratchet');expect(ratchet.ratings?.attack).toBeNull();
    expect(ratingsFor(ratchet,-1)?.attack).toBe(16);expect(ratingsFor(ratchet,1)?.attack).toBe(10);
  });
  it('supports verified left spin and distinguishes estimates from official data',()=>{
    const build=buildForBlade(find('メテオドラグーン').id);const p=profileFor(build);
    expect(p.spin).toBe(-1);expect(p.mass).toBe(.035);expect(p.gearRadius).toBe(.006);
    const left=find('メテオドラグーン');expect(left.spinVerification).toBe('official');
    expect(officialParts.find(r=>r.id===left.id)?.physical_parameters).toBeNull();
  });
  it('rejects invalid and unknown-release parts and duplicate-color decks',()=>{
    expect(validateBuild({...defaultBuild,bit:'not-a-part'}).length).toBeGreaterThan(0);
    const unknown=parts.find(p=>p.category==='blade'&&p.release!=='released');if(unknown)expect(validateBuild(buildForBlade(unknown.id)).length).toBeGreaterThan(0);
    expect(validateDeck([defaultBuild,defaultBuild,defaultBuild]).length).toBeGreaterThan(0);
    const a=find('コバルトドラグーン');const b=parts.find(p=>p.canonicalId===a.canonicalId&&p.id!==a.id)!;expect(a.canonicalId).toBe(b.canonicalId);
  });
  it('limits model parameters to finite values for all playable presets',()=>{
    for(const p of parts.filter(p=>p.category==='blade'&&isPlayablePart(p))){
      const model=profileFor(buildForBlade(p.id));
      for(const value of Object.values(model))if(typeof value==='number')expect(Number.isFinite(value),p.name).toBe(true);
      expect(model.inertia).toBeGreaterThan(0);expect(model.burstThreshold).toBeGreaterThan(0);
    }
  });
  it('changes modeled ratchet, bit and blade behavior without mutating official ratings',()=>{
    const original=JSON.stringify(officialParts);const a=profileFor(defaultBuild);
    const alternate={...defaultBuild,bit:find('F','bit').id};const b=profileFor(alternate);
    expect(a.grip).not.toBe(b.grip);expect(a.railGrip).not.toBe(b.railGrip);expect(JSON.stringify(officialParts)).toBe(original);
  });
});
