import {expect} from 'vitest';
import {NormalPlayer,playFirstChapter} from './normal-campaign-player';
/** Starts at original spawn and finishes at the home hearth, with rootfen unlocked. */
export function playFirstTwoRegions(d:NormalPlayer){
 const s=d.sim;playFirstChapter(d);
  // Physical western path from the ridge avoids the crypt and the forest shelter.
  for(const [x,z] of [[-8,-28.5],[-10,-20],[-10,7],[-16,7],[-20,7],[-23,7]])d.walk(x,z);
  d.interact('rg-field-herb',{x:-25,y:.8,z:8});
  d.walk(-23,5.5);d.fight(s.enemies.findIndex(e=>e.regional===101));
  d.walk(-24,4);d.interact('rg-field-cache',{x:-25,y:.55,z:3});
  expect(s.campaign.state.items['field-seal']).toBe(1);expect(s.campaign.state.items['sun-herb']).toBe(3);d.checkpoint('first regional seal');
  for(const [x,z] of [[-23,7],[-20,7],[-16,7],[-10,7],[-10,5.3],[-3.5,5.3]])d.walk(x,z);
  d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.regionUnlocked('resinwood')).toBe(true);expect(s.campaign.state.items['sun-herb']).toBe(1);
  // Follow the open southern edge around the berry beds and physical animal yard.
  for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,-9],[-16,-9],[-22,-9],[-26,-9],[-27,-6],[-30,-6]])d.walk(x,z);
  d.fight(s.enemies.findIndex(e=>e.regional===102));d.walk(-30,-9);
  d.interact('rg-wood-cache',{x:-30,y:.55,z:-11});expect(s.campaign.state.items['wood-seal']).toBe(1);d.checkpoint('second regional seal');
  for(const [x,z] of [[-30,-6],[-27,-6],[-26,-9],[-22,-9],[-16,-9],[-10,-9],[-10,5.3],[-3.5,5.3]])d.walk(x,z);
  d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.regionUnlocked('rootfen')).toBe(true);expect(s.campaign.state.items['amber-resin']).toBe(1);
}
