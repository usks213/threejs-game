import {validateProgression} from '../game/progression-state';
import {validateGear} from '../game/equipment/items';
import {cargoMass} from '../game/skybound/camp';
import {MATERIAL_MASS,PART_COST} from '../game/skybound/types';
import {validateRace} from '../game/trail-race';
import {validateExploration} from '../game/adventure-exploration';
import {validateSiteWorld} from '../game/site-state';
import type { SessionAuthority } from '../simulation/session';
import type { AdventureSave, BuildingState, EnemyState, ResourceNode } from '../game/types';
import type { MeadowState } from '../game/meadows/state';
import type { SkyPart } from '../game/skybound/types';
import { validateSave } from './format';
import type { WorldSave } from './format';
function pick<T extends object,K extends keyof T>(source:T,keys:readonly K[]):Pick<T,K>{const result={} as Pick<T,K>;for(const key of keys)if(source[key]!==undefined)result[key]=structuredClone(source[key]);return result;}
const nodeKeys:readonly (keyof ResourceNode)[]=['gearItems','id','kind','amount','ready','drop','velocity','removed','growth','swimming','health','spawnTimer','harvested','log','x','y','z'];
const enemyKeys:readonly (keyof EnemyState)[]=['rewardPending','bossParts','homeY','id','definition','tier','health','cooldown','windup','slow','boss','homeX','homeZ','respawnAt','stars','tame','fed','baby','heading','breeding','attackKind','attackReady','attackYaw','attackFlash','alerted','stagger','burn','x','y','z'];
const buildingKeys:readonly (keyof BuildingState)[]=['gearItems','site','creator','shared','id','definition','rotation','support','contents','removed','salvage','health','fuel','open','progress','cooking','label','x','y','z'];
const adventureKeys:readonly (keyof AdventureSave)[]=['progression','gearItems','graveGear','gearFlights','race','exploration','siteWorld','siteJournal','trialWorld','trialJournal','downed','seconds','health','stamina','mana','inventory','equipment','unlocked','defeated','resources','enemies','buildings','death','food','rested','spawn','poison','chill','grave','waterSeeds','meadows'];
const meadowKeys:readonly (keyof MeadowState)[]=['slotLimit','version','resting','smoke','raidCenter','raidSpawn','raidKind','contentVersion','corpseRun','fishing','worldTiles','pendingWaterTiles','slots','pins','exerting','mapCells','kills','noSkillDrain','riding','graves','sprinting','sneaking','foods','gear','durability','quality','skills','discovered','power','powerCooldown','offered','wet','shelter','warmth','cold','comfort','weight','raid','raidAt','tutorial'];
const partKeys:readonly (keyof SkyPart)[]=['cargoMass','wrecked','loan','q','angularVelocity','sleeping','id','kind','material','position','velocity','rotation','mass','links','epoch','energy','enabled','integrity','burning','wet','frozen','element','creator','shared','trial','anchored','carried','recalled','heated'];
const vector=<T extends {x:number;y:number;z:number}>(p:T)=>({x:p.x,y:p.y,z:p.z});
/** Whitelist the typed game schema, rather than stripping item names by secret-looking substrings. */
function personalAdventure(source:AdventureSave,playerId:string):AdventureSave {
 const save=pick(source,adventureKeys) as AdventureSave;if(source.race)save.race=validateRace(source.race);
 save.resources=source.resources.map(node=>{const n=pick(node,nodeKeys) as ResourceNode;if(n.gearItems)n.gearItems=validateGear(n.gearItems,{[n.kind]:n.amount});if(n.velocity)n.velocity=vector(n.velocity);if(n.growth)n.growth=pick(n.growth,['kind','remaining']);if(n.swimming)n.swimming=pick(n.swimming,['homeX','homeZ','heading']);if(n.log)n.log={...pick(n.log,['length','fall','heading','hits','wood']),a:{...pick(n.log.a,['id','radius','sleeping','kind']),position:vector(n.log.a.position),velocity:vector(n.log.a.velocity)},b:{...pick(n.log.b,['id','radius','sleeping','kind']),position:vector(n.log.b.position),velocity:vector(n.log.b.velocity)}};return n;});
 save.enemies=source.enemies.map(e=>pick(e,enemyKeys) as EnemyState);
 save.buildings=source.buildings.map(b=>{const building=pick(b,buildingKeys) as BuildingState;if(building.creator&&building.creator!==playerId&&!building.shared){building.contents={};building.cooking=[];delete building.gearItems;}if(building.gearItems)building.gearItems=validateGear(building.gearItems,building.contents);if(building.cooking)building.cooking=building.cooking.map(c=>pick(c,['id','time']));return building;});
 if(save.death)save.death=vector(save.death);if(save.spawn)save.spawn=vector(save.spawn);
 if(save.progression)save.progression=validateProgression(save.progression);
 if(save.exploration)save.exploration=validateExploration(save.exploration);
 if(save.siteWorld)save.siteWorld=validateSiteWorld(save.siteWorld);
 if(save.trialWorld)save.trialWorld=pick(save.trialWorld,['version','completed','epochs','evidence']);
 if(source.meadows){const m=pick(source.meadows,meadowKeys) as MeadowState;m.foods=m.foods.map(food=>pick(food,['id','remaining']));if(m.fishing)m.fishing=pick(m.fishing,['fish','phase','time','progress','strain','reeling']);if(m.pins)m.pins=m.pins.map(pin=>pick(pin,['id','x','y','z','label']));if(m.graves)m.graves=m.graves.map(grave=>({...vector(grave),items:{...grave.items},...(grave.gearItems?{gearItems:validateGear(grave.gearItems,grave.items)}:{})}));if(m.raidCenter)m.raidCenter=pick(m.raidCenter,['x','z']);if(m.pendingWaterTiles)m.pendingWaterTiles=m.pendingWaterTiles.map(tile=>pick(tile,['x','z','column']));if(m.slots)m.slots=m.slots.map(slot=>slot?pick(slot,['id','count']):null);save.meadows=m;}
 return save;
}
/** Shared world plus this participant only. It contains no session credentials, receipts or other members. */
export function participantSave(authority:SessionAuthority,playerId:string,options:{portable?:boolean}={}):WorldSave {
 const actor=authority.actors.get(playerId);if(!actor)throw new Error('参加中の冒険者を選んでください');
 const world=authority.sim.save(),owner=options.portable?'host':playerId,skybound=world.skybound;
 const exported:WorldSave={version:2,nextEntityId:world.nextEntityId,sharedPins:world.sharedPins?.map(p=>({...p,position:vector(p.position),owner:options.portable?(p.owner===playerId?'host':p.owner==='host'?'remote-host':p.owner):p.owner})),generator:world.generator,seed:world.seed,player:{...vector(actor.player),...(actor.player.crouching?{crouching:true}:{})},adventure:personalAdventure(actor.adventure.save(),playerId),edits:world.edits.map(e=>({...pick(e,['id','kind','radius','material','tick','shape','surface','undo']),position:vector(e.position)})),fluids:world.fluids.map(cell=>({...vector(cell),...pick(cell,['size','volume','vx','vz'])})),bodies:world.bodies.map(body=>({...pick(body,['id','radius','sleeping','kind']),position:vector(body.position),velocity:vector(body.velocity)}))};
 if(options.portable)for(const b of exported.adventure!.buildings)if(b.creator)b.creator=b.creator===playerId?'host':b.creator==='host'?'remote-host':b.creator;
 if(skybound)exported.skybound={version:2,nextId:skybound.nextId,parts:skybound.parts.map(part=>({...pick(part,partKeys),...(options.portable&&part.creator?{creator:part.creator===playerId?'host':part.creator==='host'?'remote-host':part.creator}:{}),...(part.loan?{loan:pick(part.loan,['site','role'])}:{}),position:vector(part.position),velocity:vector(part.velocity),...(part.q?{q:pick(part.q,['x','y','z','w'])}:{}),...(part.angularVelocity?{angularVelocity:vector(part.angularVelocity)}:{})} as SkyPart)),blueprints:skybound.blueprints.filter(plan=>plan.owner===playerId).map(plan=>({id:plan.id,owner,name:plan.name,parts:plan.parts.map(p=>({...pick(p,['kind','material','rotation','links']),...(p.q?{q:pick(p.q,['x','y','z','w'])}:{}),offset:vector(p.offset)}))})),fusions:skybound.fusions[playerId]?{[owner]:skybound.fusions[playerId].map(f=>pick(f,['equipment','material','damage','durability','effect']))}:{}};
 if(skybound&&exported.skybound){
  exported.skybound.storage=Object.fromEntries(skybound.parts.filter(part=>part.kind==='storage'&&(part.creator===playerId||!options.portable&&part.shared)).map(part=>[String(part.id),{...(skybound.storage?.[part.id]??{})}]));
  exported.skybound.storageGear=Object.fromEntries(Object.entries(skybound.storageGear??{}).filter(([id])=>Object.hasOwn(exported.skybound!.storage!,id)).map(([id,gear])=>[id,validateGear(gear,exported.skybound!.storage![id])]));
  for(const part of exported.skybound.parts)if(part.kind==='storage'){part.cargoMass=cargoMass(exported.skybound.storage[part.id]??{});part.mass=MATERIAL_MASS[part.material]*PART_COST[part.kind]+part.cargoMass;}
  exported.skybound.camps=skybound.camps?.[playerId]!==undefined?{[owner]:skybound.camps[playerId]}:{};
 }
 if(world.companions)exported.companions={version:1,creatures:world.companions.creatures.map(c=>({...c,position:vector(c.position),owner:options.portable?(c.owner===playerId?'host':c.owner==='host'?'remote-host':c.owner):c.owner}))};
 return validateSave(exported);
}
