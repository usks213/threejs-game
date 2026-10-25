import {describe,it,expect} from 'vitest';
import {controlledModelComparisons} from '../../../scripts/compare-beyblade-models';
describe('controlled one-component mechanical comparisons',()=>{
  it('changes actual spin-down, contact recoil and ordinary launch trajectories—not a winner/damage multiplier',()=>{
    const report=controlledModelComparisons();const baseline=report[0];
    for(const row of report.slice(1)){
      expect(row.isolatedSpin,label(row)).not.toEqual(baseline.isolatedSpin);
      expect(row.incomingImpact,label(row)).not.toEqual(baseline.incomingImpact);
      expect(row.ordinaryLaunch,label(row)).not.toEqual(baseline.ordinaryLaunch);
      expect(row.incomingImpact.impulse).toBeGreaterThan(0);
      expect(row.incomingImpact.energyChange).toBeLessThanOrEqual(1e-9);
      expect(row.isolatedSpin.retainedEnergy).toBeLessThanOrEqual(1.001);
    }
    // Equal delivered launch work gives a high-inertia outer-weight blade a lower initial RPM.
    expect(report[1].isolatedSpin.initialOmega).toBeLessThan(baseline.isolatedSpin.initialOmega);
  },30000);
});
const label=(row:{label:string})=>row.label;
