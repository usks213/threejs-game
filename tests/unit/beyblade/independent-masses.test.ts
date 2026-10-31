import {describe,it,expect} from 'vitest';
import {parts,defaultBuild,buildForBlade,profileFor,modelMetadataFor,officialParts} from '../../../src/beyblade/data/catalog';
import {independentMassFor,independentMassReferences} from '../../../src/beyblade/data/independent-masses';
import {estimateAssembly} from '../../../src/beyblade/data/physical-estimates';
import {positiveDefinite,combineMassComponents} from '../../../src/beyblade/core/inertia';
const part=(id:string)=>parts.find(p=>p.id===id)!;
describe('independent measured-sample-informed mass estimates',()=>{
  it('matches exactly thirteen identified references, preserving raw observations and unknown sample counts',()=>{
    expect(parts.filter(p=>independentMassFor(p))).toHaveLength(13);
    for(const r of independentMassReferences){const p=part(r.partId),m=independentMassFor(p)!;expect(m).not.toBeNull();expect(m.adoptedGrams).toBe(r.adopt);expect(r.readings).toContain(m.adoptedGrams);expect(m.observedRangeGrams).toEqual([Math.min(...r.readings),Math.max(...r.readings)]);expect(m.sampleCount).toBe(r.photo?1:null);expect(m.reportedReadingCount).toBe(r.readings.length);expect(m.matchedVariant).toContain(r.product);expect(m.uncertaintyNote).toContain('誤差帯');}
    const sword=independentMassFor(part('blade:e383f65c06a2'))!;
    expect(sword.adoptedGrams).toBe(34.77);expect(sword.adoptedGrams).not.toBe((34.77+35.12)/2);
  });
  it('never matches a different coating, V2, unknown ID, category or integrated structure by name',()=>{
    const b=part('blade:ad2b5f965feb');
    for(const candidate of [{...b,id:'other'},{...b,name:b.name+' V2'},{...b,name:b.name+' メタルコート:ホワイト'},{...b,integratedRatchet:true},{...b,integratedBit:true},{...b,category:'bit' as const}])expect(independentMassFor(candidate)).toBeNull();
    expect(independentMassFor(part('blade:8ee8d8c3477d'))?.adoptedGrams).toBe(36.6);
    expect(independentMassFor(b)?.adoptedGrams).toBe(36.5);
    for(const id of ['bit:B','bit:N','ratchet:3-80'])expect(independentMassFor(part(id))).toBeNull();
    expect(independentMassFor(part('blade:a347771f4214'))?.uncertaintyNote).toContain('0.42g');
  });
  it('shares the reviewed nominal Buster contour without merging sample masses or official scores',()=>{
    const build=(blade:string)=>({...defaultBuild,blade,ratchet:'ratchet:1-60',bit:'bit:A'});
    const a=profileFor(build('blade:ad2b5f965feb')),b=profileFor(build('blade:8ee8d8c3477d'));
    for(const key of ['radius','contactLobes','contactLobeDepth','bladeStyle','bladeEdgeSharpness','bladeThickness','bladeRampAmplitude','bladeSkew'] as const)expect(a[key],key).toBe(b[key]);
    expect(a.componentMasses!.blade).toBe(.0365);expect(b.componentMasses!.blade).toBe(.0366);expect(a.modelPalette!.metal).not.toBe(b.modelPalette!.metal);
    expect(modelMetadataFor(build('blade:ad2b5f965feb')).components[0].officialRatings!.attack).toBe(70);
    expect(modelMetadataFor(build('blade:8ee8d8c3477d')).components[0].officialRatings!.attack).toBe(75);
  });
  it('uses the selected component masses in the shared full COM/tensor without touching official ratings',()=>{
    const original=JSON.stringify(officialParts);
    for(const [blade,ratchet,bit,total] of [
      ['blade:e383f65c06a2','ratchet:3-60','bit:F',43.32],
      ['blade:a347771f4214','ratchet:4-60','bit:T',41.69],
      ['blade:ad2b5f965feb','ratchet:1-60','bit:A',45.14],
      ['blade:cd31341f19d7','ratchet:5-70','bit:DB',45.33],
    ] as const){
      const build={...defaultBuild,blade,ratchet,bit},p=profileFor(build),meta=modelMetadataFor(build);
      expect(p.mass*1000).toBeCloseTo(total,10);expect(meta.massCalibration).toHaveLength(3);
      const combined=combineMassComponents(p.massComponents!);expect(combined.mass).toBeCloseTo(p.mass,14);expect(combined.center).toEqual(p.centerOfMass);expect(combined.inertia).toEqual(p.inertiaTensor);expect(positiveDefinite(p.inertiaTensor!)).toBe(true);
      for(const key of ['com','inertia','tensor-xx','tensor-xy','rim-mass'])expect(meta.derived.find(d=>d.key===key)?.provenance).toBe('estimated');
      expect(JSON.stringify(p)).not.toContain('https:');
    }
    expect(JSON.stringify(officialParts)).toBe(original);
  });
  it('retains rating-driven shape/distribution/tip changes but does not re-fit an adopted specimen mass',()=>{
    const b=part('blade:e383f65c06a2'),r=part('ratchet:3-60'),t=part('bit:F');
    const input={blade:{part:b,ratings:{attack:60,defense:20,stamina:20}},ratchet:{part:r,ratings:r.ratings},bit:{part:t,ratings:t.ratings},spin:1 as const,color:0};
    const a=estimateAssembly(input),c=estimateAssembly({...input,blade:{part:b,ratings:{attack:60,defense:20,stamina:80}},bit:{part:t,ratings:{...t.ratings!,dash:90,stamina:60}}});
    expect(a.profile.mass).toBe(c.profile.mass);expect(a.profile.radius).not.toBe(c.profile.radius);expect(a.profile.inertiaTensor!.yy).not.toBe(c.profile.inertiaTensor!.yy);expect(a.profile.rollingDrag).not.toBe(c.profile.rollingDrag);
    expect(a.metadata.derived.find(d=>d.key==='density-ratio')!.value).not.toBe(c.metadata.derived.find(d=>d.key==='density-ratio')!.value);
    const fallback=profileFor(buildForBlade(parts.find(p=>p.canonicalId==='ナイトシールド')!.id));expect(positiveDefinite(fallback.inertiaTensor!)).toBe(true);
  });
});
