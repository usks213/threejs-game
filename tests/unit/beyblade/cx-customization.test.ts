import {describe,it,expect} from 'vitest';
import {parts,buildForBlade,selectableParts,validateBuild,profileFor,isPlayablePart,compareKana} from '../../../src/beyblade/data/catalog';

// User requests 2026-10-31: assist/over blades must be changeable, and
// bey/part lists must be sorted in Japanese kana (あいうえお) order.
describe('CX assist/over customization and kana ordering',()=>{
  const cxBlade=parts.find(p=>p.category==='blade'&&p.components?.assist_blade&&p.components?.over_blade&&isPlayablePart(p))!;

  it('offers every playable assist and over blade for a CX build, in kana order',()=>{
    const build=buildForBlade(cxBlade.id);
    const assists=selectableParts('assist_blade',build),overs=selectableParts('over_blade',build);
    expect(assists.length).toBe(parts.filter(p=>p.category==='assist_blade'&&isPlayablePart(p)).length);
    expect(overs.length).toBe(parts.filter(p=>p.category==='over_blade'&&isPlayablePart(p)).length);
    expect(assists.length).toBeGreaterThan(1);expect(overs.length).toBeGreaterThan(1);
    const names=selectableParts('blade',build).map(p=>p.canonicalId??p.name);
    const sorted=[...names].sort(compareKana);
    expect(names).toEqual(sorted);
  });

  it('accepts a swapped assist/over combination and keeps other CX slots verified',()=>{
    const build=buildForBlade(cxBlade.id);
    const altAssist=selectableParts('assist_blade',build).find(p=>p.id!==build.assist_blade)!;
    const altOver=selectableParts('over_blade',build).find(p=>p.id!==build.over_blade)!;
    const swapped={...build,assist_blade:altAssist.id,over_blade:altOver.id};
    expect(validateBuild(swapped)).toEqual([]);
    // Non-swappable CX components remain locked to the verified assembly.
    if(build.main_blade)expect(selectableParts('main_blade',build).map(p=>p.id)).toEqual([build.main_blade]);
  });

  it('changes the estimated profile when assist/over are swapped, never for the stock assembly',()=>{
    const build=buildForBlade(cxBlade.id);
    const stock=profileFor(build);
    expect(profileFor({...build})).toEqual(stock);
    // Find a swap whose design-intent trait differs from the verified parts.
    const swappedProfile=selectableParts('assist_blade',build)
      .filter(p=>p.id!==build.assist_blade)
      .map(p=>profileFor({...build,assist_blade:p.id}))
      .find(p=>JSON.stringify(p)!==JSON.stringify(stock));
    expect(swappedProfile).toBeDefined();
  });
});
