import {describe,it,expect} from 'vitest';
import {separatesContact} from '../../src/prototype/core/contact-separation';
const p=(x:number,z=0)=>({x,y:0,z}),body=p(0);
describe('existing body contact escape',()=>{
 it('allows outward and tangential separation, including coincident centers',()=>{expect(separatesContact(p(.2),p(.21),body)).toBe(true);expect(separatesContact(p(.2),p(.2,.1),body)).toBe(true);expect(separatesContact(p(0),p(.01),body)).toBe(true);});
 it('rejects deeper entry, crossing through the center, no movement and non-finite input',()=>{expect(separatesContact(p(.2),p(.19),body)).toBe(false);expect(separatesContact(p(.2),p(-.8),body)).toBe(false);expect(separatesContact(p(.2),p(.2),body)).toBe(false);expect(separatesContact(p(.2),p(NaN),body)).toBe(false);});
});
