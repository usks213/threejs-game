import {expect,it} from 'vitest';
import {dungeonActionObserved} from '../e2e/helpers/dungeon-action-observed';
it('always requires a new server action acknowledgement for a living actor',()=>{
 expect(dungeonActionObserved(4,4,'alive')).toBe(false);expect(dungeonActionObserved(4,4,'alive',true)).toBe(false);expect(dungeonActionObserved(4,5,'alive')).toBe(true);
});
it('accepts the duel death race only at the explicitly marked call site',()=>{
 expect(dungeonActionObserved(4,4,'dead')).toBe(false);expect(dungeonActionObserved(4,4,'dead',true)).toBe(true);
 for(const status of ['lobby','extracted','disconnected'])expect(dungeonActionObserved(4,4,status,true)).toBe(false);
});
