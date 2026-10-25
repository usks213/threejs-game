import {describe,it,expect} from 'vitest';
import {parts,defaultBuild,buildForBlade,profileFor,modelMetadataFor,ratingsFor,officialParts} from '../../../src/beyblade/data/catalog';
import {estimateAssembly} from '../../../src/beyblade/data/physical-estimates';
import {auditModels,mechanicalSignature} from '../../../src/beyblade/data/model-audit';
const part=(name:string,category='blade')=>parts.find(p=>p.canonicalId===name&&p.category===category)!;
const blade=(name:string)=>profileFor(buildForBlade(part(name).id));
const bit=(name:string)=>profileFor({...defaultBuild,bit:part(name,'bit').id});
const ratchet=(name:string)=>profileFor({...defaultBuild,ratchet:part(name,'ratchet').id});
describe('official-rating-constrained estimated mechanical model',()=>{
  it('uses one-part swaps without corrupting manufacturer data',()=>{
    const original=JSON.stringify(officialParts);
    expect(blade('ウィザードロッド').inertia).toBeGreaterThan(blade('ドランソード').inertia);
    expect(blade('ドランバスター').bladeStyle).toBe('single-sword');
    expect(blade('ドランソード').bladeStyle).toBe('sword');
    expect(bit('B').rollingDrag).toBeLessThan(bit('F').rollingDrag!);
    expect(bit('F').tipFriction).toBeGreaterThan(bit('N').tipFriction!);
    expect(ratchet('3-80').height).toBeGreaterThan(ratchet('3-60').height!);
    expect(ratchet('9-60').ratchetLobes).toBe(9);
    expect(ratchet('4-60').ratchetLobes).toBe(4);
    expect(JSON.stringify(officialParts)).toBe(original);
  });
  it('preserves raw score scale rather than discarding metal-coat improvements by normalization',()=>{
    const b=part('ドランソード'),r=part('3-60','ratchet'),t=part('F','bit');
    const base={blade:{part:b,ratings:{attack:60,defense:20,stamina:20}},ratchet:{part:r,ratings:r.ratings},bit:{part:t,ratings:t.ratings},spin:1 as const,color:0};
    const a=estimateAssembly(base),c=estimateAssembly({...base,blade:{...base.blade,ratings:{attack:66,defense:22,stamina:22}}});
    expect(a.profile.mass).not.toBe(c.profile.mass);expect(a.profile.inertia).not.toBe(c.profile.inertia);
    expect(c.metadata.components[0].officialRatings?.attack).toBe(66);
    expect(a.profile.restitution).toBe(c.profile.restitution);
  });
  it('keeps unknown scores missing and identifies unmodeled geometry',()=>{
    const unmodeled=parts.find(p=>p.category==='blade'&&p.canonicalId==='ドランブレイブS')!;
    const meta=modelMetadataFor(buildForBlade(unmodeled.id));expect(meta.components[0].shapeStatus).toBe('unmodeled');
    expect(meta.components[0].notes.join()).toContain('形状未再現');
    const b=part('ドランソード'),r=part('3-60','ratchet'),t=part('F','bit');
    const x=estimateAssembly({blade:{part:b,ratings:null},ratchet:{part:r,ratings:r.ratings},bit:{part:t,ratings:t.ratings},spin:1,color:0});
    expect(x.metadata.components[0].officialRatings).toBeNull();expect(x.metadata.missingInputs).toContain('blade.attack');expect(x.metadata.status).toBe('partial-estimate');
  });
  it('does not change a 2-60 ratchet material or shape when spin changes',()=>{
    const b=part('ドランソード'),r=part('2-60','ratchet'),t=part('F','bit');
    const model=(spin:1|-1)=>estimateAssembly({blade:{part:b,ratings:b.ratings},ratchet:{part:r,ratings:ratingsFor(r,spin)},bit:{part:t,ratings:t.ratings},spin,color:0});
    const a=model(1),c=model(-1);
    for(const key of ['mass','inertia','ratchetRadius','ratchetLobes','ratchetSkew','bladeHandedness'] as const)expect(a.profile[key]).toBe(c.profile[key]);
    expect(a.metadata.components[1].officialRatings?.attack).toBe(10);expect(c.metadata.components[1].officialRatings?.attack).toBe(16);
  });
  it('applies verified bit shapes, relative heights, gear count and unsupported-mechanism notices',()=>{
    expect(bit('C').tipShape).toBe('flat');expect(bit('D').tipShape).toBe('flat');expect(bit('R').gearTeeth).toBe(10);
    expect(bit('LF').bitHeightOffset).toBe(-.001);expect(bit('HN').bitHeightOffset).toBe(.001);expect(bit('UN').bitHeightOffset).toBe(-.002);
    expect(bit('A').gearRadius).toBeGreaterThan(bit('F').gearRadius);
    expect(bit('GF').gearEngagementBand).toBeGreaterThan(bit('F').gearEngagementBand!);
    expect(bit('DB').bitDiscRadius).toBeGreaterThan(0);
    expect(modelMetadataFor({...defaultBuild,bit:part('FB','bit').id}).unsupportedMechanisms.join()).toContain('独立');
  });
  it('honors simple-joint 30 and DS 20 contextual official resistance',()=>{
    const model=(b:string,r:string)=>profileFor({...defaultBuild,ratchet:part(r,'ratchet').id,bit:part(b,'bit').id});
    for(const r of ['4-55','M-85','9-65','7-55']){
      const f=model('F',r),n=model('N',r),ds=model('DS',r);
      expect(f.lockStiffness).toBe(n.lockStiffness);expect(ds.lockStiffness).toBeLessThan(f.lockStiffness!);
      expect(modelMetadataFor({...defaultBuild,ratchet:part(r,'ratchet').id}).components[1].notes.join()).toContain('30');
    }
  });
  it('audits every catalog row and openly reports mechanically indistinguishable groups',()=>{
    const audit=auditModels();expect(audit.catalogRows).toBe(parts.length);expect(audit.modeledRows).toBeGreaterThan(150);
    expect(audit.uniqueMechanicalProfiles).toBeGreaterThan(100);
    for(const row of audit.rows)if(row.status==='modeled')for(const v of row.variants){
      for(const x of Object.values(v.profile))if(typeof x==='number')expect(Number.isFinite(x),row.name).toBe(true);
      expect(v.profile.mass).toBeGreaterThan(.02);expect(v.profile.inertia).toBeGreaterThan(0);
      expect(v.signature).toBe(mechanicalSignature(v.profile));
      for(const derived of v.metadata.derived)expect(['estimated','official-relative']).toContain(derived.provenance);
    }
    for(const group of audit.equivalentGroups)expect(group.explanation).toContain('実物');
  });
});
