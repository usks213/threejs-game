import {beforeAll,describe,it,expect} from 'vitest';
import {modelComparisonCases,compareModelCase} from '../../../scripts/compare-beyblade-models';
// Same fixtures/assertions as the former aggregate test, but one bounded test per swap.
// This avoids a cumulative30s timeout during concurrent core/browser audits without hiding slow cases.
describe('controlled one-component mechanical comparisons',()=>{
  const cases=modelComparisonCases();let baseline:ReturnType<typeof compareModelCase>;
  beforeAll(()=>{baseline=compareModelCase(cases[0]);},15000);
  it.each(cases.slice(1))('$label changes actual spin-down, recoil and orbit, not a winner multiplier',entry=>{
    const row=compareModelCase(entry);
    expect(row.isolatedSpin).not.toEqual(baseline.isolatedSpin);
    expect(row.incomingImpact).not.toEqual(baseline.incomingImpact);
    expect(row.ordinaryLaunch).not.toEqual(baseline.ordinaryLaunch);
    expect(row.incomingImpact.impulse).toBeGreaterThan(0);
    expect(row.incomingImpact.energyChange).toBeLessThanOrEqual(1e-9);
    expect(row.isolatedSpin.retainedEnergy).toBeLessThanOrEqual(1.001);
    if(entry.label==='blade-only: ウィザードロッド')expect(row.isolatedSpin.initialOmega).toBeLessThan(baseline.isolatedSpin.initialOmega);
  },15000);
});
