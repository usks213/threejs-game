import {expect,it} from 'vitest';
import {deckPassengers,passengersClear,carryPassengers,skySupportHeight} from '../../src/game/skybound/platform';
import {collideSkyPlayer} from '../../src/game/skybound/character';
import {skyPartOverlapsCapsule} from '../../src/game/skybound/assembly-contacts';
import {increment,multiply} from '../../src/game/skybound/orientation';
import type {SkyPart,SkyContext} from '../../src/game/skybound/types';
import {WORLD} from '../../src/world/types';

/** Minimal geometry from a car built through legal production actions.
 * Original checkpoint SHA256: 390cb2bcd4a018428379b9aea6e04d3a0253c99aef8d1bb0dbe749740ab8918e.
 * The full acceptance trace gathers its supplies and walks onto this seat. */
function earnedPose(){
 const part:SkyPart={id:3,kind:'seat',material:'wood',mass:4,position:{x:22.271923315756194,y:25.901662445419454,z:-22.79429916954206},rotation:.23577509237589225,q:{x:-.0011497358708886928,y:.1176148606106737,z:.00036455367061950767,w:.9930585530428606},velocity:{x:0,y:0,z:0},links:[],epoch:6};
 const player={x:22.295193514897186,y:26.15164109655802,z:-22.81487395805212,vy:0,grounded:true};
 const context:SkyContext={tick:0,bounds:WORLD,player,inventory:{},actors:[{id:'walker',position:player}],solid:point=>point.y<25};
 return {part,player,context};
}
it('accepts the real slightly tilted supporting seat instead of freezing a powered car under a standing passenger',()=>{
 const {part,player,context}=earnedPose();
 // Legacy planar placement clips the rounded foot by less than a micrometre.
 expect(skyPartOverlapsCapsule(part,player)).toBe(true);
 const passengers=deckPassengers([part],context.actors,new Set());expect(passengers).toHaveLength(1);
 expect(passengersClear(passengers,[part],[part],context)).toBe(true);
 const moved={...part,position:{...part.position,z:part.position.z+.1}};
 expect(passengersClear(passengers,[moved],[part],context)).toBe(true);
 carryPassengers(passengers,[moved]);expect(player.z).toBeCloseTo(-22.71487395805212,9);
 expect(skyPartOverlapsCapsule(moved,player)).toBe(false);
});
it('places the upright capsule tangent to a walkable tilted face when landing',()=>{
 for(const angle of [.002,.2,.6]){
  const {part,player}=earnedPose();part.position={x:0,y:2,z:0};part.q=increment({x:0,y:0,z:1},angle);part.rotation=0;
  Object.assign(player,{x:0,y:skySupportHeight(part,{x:0,y:2,z:0})!-.03,z:0,vy:-1,grounded:false});
  collideSkyPlayer([part],player,player.y+.1);
  expect(player.grounded).toBe(true);expect(skyPartOverlapsCapsule(part,player)).toBe(false);
 }
});
it('recomputes capsule support after deck pitch changes while retaining neighboring-part and headroom vetoes',()=>{
 const {part,player,context}=earnedPose(),passengers=deckPassengers([part],context.actors,new Set());
 const moved={...part,position:{...part.position,z:part.position.z+.1},q:multiply(increment({x:1,y:0,z:0},.15),part.q!)};
 expect(passengersClear(passengers,[moved],[part],context)).toBe(true);carryPassengers(passengers,[moved]);
 expect(skyPartOverlapsCapsule(moved,player)).toBe(false);
 const blocked={...context,solid:(point:{y:number})=>point.y>player.y+1.1};expect(passengersClear(passengers,[moved],[part],blocked)).toBe(false);
 const neighbor:SkyPart={...part,id:4,kind:'block',position:{x:player.x,y:player.y+.6,z:player.z},q:{x:0,y:0,z:0,w:1}};
 expect(passengersClear(passengers,[moved],[part,neighbor],context)).toBe(false);
});
it('does not lift a deeply embedded body into a deck passenger or carry an upward jump',()=>{
 const {part,player,context}=earnedPose();player.y-=.3;expect(deckPassengers([part],context.actors,new Set())).toHaveLength(0);
 player.y+=.3;player.vy=2;expect(deckPassengers([part],context.actors,new Set())).toHaveLength(0);
});
