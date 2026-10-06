import { GUIDES } from './adventure-trials';
import { SITES } from './adventure-sites';

export const PRACTICE_DUMMY_ID = 857001;
/** These people share the interaction kind, not the travelling merchant's booth. */
export function storyPerson(id: number): 'guide' | 'practice' | undefined {
 if (id === PRACTICE_DUMMY_ID) return 'practice';
 if (GUIDES.some(person => person.id === id) || SITES.some(site => site.npc === id)) return 'guide';
 return undefined;
}
/** Render and camera use the same booth pieces; empty space remains empty. */
export const MERCHANT_STALL = [
 {color:'#a58a5d',x:0,y:.65,z:1.2,sx:2,sy:.15,sz:.8},
 {color:'#76553d',x:-1.6,y:.5,z:-.6,sx:.8,sy:1,sz:.7},
 {color:'#c7b483',x:1.8,y:.6,z:-.8,sx:1.2,sy:1.2,sz:1.3},
 {color:'#8a6c4d',x:-2,y:1.4,z:0,sx:.1,sy:2.8,sz:.1},
 {color:'#8a6c4d',x:2,y:1.4,z:0,sx:.1,sy:2.8,sz:.1},
 {color:'#b99e69',x:0,y:2.75,z:0,sx:4.3,sy:.15,sz:3},
] as const;
