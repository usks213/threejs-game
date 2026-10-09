import { describe, expect, it } from 'vitest';
import { createActor } from '../../src/dungeon/simulation';
import { dungeonBlade } from '../../src/dungeon/view';
import { meleeDefinition } from '../../src/prototype/core/motion';

describe('ravager recovery pose prediction', () => {
  it('interpolates eligible recovery at its authoritative rate, using the same pose as the next server time', () => {
    const actor = createActor('a', 'A', 'ravager'); actor.status = 'alive'; actor.phase = 'recover'; actor.kind = 'overhead'; actor.time = .2; actor.ravagerTraining = { skill: null, perk: 'followthrough' };
    expect(dungeonBlade(actor, 0, 0, .08)).toEqual(dungeonBlade({ ...actor, time: .3 }, 0, 0));
    expect(dungeonBlade(actor, 0, 0, 5)).toEqual(dungeonBlade({ ...actor, time: .325 }, 0, 0));
    const duration = meleeDefinition('overhead', 'greatsword').recover;
    expect(dungeonBlade({ ...actor, time: duration - .02 }, 0, 0, .1)).toEqual(dungeonBlade({ ...actor, time: duration }, 0, 0));
  });
  it('preserves untrained, other-class and windup/strike prediction exactly', () => {
    const actor = createActor('a', 'A', 'ravager'); actor.status = 'alive'; actor.phase = 'recover'; actor.kind = 'overhead'; actor.time = .2;
    for (const patch of [{}, { classId: 'bastion' }, { phase: 'windup' }, { phase: 'strike' }, { kind: 'slash' }, { weapon: 'sword' }]) {
      const candidate = { ...actor, ravagerTraining: { skill: null, perk: 'followthrough' }, ...patch } as typeof actor;
      if (!Object.keys(patch).length) delete candidate.ravagerTraining;
      expect(dungeonBlade(candidate, 0, 0, .08)).toEqual(dungeonBlade({ ...candidate, time: .28 }, 0, 0));
    }
  });
});
