import {BEGINNER_ENCOUNTER,crossesEntryClearing,inBeginnerArea,inEntryClearing} from './entry-clearing';
import {completeAdventureBoss,flushPendingBossRewards} from './combat/boss-rewards';
import {characterHeight} from '../physics/character-shape';
import {AdventureProgression,PROGRESSION_ACTIONS,decorationUnlocked,type ProgressionAction} from './adventure-progression';
import {bossMeleeContact,ensureBossParts,damageBossPart,bossPartMovementScale,bossPartAttack} from './combat/boss-parts';
import {sweptEnemyContact} from './combat/enemy-contact';
import {preflightGearThrow,throwGear,updateGearFlight,landGearFlight,recoverGearFlights} from './equipment/flights';
import {EquipmentInventory} from './equipment/inventory';
import {isEquipment} from './equipment/items';
import {safeSavedRespawn,safeStartRespawn} from './respawn-safety';
import {TrailRace,raceGates} from './trail-race';
import {stepAdventureEnemy,isOrdinaryAdventureEnemy,adventureGuardMultiplier,dropAdventureEnemyLoot} from './adventure-enemies';
import {populateAdventureTiles,advanceAdventureWater,explorationStatus} from './adventure-exploration';
import {beaconTravel} from './beacon-travel';
import {marketTrade} from '../content/adventure-market';
import {craftTrailGear} from '../content/adventure-gear';
import {sharedPinAction} from './shared-pins';
import {AdventureSites,SITE_ACTIONS,type SiteAction} from './sites';
import {COMPANION_ACTIONS,type CompanionAction} from './companions';
import {assertBuildingAccess,setBuildingShared} from './building-permissions';
import {craftAdventureMeal} from '../content/adventure-food';
import {adventureEnvironment} from '../environment/adventure';
import {STORMCORE,stormcoreMultiplier} from '../content/stormcore';
import { AdventureTrials } from '../content/adventure-trials';
import { DOWNED_SECONDS, type CoopSnapshot } from './coop-revive';
import { seedAdventureWorld, adventureBeacon, adventureObjective } from '../content/adventure-world';
import { Traversal } from './traversal';
import { skyContext } from './skybound/context';
import { SKY_ACTIONS, type SkyAction } from './skybound/types';
import { assertInteractionReach } from './interaction/reach';
import { buildingPose,buildingVoxels,treeVoxels,localPoint as voxelLocal,bodyTouchesVoxels,footSurface,voxelBounds } from './voxel/model';
import { strikeVoxels } from './voxel/destruction';
import { dropItem,stepDrops,pickupItem,dropOwnedItem,releaseBuildingItems } from './interaction/drops';
import { ATTACK_ORIGIN_HEIGHT, combatAim, horizontalAim } from './combat/direction';
import { ATTACK_BUFFER_SECONDS, COMBO_GRACE_SECONDS, attackProfile, meleeBody, meleeContact } from './combat/attack';
import type { AttackMotion, AttackProfile } from './combat/attack';
import { clearMeleeContact } from './combat/occlusion';
import { strikeBarrier,shamanMagic } from './meadows/defense';
import { meadowBuilding } from '../content/meadows/recipes';
import { archerAttack } from './meadows/village';
import { senseActor,wander } from './meadows/senses';
import { populateMeadowTiles, advanceMeadowWater } from './meadows/exploration';
import { stepStag } from './meadows/boss';
import { reconcileCreature, sees, touchesBuildingVoxels } from './meadows/obstacles';
import { MeadowRules } from './meadows/rules';
import { foodStats, newMeadows, learn } from './meadows/state';
import { seedMeadows } from './meadows/world';
import { TREE_KINDS } from '../content/meadows/data';
import { placementPoint, placementIssue } from './placement';
import { bossAttack, directedShot } from './bosses';
import { BIOMES, BOSSES, BUILDINGS, ENEMIES, LEGACY_ENEMIES, ITEM_NAMES, RECIPES, SPELLS, WEAPONS, biomeAt } from '../content/catalog';
import { environmentAt } from '../environment/time';
import type { GameSimulation } from '../simulation/game-simulation';
import type { Vec3 } from '../world/types';
import type { AdventureSave, AdventureSnapshot, GameAction, EnemyState, Projectile } from './types';
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const STAMINA_RECOVERY_DELAY = .35;
export class Adventure {
 readonly gear=new EquipmentInventory(this);
 freshEquipment=false;
 readonly race=new TrailRace(this);
 readonly progression=new AdventureProgression(this);
 readonly traversal = new Traversal(this);
 readonly trials = new AdventureTrials(this);
 readonly sites=new AdventureSites(this);
 readonly state: AdventureSave;
 readonly meadowRules = new MeadowRules(this);
 owner = 'host';
 damageRevision = 0;
 helping: CoopSnapshot['reviving'];
 receivingHelp: CoopSnapshot['beingRevived'];
 private swing:{motion:AttackProfile;damage:number;reach:number;aim:Vec3;heading:number;weapon:string;element:'physical'|'fire'|'frost';resolved:Set<number>;voxelResolved:boolean}|null=null;
 private charging:{started:number;weapon:string}|undefined;
 get chargeProgress(){return this.charging?Math.min(1,Math.max(0,(this.state.seconds-this.charging.started)/1.5)):undefined;}
 private combo=0; private comboWeapon=''; private comboUntil=0;
 get attackMotion():AttackMotion|undefined {
  if(!this.swing)return undefined;
  const {elapsed,windup,active,duration,kind,combo,heavy}=this.swing.motion;
  return {elapsed,windup,active,duration,kind,combo,heavy};
 }
 private buffered:{action:GameAction;aim:Vec3}|null=null;
 private fallPeak:number|null=null;
 private readonly charges = new Map<number,{x:number;z:number;seconds:number}>();
 projectiles: Projectile[] = [];
 private parryTime=0;
 private guardAim:Vec3|null=null;
 private staminaRecovery=0;
 guarding = false; dodge = 0; attack = 0; private cast = 0; private tiles = new Set<number>(); private dodgeX = 0; private dodgeZ = 0; private hurt = 0; private respawn = 0; private portalCooldown = 0; private poisonTick = 0;
 constructor(readonly sim: GameSimulation, saved?: AdventureSave) {
  this.freshEquipment=!saved;
  this.state = saved ?? { seconds: 0, health: 100, stamina: 100, mana: 70, inventory: { berry: 3 }, equipment: 'hands', unlocked: 1, defeated: [], resources: [], enemies: [], buildings: [], death: null, food: 0, rested: 0, spawn: null, meadows:newMeadows() };
  if (!saved&&sim.world.generator===4) { seedAdventureWorld(sim,this.state);return; }
  if (!saved&&sim.world.generator===3) { this.state.health=25;this.state.stamina=50;this.state.inventory={ragTunic:1};seedMeadows(sim,this.state);return; }
  if(!saved)delete this.state.meadows;
  if (!saved) for (const biome of BIOMES) {
   for (let i = 0; i < 36; i++) { const angle = i * 2.399, radius = 8 + i % 9 * 2.5, x = biome.center.x + Math.sin(angle) * radius, z = biome.center.z + Math.cos(angle) * radius + (i === 0 ? 2.2 : 0);
    this.state.resources.push({ id: biome.tier * 100 + i, x, z, y: sim.groundAt(x, z), kind: i % 4 === 0 ? 'berry' : i % 3 === 0 ? biome.resource : i % 3 === 1 ? 'wood' : 'stone', amount: i % 3 === 1 ? 3 : 2, ready: 0 }); }
   for (let i = 0; i < 8; i++) { const angle = i * 2.399, x = biome.center.x + Math.sin(angle) * (20 + i * 1.5), z = biome.center.z + Math.cos(angle) * (20 + i * 1.5); this.state.enemies.push(this.enemy(biome.tier * 1000 + i, LEGACY_ENEMIES[i % LEGACY_ENEMIES.length].id, biome.tier, x, z)); }
  }
 }
 private enemy(id: number, definition: string, tier: number, x: number, z: number, boss = false): EnemyState {
  const def = boss ? BOSSES.find(b => b.id === definition)! : ENEMIES.find(e => e.id === definition)!;
  return { id, definition, tier, x, z, y: this.sim.groundAt(x, z), homeX: x, homeZ: z, health: def.health * (boss ? 1 : 1 + (tier - 1) * 0.4), cooldown: 1 + (id % 5) * 0.2, windup: 0, slow: 0, boss };
 }
 private populate(p = this.sim.player): void {
  if(this.sim.world.generator===4){populateAdventureTiles(this.sim,this.state,p);return;}
  if(this.state.meadows){if(this.sim.tick%30===0)populateMeadowTiles(this.sim,this.state,p);return;}
  if(this.sim.world.generator===2 && biomeAt(p.x,p.z).id==='mire' && Math.hypot(p.x-90,p.z-90)<32 && !this.state.waterSeeds?.includes('mire')) {
   this.state.waterSeeds ??= [];this.state.waterSeeds.push('mire');
   for(let x=86;x<=94;x++)for(let z=86;z<=94;z++)for(let y=Math.ceil(this.sim.groundAt(x,z));y<=0;y++)this.sim.fluid.add({x,y,z},0.9);
  }
  const cx = Math.floor(p.x / 32), cz = Math.floor(p.z / 32);
  for (let tx = cx - 1; tx <= cx + 1; tx++) for (let tz = cz - 1; tz <= cz + 1; tz++) {
   if (tx < -31 || tx > 30 || tz < -31 || tz > 30) continue;
   const tile = (tx + 31) * 62 + tz + 31; if (this.tiles.has(tile)) continue; this.tiles.add(tile);
   if (this.state.resources.some(n => n.id >= 1000000 && Math.floor((n.id - 1000000) / 10) === tile)) continue;
   const center = { x: tx * 32 + 16, z: tz * 32 + 16 }; if (BIOMES.some(b => Math.hypot(center.x - b.center.x, center.z - b.center.z) < 48)) continue;
   const biome = biomeAt(center.x, center.z);
   const random = (i: number) => { let h = Math.imul(tile + 7319, 374761393) ^ Math.imul(i, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967295; };
   for (let i = 0; i < 6; i++) { const x = tx * 32 + 3 + random(i * 2) * 26, z = tz * 32 + 3 + random(i * 2 + 1) * 26; this.state.resources.push({ id: 1000000 + tile * 10 + i, x, z, y: this.sim.groundAt(x, z), kind: ['wood', 'stone', 'berry', biome.resource][i % 4], amount: 3, ready: 0 }); }
   this.state.enemies.push(this.enemy(2000000 + tile, LEGACY_ENEMIES[tile % LEGACY_ENEMIES.length].id, biome.tier, center.x, center.z));
  }
 }
 private grant(id: string, amount: number): void { if(isEquipment(id)){this.gear.craft(id,amount,this.state.inventory);return;}if(this.state.meadows){this.meadowRules.grant(id,amount);return;}this.state.inventory[id] = (this.state.inventory[id] ?? 0) + amount; }
 private spend(cost: Record<string, number>): void {
  for (const [id, amount] of Object.entries(cost)) if ((this.state.inventory[id] ?? 0) < amount) throw new Error(`${ITEM_NAMES[id] ?? id}が${amount}個必要です`);
  for (const [id, amount] of Object.entries(cost)) this.state.inventory[id] -= amount;
 }
 private stamina(amount: number): void { if (this.state.stamina < amount) throw new Error('スタミナが足りません'); this.state.stamina -= amount; }
 private combatStamina(amount: number, recovery: number): void {
  this.stamina(amount);
  this.staminaRecovery = Math.max(this.staminaRecovery, recovery + STAMINA_RECOVERY_DELAY);
 }
 private raiseGuard(): void {
  if(!this.guardAim||this.attack>0||this.dodge>0||this.state.stamina<=0)return;
  this.sim.player.heading=Math.atan2(this.guardAim.x,this.guardAim.z);
  if(!this.guarding){this.parryTime=.2;this.combo=0;this.comboUntil=0;}
  this.guarding=true;
 }
 hit(enemy: EnemyState, damage: number, element: string, byWeapon=true,source?:Vec3,contact?:Vec3): void {
  if(enemy.health<=0)return;
  const def = ENEMIES.find(d => d.id === enemy.definition);
  if(byWeapon&&this.state.meadows)damage*=1+(this.state.meadows.skills[this.state.equipment]??0)*.005;
  if(this.state.meadows&&enemy.stagger)damage*=2;if(this.state.meadows&&element==='fire'&&enemy.definition.startsWith('grey'))damage*=2;
  damage*=adventureGuardMultiplier(this,enemy,element,source??(byWeapon?this.sim.player:undefined));
  const actor=(byWeapon?undefined:source)??this.sim.targets.find(t=>t.adventure.owner===this.owner)?.player??this.sim.player;
  damage*=damageBossPart(enemy,damage,element,this.state.seconds,contact,actor);
  if(enemy.bossParts&&(enemy.stagger??0)>0)this.charges.delete(enemy.id);
  damage*=this.sites.bossMultiplier(enemy,element,actor)??1;
  if(enemy.definition!=='stormcore'&&(enemy.bossParts?.exposedUntil??0)>this.state.seconds)damage*=1.5;
  if(enemy.definition==='stormcore')damage*=stormcoreMultiplier(this.state.seconds,enemy.attackReady?.exposed,element);
  enemy.health -= damage * (def?.resistance === element ? 0.65 : 1);
  enemy.slow = Math.max(enemy.slow, element === 'frost' ? 3 : 0.25);
  if (enemy.health <= 0) {
   if(this.sites.onBossDefeated(enemy))return;
   if(dropAdventureEnemyLoot(this,enemy))return;
   if(enemy.definition==='stormcore'){completeAdventureBoss(this,enemy);return;}
   if (!enemy.boss) enemy.respawnAt = this.state.seconds + 120;
   if(this.state.meadows){if(enemy.boss){dropItem(this,'hardAntler',3,enemy);dropItem(this,'stormTrophy',1,enemy);if(!this.state.defeated.includes(enemy.definition))this.state.defeated.push(enemy.definition);}else this.meadowRules.loot(enemy.definition,enemy.stars??0,enemy);return;}
   this.grant('fang', enemy.boss ? 8 : 1); this.grant('resin', enemy.boss ? 5 : 1);
   if (enemy.boss && !this.state.defeated.includes(enemy.definition)) { this.state.defeated.push(enemy.definition); this.state.unlocked = Math.min(5, Math.max(this.state.unlocked, enemy.tier + 1)); this.sim.adventure.state.unlocked = this.state.unlocked; this.grant(BOSSES.find(b => b.id === enemy.definition)!.reward, 4); }
  }
 }
 private resolveSwing(swing:NonNullable<Adventure['swing']>):void {
  const p=this.sim.player,s=this.state,origin={x:p.x,y:p.y+ATTACK_ORIGIN_HEIGHT,z:p.z};
  for(const e of s.enemies){
   if(e.health<=0||swing.resolved.has(e.id))continue;
   const contact=bossMeleeContact(e,p,swing.aim,swing.reach,swing.heading)??meleeContact(p,e,swing.aim,swing.reach,swing.motion,meleeBody(e.definition,e.boss),swing.heading);
   if(!contact)continue;
   // A wall hit cannot become an enemy hit later in this same swing after its voxels are carved.
   swing.resolved.add(e.id);
   if(!clearMeleeContact(s,origin,contact,point=>this.sim.world.density(point)))continue;
   this.hit(e,swing.damage*(s.meadows&&!e.alerted?(swing.weapon==='flintKnife'?10:3):1),swing.element,true,p,contact);e.alerted=10;
   {
    const strong=swing.motion.heavy||swing.damage>=25||swing.motion.combo===3;
    if(strong){e.windup=0;e.cooldown=Math.max(e.cooldown,swing.motion.heavy?.7:.45);}
    const d=distance(p,e),push=e.boss?(strong?.15:.03):(strong?.7:.12),from={x:e.x,y:e.y,z:e.z};
    e.x+=(e.x-p.x)/Math.max(d,.01)*push;e.z+=(e.z-p.z)/Math.max(d,.01)*push;
    reconcileCreature(this.sim,e,from);
   }
  }
  if(!swing.voxelResolved){
   swing.voxelResolved=true;
   for(const id of strikeVoxels(this,swing.aim,swing.reach,swing.motion.heavy))this.sim.pendingEdits.add(id);
  }
 }
 hurtPlayer(amount: number, element: string, player = this.sim.player, source?:Vec3): void {
  if (this.hurt > 0 || (this.dodge>.16&&this.dodge<.46) || this.state.health <= 0) return;
  this.charging=undefined;this.gear.ensure();if(this.state.meadows)for(const[slot,kind]of Object.entries(this.state.meadows.gear)){if(slot==='offhand'||this.gear.selected(kind)?.durability===undefined)continue;try{this.gear.prepareUse(kind);}catch{delete this.state.meadows.gear[slot];}}
  const held=this.state.meadows?.gear.offhand;let shield=held?(this.state.inventory[held]?held:''):this.state.inventory.towerShield?'towerShield':this.state.inventory.shield?'shield':'';
  const facing=!source||((source.x-player.x)*Math.sin(player.heading)+(source.z-player.z)*Math.cos(player.heading))>=0;
  if(this.guarding&&shield&&source&&facing&&(!this.state.meadows||this.state.meadows.durability[shield]!==0)){try{this.gear.prepareUse(shield);}catch{shield='';}}
  if(this.guarding&&shield&&source&&facing&&(!this.state.meadows||this.state.meadows.durability[shield]!==0)){
   const cost=amount*.4,parry=shield==='shield'&&this.parryTime>0;
   this.staminaRecovery=Math.max(this.staminaRecovery,.65);
   if(this.state.stamina>=cost){this.state.stamina-=cost;const q=this.state.meadows?.quality[shield]??1,block=(this.sim.skybound.fusion(this.owner,shield)?.damage??0)+(shield==='shield'?6+6*(q-1):10+6*(q-1))*(parry?1.5:1);amount=Math.max(0,amount-block);this.sim.skybound.wearFusion(this.owner,shield);if(parry&&source){const enemy=this.state.enemies.find(e=>e===source);if(enemy&&!enemy.boss)enemy.stagger=2;}}
   else{this.state.stamina=0;this.guarding=false;this.parryTime=0;}
   if(this.state.meadows){learn(this.state,'blocking',.2);this.meadowRules.wear(shield);}
  }
  if(this.state.meadows){amount=this.meadowRules.damage(amount)*(this.state.meadows.corpseRun? .25:1);for(const [slot,id]of Object.entries(this.state.meadows.gear))if(slot!=='offhand')this.meadowRules.wear(id,.5);}
  const armor = !this.state.meadows&&this.state.inventory.armor ? 0.75 : 1;
  if (element === 'poison') this.state.poison = 8; if (element === 'frost') this.state.chill = 5;
  const previousHealth = this.state.health;
  this.state.health = Math.max(0, this.state.health - amount * armor * (element === 'frost' && this.state.rested > 0 ? 0.8 : 1)); this.hurt = 0.65; if(this.state.health < previousHealth)this.damageRevision++;
  if (this.state.health <= 0) {
   if (this.sim.world.generator === 4) {
    this.sim.companions.release(this.owner,player);this.clearCombat();this.sim.skybound.release(this.owner);
    // A connected companion can still rescue a downed player. Solo players
    // have nobody to wait for, so begin the existing recoverable grave/respawn.
    if (this.sim.targets.some(actor => actor.adventure !== this)) this.state.downed = DOWNED_SECONDS;
    else this.finalizeDeath(player);
   }
   else this.finalizeDeath(player);
  }
 }
 private clearCombat(): void {
  this.charging=undefined;
  this.swing=null;this.buffered=null;this.combo=0;this.comboUntil=0;this.attack=0;this.dodge=0;this.cast=0;this.guarding=false;this.guardAim=null;this.parryTime=0;this.staminaRecovery=0;this.traversal.stop();this.fallPeak=null;
 }
 private finalizeDeath(player: Vec3): void {
  this.gear.ensure();
  delete this.state.downed;
  this.clearCombat();
  if(this.state.meadows){const m=this.state.meadows;if(!(m.noSkillDrain??0))for(const key of Object.keys(m.skills))m.skills[key]=Math.floor(m.skills[key]*.95);m.noSkillDrain=600;m.foods=[];this.state.food=0;} const p = player;if(this.state.meadows&&this.state.death&&Object.values(this.state.grave??{}).some(n=>n>0)){this.state.meadows.graves??=[];this.state.meadows.graves.push({...this.state.death,items:{...this.state.grave},gearItems:structuredClone(this.state.graveGear)});}
   this.swing=null;this.buffered=null;this.combo=0;this.comboUntil=0;this.attack=0;this.dodge=0;this.cast=0;this.guarding=false;this.guardAim=null;this.parryTime=0;this.staminaRecovery=0;
   if(this.state.meadows){this.state.equipment='hands';this.guarding=false;this.state.meadows.fishing=undefined;this.state.meadows.riding=undefined;}
   this.state.death = { x: p.x, y: p.y, z: p.z }; this.state.stamina = 0; this.respawn = 3; this.state.grave = {}; for (const id of this.state.meadows?Object.keys(this.state.inventory):['wood', 'stone', 'copper', 'iron', 'crystal', 'aether', 'resin', 'fang', 'berry']) { if(this.sim.world.generator===4&&id==='glider')continue;const lost = Math.floor((this.state.inventory[id] ?? 0) * (this.state.meadows?1:0.2)); if (lost) { this.state.grave[id] = lost; this.state.inventory[id] -= lost; } }
  if(this.state.meadows)this.gear.finishDeath();
 }
 revive(): void {
  if (!(this.state.downed! > 0) || this.state.health > 0) throw new Error('この仲間は救助を待っていません');
  delete this.state.downed; this.clearCombat(); this.hurt=1.5;
  this.state.health=Math.max(1,foodStats(this.state).health*.4);this.state.stamina=foodStats(this.state).stamina*.5;this.state.poison=0;this.state.chill=0;
 }

 action(action: GameAction, id = '', target?: Vec3, aim: Vec3 = { x: 0, y: 0, z: -1 }): { dirty: string[]; message: string } {
  this.refreshGrowth();this.gear.assertProjection();
  const p = this.sim.player, s = this.state, ground = target ?? { x: p.x + aim.x * 2.5, y: p.y, z: p.z + aim.z * 2.5 };
  if(action==='charge-cancel'){this.charging=undefined;return {dirty:[],message:''};}
  if (s.health <= 0) throw new Error('復活を待ってください');
  if(action==='charge-start'){if(this.attack>0||this.dodge>0)throw Error('動作の回復を待ってください');if(WEAPONS[s.equipment]?.ranged)throw Error('溜め攻撃は近接武器で使います');this.charging??={started:s.seconds,weapon:s.equipment};return {dirty:[],message:'溜め中 · 放して攻撃'};}
  if(action==='charge-release'){const charge=this.charging,progress=this.chargeProgress;this.charging=undefined;if(!charge||charge.weapon!==s.equipment||this.attack>0||this.dodge>0)return {dirty:[],message:'溜めを解除しました'};const result=this.action('heavy','',target,aim);if(this.swing)this.swing.damage*=1+.5*(progress??0);return {...result,message:'溜め攻撃 '+Math.round((progress??0)*100)+'%'};}
  if(['attack','heavy','dodge','guard','equip','drop','store','sky-store','travel','return'].includes(action))this.charging=undefined;
  const transferSelection=action==='store'?(id.split('|')[1]??id):action==='sky-store'?id.split(':').slice(1).join(':').replace(/^gear-(\d+):/,'gear:$1:'):id,transferParts=transferSelection.split(':'),transferKind=transferParts[0]==='gear'?s.gearItems?.lots.find(l=>l.id===Number(transferParts[1]))?.kind:transferParts[0];
  if((this.attack>0||this.dodge>0)&&((action==='drop'||action==='store'||action==='sky-store')&&transferKind===s.equipment&&(transferParts[0]!=='gear'||this.gear.selected(s.equipment)?.id===Number(transferParts[1]))||(action==='sky-fuse'||action==='sky-unfuse')&&id.split(':')[0]===s.equipment||['repair','upgrade'].includes(action)&&(!id||id===s.equipment)))throw Error('動作の回復を待ってください');

  if(action==='equip'&&id.startsWith('gear:')){if(!/^gear:\d+$/.test(id))throw Error('装備を選び直してください');if(this.attack>0||this.dodge>0)throw Error('動作の回復を待ってください');const kind=this.gear.select(Number(id.slice(5)));return {dirty:[],message:`${ITEM_NAMES[kind]}の個体を選びました`};}
  if(PROGRESSION_ACTIONS.includes(action as ProgressionAction))return {dirty:[],message:this.progression.action(action as ProgressionAction,id)};
  if(action==='race'){if(this.sim.world.generator!==4)throw Error('この世界には競走がありません');return {dirty:[],message:this.race.action(id)};}
  if(SITE_ACTIONS.includes(action as SiteAction)){this.trials.dialogue=undefined;return this.sites.action(action as SiteAction,id);}
  if(action==='dialogue'&&(id.startsWith('site-')||id.startsWith('chronicle-')))return {dirty:[],message:this.sites.choose(id)};
  if(action==='dialogue'&&id==='bye')this.sites.close();if(action==='talk')this.sites.close();
  if(action==='talk'||action==='dialogue'||action==='trial'||action==='trial-reset'){const message=action==='talk'?this.trials.talk(id):action==='dialogue'?this.trials.choose(id):action==='trial'?this.trials.complete(id):this.trials.reset(id);return {dirty:[],message};}
  if(action==='map-pin-share'||action==='map-pin-remove')return sharedPinAction(this.sim,this.owner,action,id);
  if(this.traversal.debug.active&&(['companion-ride','sky-ride','sky-ascend'].includes(action)||action==='interact'&&s.buildings.some(b=>b.definition==='raft'&&(!id||b.id===Number(id.replace('b:',''))))))throw Error('先にデバッグ飛行を終了してください');
  if(COMPANION_ACTIONS.includes(action as CompanionAction))return this.sim.companions.action(this.owner,action as CompanionAction,id);
  if(this.sim.companions.isRiding(this.owner)&&(['sky-ride','sky-ascend'].includes(action)||['glide','climb'].includes(action)&&id!=='off'||action==='interact'&&s.buildings.some(b=>b.id===Number(id.replace('b:',''))&&b.definition==='raft')))throw Error('灯背獣から降りてから使ってください');
  if(action==='building-share')return {dirty:[],message:setBuildingShared(this,id)};
  if(action==='terrain-undo')return this.sim.terrainHistory.undo(this.owner);
  if(action==='return'){const start=this.sim.world.generator===4?safeStartRespawn(this.sim,this.owner):undefined;if(this.sim.world.generator===4&&!start)throw Error('出発点の周りに安全な空きがありません。仲間に場所を空けてもらってください');this.sim.companions.release(this.owner,this.sim.player);this.traversal.stop();this.sim.skybound.release(this.owner);this.sim.resetPlayer();if(start)Object.assign(p,start,{vy:0,grounded:true});return {dirty:[],message:'安全な出発点へ戻りました'};}
  if(action==='debug-flight')return {dirty:[],message:this.traversal.debug.action(id)};
  if(action==='glide'||action==='climb')return {dirty:[],message:this.traversal.action(action,id,aim)};
  if (SKY_ACTIONS.includes(action as SkyAction)) {
   const result = this.sim.skybound.action(this.owner, action as SkyAction, id, target, aim, skyContext(this.sim));
   if (result.exit) {if(action==='sky-ascend')this.trials.recordAscend({...p},result.exit);Object.assign(p, result.exit, {vy: 0, grounded: true});}
   if(action==='sky-glue')this.progression.record('assemble');
   for (const drop of result.drops ?? []) dropItem(this, drop.id, drop.count, drop.point);
   return {dirty: [], message: result.message};
  }
  const changesEquipment=action==='equip'||action==='craft'||action==='landscape'||action==='fish'||(action==='drop'&&id.split(':')[0]===s.equipment);
  if(changesEquipment&&(this.attack>0||this.dodge>0))throw new Error('動作の回復を待ってください');
  if(action==='interact'&&(id.startsWith('r:')||id.startsWith('b:')||id==='grave'||id.startsWith('grave:'))){
   assertInteractionReach(s,p,id,target??{x:NaN,y:NaN,z:NaN},point=>this.sim.world.density(point));
   const resource=id.startsWith('r:')?s.resources.find(n=>n.id===Number(id.slice(2))):undefined;
   const building=id.startsWith('b:')?s.buildings.find(b=>b.id===Number(id.slice(2))):undefined;
   if(resource){action='gather';id=String(resource.id);}else if(id==='grave'||id.startsWith('grave:'))action='gather';else id=String(building!.id);
  }
  if((action==='repairBuilding'||action==='remove')&&id&&target)assertInteractionReach(s,p,'b:'+id,target,point=>this.sim.world.density(point));
  if(this.sim.world.generator===4&&action==='travel')return {dirty:[],message:beaconTravel(this,id)};
  if(this.sim.world.generator===4&&(action==='trade'||action==='sell'))return {dirty:[],message:marketTrade(this,action==='sell'?'sell:'+id:id)};
  if(this.sim.world.generator===4&&['craft','repair','upgrade'].includes(action)){if(action==='craft'){const meal=craftAdventureMeal(this,id);if(meal)return {dirty:[],message:meal};}return {dirty:[],message:craftTrailGear(this,action as 'craft'|'repair'|'upgrade',id)};}
  if(this.sim.world.generator===4&&action==='gather'){const message=this.progression.inspect(id);if(message)return {dirty:[],message};const result=adventureBeacon(this,id);if(result)return result;}
  if(s.meadows){const result=this.meadowRules.action(action,id,ground);if(result)return result;}
  if(action==='drop'){const kind=dropOwnedItem(this,id,{x:p.x+Math.sin(p.heading),y:p.y+.4,z:p.z+Math.cos(p.heading)});return {dirty:[],message:`${ITEM_NAMES[kind]}を地面に置きました`};}
  if (action === 'gather') {
   if (s.death && distance(p, s.death) < 2.5) { for (const [id, amount] of Object.entries(s.grave ?? {})) this.grant(id, amount); s.grave = {}; s.death = null; s.health = Math.min(foodStats(s).health, s.health + 30); s.stamina = foodStats(s).stamina; return { dirty: [], message: '墓標へ戻りました。体力とスタミナが回復します' }; }
   const nodes = s.resources.filter(n => n.ready <= s.seconds && distance(p, n) < 3).sort((a, b) => distance(p, a) - distance(p, b)), node = id ? nodes.find(n=>n.id===Number(id)) : nodes[0];
   if (!node) throw new Error('木・石・木の実・鉱脈に近づいてください');
   if(node.drop||isEquipment(node.kind)){const count=pickupItem(this,node.id);return {dirty:[],message:`${ITEM_NAMES[node.kind]} +${count}`};}
   const tier = biomeAt(node.x, node.z).tier; if (tier > s.unlocked) throw new Error('前の地域のボスを倒して採掘技術を解放してください');
   this.stamina(5); const amount = node.kind === 'wood' && s.inventory.axe ? 3 : node.amount; this.grant(node.kind, amount); if (node.kind === 'wood') { this.grant('resin', 1); this.sim.dropDebris({x:node.x,y:node.y+1.2,z:node.z},'wood',2); } node.ready = s.seconds + 90;
   return { dirty: [], message: `${ITEM_NAMES[node.kind]} +${amount}` };
  }
  if (action === 'craft') {
   const recipe = RECIPES.find(r => r.id === id); if (!recipe || recipe.tier > s.unlocked) throw new Error('未解放のレシピです');
   if (recipe.station && !s.buildings.some(b => b.definition === 'bench' && distance(p, b) < 5)) throw new Error('作業台の近くで作ってください');
   if(isEquipment(recipe.output)){const inventory={...s.inventory};for(const[k,n]of Object.entries(recipe.cost)){if((inventory[k]??0)<n)throw Error('制作の素材が足りません');inventory[k]-=n;}this.gear.craft(recipe.output,recipe.amount,inventory);}else{this.spend(recipe.cost); this.grant(recipe.output, recipe.amount);} if (WEAPONS[id]) s.equipment = id;
   return { dirty: [], message: `${recipe.name}を作りました` };
  }
  if(action==='equip'&&id==='fishingRod'&&s.inventory.fishingRod){s.equipment=id;return {dirty:[],message:'釣り竿を装備しました'};}
  if (action === 'equip') { if (!(s.inventory[id] > 0) || !WEAPONS[id]) throw new Error('その装備は持っていません'); s.equipment = id; return { dirty: [], message: `${ITEM_NAMES[id]}を装備` }; }
  if (action === 'eat') { const food = s.inventory.stew ? 'stew' : 'berry'; this.spend({ [food]: 1 }); s.food = food === 'stew' ? 300 : 90; s.health = Math.min(100, s.health + (food === 'stew' ? 35 : 12)); return { dirty: [], message: '食事で回復。しばらく体力が自然回復します' }; }
  if(action==='guard'){
   const enabled=id==='on'?true:id==='off'?false:!this.guardAim;
   if(!enabled){this.guardAim=null;this.guarding=false;this.parryTime=0;return {dirty:[],message:''};}
   this.guardAim=horizontalAim(aim,p.heading);this.raiseGuard();
   return {dirty:[],message:''};
  }
  if (action === 'dodge') {
   if (this.dodge > 0) throw new Error('回避中です');
   if (this.attack > 0) throw new Error('攻撃の回復を待ってください');
   const direction=horizontalAim(aim,p.heading);
   this.combatStamina(22*(s.meadows?.gear.offhand==='towerShield'?1.1:1),.48);
   this.dodge=.48;this.buffered=null;this.combo=0;this.comboUntil=0;this.dodgeX=direction.x;this.dodgeZ=direction.z;
   p.heading=Math.atan2(direction.x,direction.z);this.guarding=false;this.parryTime=0;
   return { dirty: [], message: '回避' };
  }
  if (action === 'attack' || action === 'heavy') {
   aim=combatAim(aim,p.heading);
   if(this.dodge>0)throw new Error('回避の回復を待ってください');if(this.attack>0){if(this.attack<=ATTACK_BUFFER_SECONDS){this.buffered??={action,aim:{...aim}};return {dirty:[],message:''};}throw new Error('攻撃の回復を待ってください');}
   if(s.meadows&&s.equipment!=='hands'&&!s.inventory[s.equipment])s.equipment='hands';
   const weapon = WEAPONS[s.equipment] ?? WEAPONS.hands, heavy = action === 'heavy';
   if(s.meadows&&['hammer','hoe','fishingRod'].includes(s.equipment))throw new Error('持ち物から斧・棍棒・槍・弓を装備して攻撃してください');
   if(s.meadows&&s.meadows.durability[s.equipment]===0)throw new Error(this.sim.world.generator===4?'装備が壊れています。工作画面で修理してください':'装備が壊れています。作業台で修理してください');
   if(s.stamina<weapon.stamina*(heavy?1.8:1))throw new Error('スタミナが足りません');
   if(s.meadows&&weapon.ranged&&!['fireArrow','flintArrow','woodArrow'].some(k=>s.inventory[k]>0))throw Error('矢が必要です');
   if(s.meadows&&s.equipment==='flintSpear'&&heavy)preflightGearThrow(this,s.equipment);else if(weapon.ranged){const reservation=this.sim.reserveEntityIds(2);reservation.allocate();if((this.gear.selected(s.equipment)?.count??0)>1)reservation.allocate();}
   this.gear.prepareUse(s.equipment);
   let arrow='';if(s.meadows&&weapon.ranged){arrow=['fireArrow','flintArrow','woodArrow'].find(k=>s.inventory[k]>0)??'';if(!arrow)throw new Error('矢が必要です');this.spend({[arrow]:1});}
   if(s.meadows){this.meadowRules.wear(s.equipment);learn(s,s.equipment,.1);}
   const chaining=!heavy&&!weapon.ranged&&this.comboWeapon===s.equipment&&s.seconds<=this.comboUntil&&this.combo<3;
   const combo=chaining?this.combo+1:1,motion=attackProfile(s.equipment,weapon.cooldown,heavy,combo,!!weapon.ranged);
   const recovery=motion.duration;
   this.combo=heavy||weapon.ranged?0:combo;this.comboWeapon=s.equipment;this.comboUntil=s.seconds+recovery+COMBO_GRACE_SECONDS;
   this.combatStamina(weapon.stamina*(heavy?1.8:1),recovery);this.attack=recovery;
   const direction=horizontalAim(aim,p.heading);p.heading=Math.atan2(direction.x,direction.z);
   this.guarding=false;this.parryTime=0;
   const fusion = this.sim.skybound.fusion(this.owner, s.equipment), element = fusion?.effect === 'fire' ? 'fire' : fusion?.effect === 'frost' ? 'frost' : 'physical';
   this.sim.skybound.wearFusion(this.owner, s.equipment);
   const damage = (weapon.damage + (fusion?.damage ?? 0)) * (heavy ? 1.7 : 1)*motion.damageScale*(1+((s.meadows?.quality[s.equipment]??1)-1)*.2);
   if(s.meadows&&s.equipment==='flintSpear'&&heavy){const flight=throwGear(this,'flintSpear',{x:p.x,y:p.y+ATTACK_ORIGIN_HEIGHT,z:p.z});s.equipment='hands';this.projectile(aim,damage,element,.2,flight);this.projectiles[this.projectiles.length-1].gearFlight=flight;this.projectiles[this.projectiles.length-1].recover='flintSpear';this.projectiles[this.projectiles.length-1].kind='spear';this.projectiles[this.projectiles.length-1].gravity=5;return {dirty:[],message:'槍を投げました。着地点で拾えます'};}
   if (weapon.ranged) { this.projectile(aim, damage+(s.meadows?(arrow==='flintArrow'?27:arrow==='fireArrow'?11:22):0), element, 0.15);const shot=this.projectiles[this.projectiles.length-1];shot.kind='arrow';shot.gravity=s.meadows?5:0;if(arrow==='fireArrow')shot.burn=5; return { dirty: [], message: '矢を放ちました' }; }
   this.swing={motion,damage,element,reach:weapon.reach+(heavy?.4:0),aim:{...aim},heading:p.heading,weapon:s.equipment,resolved:new Set(),voxelResolved:false};
   return {dirty:[],message:heavy?'強攻撃':'攻撃'};
  }
  if (action === 'spell') {
   if(this.attack>0||this.dodge>0)throw new Error('動作の回復を待ってください');
   const spell = SPELLS.find(v => v.id === id); if (!spell) throw new Error('未知の魔法です'); if (!s.inventory.staff && !s.inventory.book) throw new Error('杖を作ると魔法が使えます');
   if (this.cast > 0 || s.mana < spell.mana) throw new Error('魔力不足、または詠唱の回復中です'); s.mana -= spell.mana; this.cast = spell.cooldown;
   const direction=horizontalAim(aim,p.heading);p.heading=Math.atan2(direction.x,direction.z);this.guarding=false;this.parryTime=0;
   let dirty: string[] = [];
   if (id === 'mend') s.health = Math.min(100, s.health + 35);
   else if (id === 'quake' || id === 'raise') dirty = this.sim.editGround(id === 'raise' ? 'add' : 'dig', ground, 2.3);
   else this.projectile(aim, spell.damage, spell.element, 0.4);
   if (id === 'quake') for (const b of this.sim.bodies) if (distance(b.position, ground) < 5) { b.sleeping = false; b.velocity.y += 4; }
   return { dirty, message: spell.name };
  }
  if (action === 'build') {
   if(this.sim.world.generator===4&&!decorationUnlocked(s,id))throw Error('地域の記録を集めて装飾を解放してください');
   let def = BUILDINGS.find(b => b.id === id);if(def&&s.meadows)def=meadowBuilding(def); if (!def || distance(p, ground) > 7) throw new Error('近くに設置してください');
   const {x,y,z}=ground;if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||Math.abs(y-p.y)>7)throw new Error('近くに設置してください');
   const issue=placementIssue(def,p,{x,y,z},s.buildings,s.inventory,Math.atan2(aim.x,aim.z));if(issue)throw new Error(issue);
   this.spend(def.cost); s.buildings.push({ id: this.sim.allocateEntityId(), definition: id, x, y, z,...(this.sim.world.generator===4?{creator:this.owner,shared:false}:{}), rotation: Math.atan2(aim.x, aim.z), support: def.support, contents: {}, ...(s.meadows?{health:100,fuel:['fire','standingTorch'].includes(id)?300:0}:{}) });
   this.support(); return { dirty: [], message: `${def.name}を設置。支持がないものは崩れます` };
  }
  if (action === 'remove') {
   const b = id?s.buildings.find(b=>b.id===Number(id)&&distance(p,b)<4):s.buildings.filter(b => distance(p, b) < 4).sort((a, b) => distance(p, a) - distance(p, b))[0]; if (!b) throw new Error('建築物に近づいてください');
   assertBuildingAccess(this,b,'modify');releaseBuildingItems(this,b,b.salvage??(s.meadows?meadowBuilding(BUILDINGS.find(v=>v.id===b.definition)!):BUILDINGS.find(v=>v.id===b.definition)!).cost);s.buildings = s.buildings.filter(v => v.id !== b.id);this.support(); return {dirty:[],message:'解体して素材を地面へ戻しました'};
  }
  if (action === 'summon') {
   const biome = biomeAt(p.x, p.z), boss = BOSSES.find(b => b.id === biome.boss)!;
   if (biome.tier > s.unlocked) throw new Error('前のボスを倒してください'); if (Math.hypot(p.x - biome.center.x, p.z - biome.center.z + 14) > 5) throw new Error('地域の祭壇に近づいてください');
   if (s.enemies.some(e => e.boss && e.definition === boss.id && e.health > 0)) throw new Error('ボスはすでに出現しています');
   this.spend(boss.summon); s.enemies.push(this.enemy(this.sim.allocateEntityId(), boss.id, biome.tier, biome.center.x, biome.center.z - 18, true)); return { dirty: [], message: `${boss.name}が現れました` };
  }
  if (action === 'portal') {
   if (this.portalCooldown > 0) throw new Error('転移門が安定するまで待ってください');
   const portals = s.buildings.filter(b => b.definition === 'portal').sort((a,b) => a.id-b.id);
   const index = portals.findIndex(b => distance(p,b) < 3);
   if (index < 0) throw new Error('転移門に近づいてください');
   const destination = portals[index % 2 === 0 ? index + 1 : index - 1];
   if (!destination) throw new Error('もう一つ転移門を作ると接続されます');
   p.x = destination.x + Math.sin(destination.rotation) * 2; p.z = destination.z + Math.cos(destination.rotation) * 2;
   p.y = Math.max(destination.y, this.sim.groundAt(p.x,p.z)) + 0.5; p.vy = 0; p.grounded = false; this.portalCooldown = 3;
   return { dirty: [], message: '接続した転移門へ移動しました' };
  }
  if (action === 'travel') { const biome = BIOMES.find(b => b.id === id); if (!biome || biome.tier > s.unlocked) throw new Error('未解放の地域です'); p.x = biome.center.x; p.z = biome.center.z + 8; p.y = this.sim.groundAt(p.x, p.z) + 1; p.vy = 0; p.grounded = false; return { dirty: [], message: `${biome.name}へ移動しました` }; }
  if (action === 'rest') { const bed = s.buildings.find(b => b.definition === 'bed' && distance(p, b) < 4), fire = s.buildings.some(b => b.definition === 'fire' && distance(p, b) < 5); if (!bed || !fire) throw new Error('寝床と焚き火を近くに作ってください'); s.rested = 300; s.health = 100; s.spawn = { x: bed.x, y: bed.y + 1, z: bed.z + 2 }; s.seconds += ((7 - (s.seconds / 720 * 24 + 9) % 24 + 24) % 24 || 24) / 24 * 720; return { dirty: [], message: '休息しました。ここが復活地点になります' }; }
  if (action === 'chest') { const chest = s.buildings.find(b => b.definition === 'chest' && distance(p, b) < 3); if (!chest) throw new Error('箱に近づいてください'); if (Object.values(chest.contents).some(v => v > 0)) {assertBuildingAccess(this,chest,'withdraw'); const holder={items:chest.contents,gearItems:chest.gearItems};this.gear.recover(holder);chest.contents=holder.items;chest.gearItems=holder.gearItems; return { dirty: [], message: '箱の素材を取り出しました' }; } for (const material of ['wood', 'stone', 'copper', 'iron', 'crystal', 'aether']) { const amount = s.inventory[material] ?? 0; if (amount) { chest.contents[material] = amount; s.inventory[material] = 0; } } return { dirty: [], message: '素材を箱へ預けました' }; }
  throw new Error('未知のゲーム操作です');
 }
 private projectile(aim: Vec3, damage: number, element: string, radius: number, id=this.sim.allocateEntityId()): void { const p = this.sim.player;
  aim=combatAim(aim,p.heading);
  this.projectiles.push({ id, owner: this.owner, x: p.x, y: p.y + ATTACK_ORIGIN_HEIGHT, z: p.z, vx: aim.x * 12, vy: aim.y * 12, vz: aim.z * 12, life: 2.5, damage, element, radius }); }
 support(): void {
  const buildings = this.state.buildings;
  for (const b of buildings) b.support = b.definition==='raft'?4: this.sim.world.density({ x: b.x, y: b.y - 0.15, z: b.z }) < 0.2 ? BUILDINGS.find(d => d.id === b.definition)!.support : 0;
  for (let pass = 0; pass < 8; pass++) for (const b of buildings) for (const other of buildings) if (b !== other && Math.abs(b.x - other.x) <= 2.2 && Math.abs(b.z - other.z) <= 2.2 && Math.abs(b.y - other.y) <= 2.2) b.support = Math.max(b.support, other.support - 1);
  const removed=new Set<number>();for (const b of buildings.filter(b => b.support <= 0)) { try{releaseBuildingItems(this,b,b.salvage??(this.state.meadows?meadowBuilding(BUILDINGS.find(d=>d.id===b.definition)!):BUILDINGS.find(d=>d.id===b.definition)!).cost);removed.add(b.id);this.sim.dropDebris({x:b.x,y:b.y+0.5,z:b.z},'debris',2);}catch{/* A full drop budget retains the recoverable building and every item. */} }
  this.state.buildings = buildings.filter(b => !removed.has(b.id));
 }
 collidePlayer(previousY: number): void {
  const p = this.sim.player;
  for (const b of this.state.buildings) {
   if (b.definition === 'fire' || b.definition === 'cook') continue;
   const pose=buildingPose(b);
   const cos = Math.cos(pose.rotation), sin = Math.sin(pose.rotation), dx = p.x - pose.x, dz = p.z - pose.z, x = dx * cos - dz * sin, z = dx * sin + dz * cos;
   const cellTop=footSurface(buildingVoxels(b.definition),voxelLocal(p,pose,pose.rotation),previousY-b.y,b.removed);if(cellTop!==null&&p.vy<=0&&p.y<=b.y+cellTop+.15&&previousY>=b.y+cellTop-.45){p.y=b.y+cellTop;p.vy=0;p.grounded=true;continue;}
   if(!touchesBuildingVoxels(b,p.x,p.y,p.z,.3,characterHeight(p)))continue;
   const bounds=voxelBounds(buildingVoxels(b.definition)),minX=bounds.min.x-.3,maxX=bounds.max.x+.3,minZ=bounds.min.z-.3,maxZ=bounds.max.z+.3;
   const shifts=[{x:minX-x,z:0},{x:maxX-x,z:0},{x:0,z:minZ-z},{x:0,z:maxZ-z}];
   const shift=shifts.reduce((best,next)=>Math.abs(next.x)+Math.abs(next.z)<Math.abs(best.x)+Math.abs(best.z)?next:best);
   p.x=pose.x+(x+shift.x)*cos+(z+shift.z)*sin;p.z=pose.z-(x+shift.x)*sin+(z+shift.z)*cos;
  }
  this.sim.skybound.collidePlayer(p, previousY);
  for (const n of this.state.resources) if (((!this.state.meadows&&n.kind === 'wood')||TREE_KINDS.has(n.kind)) && n.ready <= this.state.seconds && Math.abs(p.y - n.y) < 3) {
   if(n.removed?.length&&!bodyTouchesVoxels(treeVoxels(n.kind,n.id),voxelLocal(p,n),n.removed,characterHeight(p)))continue;const d = distance(p, n); if (d < 0.47) { const dx = p.x - n.x, dz = p.z - n.z; p.x = n.x + (d ? dx / d : 1) * 0.47; p.z = n.z + (d ? dz / d : 0) * 0.47; }
  }
 }
 stepPersonal(dt: number): void {
  if(this.sim.world.generator===4){this.race.step(dt);this.progression.step(dt);}
  const recoveryBefore=Math.max(this.staminaRecovery,this.attack,this.dodge),dodgeDt=Math.min(dt,this.dodge);
  this.staminaRecovery=Math.max(0,this.staminaRecovery-dt);
  const s = this.state, p = this.sim.player; s.seconds += dt;if(this.charging&&(s.health<=0||s.equipment!==this.charging.weapon))this.charging=undefined;this.parryTime=Math.max(0,this.parryTime-dt);
  if(this.swing){
   const swing=this.swing,before=swing.motion.elapsed;
   swing.motion.elapsed=Math.min(swing.motion.duration,before+dt);
   if(s.health>0&&swing.motion.elapsed>=swing.motion.windup&&before<swing.motion.windup+swing.motion.active)this.resolveSwing(swing);
   if(swing.motion.elapsed>=swing.motion.duration)this.swing=null;
  }
  this.attack = Math.max(0, this.attack - dt); this.cast = Math.max(0, this.cast - dt); this.hurt = Math.max(0, this.hurt - dt); this.dodge = Math.max(0, this.dodge - dt);
  if(this.attack<=0&&this.buffered){const buffered=this.buffered;this.buffered=null;if(s.health>0){try{this.action(buffered.action,'',undefined,buffered.aim);}catch{}}}
  if(s.health>0)this.raiseGuard();
  this.portalCooldown = Math.max(0, this.portalCooldown - dt);
  s.poison = Math.max(0, (s.poison ?? 0) - dt); s.chill = Math.max(0, (s.chill ?? 0) - dt);
  if (s.poison > 0 && s.health > 0) { this.poisonTick += dt; if (this.poisonTick >= 1) { this.poisonTick = 0; this.hurtPlayer(2, 'physical'); } } else this.poisonTick = 0;
  const staminaDt=s.health>0&&this.attack<=0&&this.dodge<=0&&this.staminaRecovery<=0?Math.max(0,dt-recoveryBefore):0;
  s.food = Math.max(0, s.food - dt); s.rested = Math.max(0, s.rested - dt); s.stamina = Math.min(foodStats(s).stamina, s.stamina + staminaDt * ((s.meadows?.exerting||s.meadows?.fishing?.reeling)?0:this.guarding ? 3 : s.rested ? 20 : 12)*(s.meadows?.cold?.5:1)*(s.meadows?.wet?.75:1)); s.mana = Math.min(70, s.mana + dt * 6);
  if (s.health <= 0 && s.downed !== undefined) { s.downed=Math.max(0,s.downed-dt); if(s.downed<=1e-8)this.finalizeDeath(p); return; }
  if (s.health <= 0) { this.respawn -= dt; if (this.respawn <= 0) { const camp=this.sim.world.generator===4?this.sim.skybound.campRespawn(this.owner,skyContext(this.sim)):undefined;this.sim.resetPlayer(); if(camp)Object.assign(p,camp,{vy:0,grounded:true});else if (s.spawn&&(this.sim.world.generator!==4||safeSavedRespawn(this.sim,s.spawn,this.owner))) Object.assign(p, s.spawn);else if(this.sim.world.generator===4){const start=safeStartRespawn(this.sim,this.owner);if(!start){this.respawn=.5;return;}Object.assign(p,start,{vy:0,grounded:true});} s.health = s.meadows?25:70; s.stamina = foodStats(s).stamina; if(s.meadows)s.equipment='hands'; } return; }
  this.trials.step();this.sites.discover();
  if(this.traversal.gliding)this.fallPeak=p.y;
  if(s.meadows){if(this.sim.world.generator!==4){if(!p.grounded)this.fallPeak=Math.max(this.fallPeak??p.y,p.y);else if(this.fallPeak!==null){const fall=this.fallPeak-p.y;this.fallPeak=null;if(fall>4&&this.sim.fluid.immersion(p,1.45)<.3)this.hurtPlayer(Math.min(100,(fall-4)*8),'physical');}}this.meadowRules.step(dt);}
  if (!s.meadows&&s.food > 0) s.health = Math.min(100, s.health + dt * 0.8);
  if (dodgeDt > 0) this.sim.movePlayer(this.dodgeX * 8 * dodgeDt, this.dodgeZ * 8 * dodgeDt);
 }
 private combatDistance(a:Vec3,b:Vec3):number{return this.sim.world.generator===4?Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z):distance(a,b);}
 private closestActor(point: Vec3): { player: import('../simulation/protocol').PlayerState; adventure: Adventure } | undefined {
  let nearest: { player: import('../simulation/protocol').PlayerState; adventure: Adventure } | undefined;
  let length = Infinity;
  const targets = this.sim.targets.length ? this.sim.targets : [{ player: this.sim.player, adventure: this }];
  for (const candidate of targets) if (candidate.adventure.state.health > 0) {
   const d = this.combatDistance(candidate.player, point); if (d < length) { length = d; nearest = candidate; }
  }
  return nearest;
 }
 step(dt: number): void {
  if(this.sim.world.generator===4&&this.sim.tick%30===0)flushPendingBossRewards(this);
  if (this.sim.targets.length) for (const target of this.sim.targets) this.populate(target.player); else this.populate();
  if(this.sim.world.generator===4)advanceAdventureWater(this.sim,this.state);else advanceMeadowWater(this.sim,this.state);
  stepDrops(this, dt);
  this.stepPersonal(dt);this.sites.step(dt);
  const s = this.state;
  if (s.health <= 0 && !this.sim.targets.some(t => t.adventure.state.health > 0)) return;
  for (const e of s.enemies) {
   if(stepAdventureEnemy(this,e,dt))continue;
   const target = this.closestActor(e); if (!target) continue;
   const p = target.player,previousEnemy={x:e.x,y:e.y,z:e.z};
   if (e.health <= 0 && !e.boss && e.respawnAt && e.respawnAt <= s.seconds) { const def = ENEMIES.find(d => d.id === e.definition)!; e.health = def.health * (1 + (e.stars??0)) * (1 + (e.tier - 1) * 0.4); e.x = e.homeX; e.z = e.homeZ; e.cooldown = 3; }
   if (e.health <= 0 || this.combatDistance(p, e) > 45) continue;
   ensureBossParts(e);
   if((e.burn??0)>0){e.burn=Math.max(0,e.burn!-dt);this.hit(e,dt*4.4,'fire');if(e.health<=0)continue;}
   if((s.meadows||e.bossParts)&&(e.stagger??0)>0){e.stagger=Math.max(0,e.stagger!-dt);e.windup=0;continue;}
   if((e.attackReady?.healing??0)>s.seconds)e.health=Math.min(ENEMIES.find(n=>n.id===e.definition)!.health*(1+(e.stars??0)),e.health+5*dt);
   if(s.meadows&&e.boss&&e.definition==='stormstag'){stepStag(this,e,dt);continue;}
   const def = e.boss ? BOSSES.find(d => d.id === e.definition)! : ENEMIES.find(d => d.id === e.definition)!;
   const d = this.combatDistance(p, e), reach = e.boss ? 3.3 : (def as typeof ENEMIES[number]).reach, speed = e.boss ? (e.health < def.health / 2 ? 2.3 : 1.4)*bossPartMovementScale(e) : (def as typeof ENEMIES[number]).speed;
   e.slow = Math.max(0, e.slow - dt); e.cooldown -= dt;
   const detected=!s.meadows||senseActor(this,e,target.adventure,p,dt);
   if(s.meadows&&!detected&&!e.windup)wander(this,e,speed,dt);
   const passive=def.damage===0||(e.tame??0)>=1;
   const fire=['boar','deer','greyling','greydwarf'].includes(e.definition)&&s.buildings.find(b=>b.definition==='fire'&&(b.fuel??0)>0&&!b.open&&distance(b,e)<6);
   if(s.meadows&&(passive||fire)){if((detected&&d<16&&passive&&(e.tame??0)<1&&sees(this.sim,e,p))||fire){const threat=fire||p,away=Math.max(.1,distance(e,threat));e.x+=(e.x-threat.x)/away*speed*dt;e.z+=(e.z-threat.z)/away*speed*dt;}const wet=this.sim.fluid.immersion(e,1),current=this.sim.fluid.current(e,1);e.x+=current.x*wet*dt;e.z+=current.z*wet*dt;if(e.definition==='gull')e.y+=(this.sim.groundAt(e.x,e.z)+(detected?3:0)-e.y)*Math.min(1,dt*2);else{e.y=this.sim.world.generator===4?Math.max(this.sim.groundAt(e.x,e.z,e.y),e.y-9*dt):this.sim.groundAt(e.x,e.z);reconcileCreature(this.sim,e,previousEnemy);}continue;}
   if(e.bossParts&&!e.windup&&!this.charges.has(e.id))e.heading=Math.atan2(p.x-e.x,p.z-e.z);
   if (detected&&d < (e.boss ? 25 : environmentAt(s.seconds).daylight < 0.2 ? 15 : 10) && d > reach) { e.x += (p.x - e.x) / d * speed * dt * (e.slow ? 0.4 : 1); e.z += (p.z - e.z) / d * speed * dt * (e.slow ? 0.4 : 1); }
   const water = this.sim.fluid.immersion(e, e.boss ? 2.4 : 1.2), flow = this.sim.fluid.current(e, e.boss ? 2.4 : 1.2);
   if (water > 0) {
    const carry = Math.min(1, water * 3) * (e.boss ? 0.3 : 1);
    const nx = e.x + flow.x * carry * dt, nz = e.z + flow.z * carry * dt;
    if (this.sim.world.density({ x:nx, y:e.y+0.65, z:nz }) > 0.1) { e.x=nx; e.z=nz; }
    e.slow = Math.max(e.slow, water * 0.5);
   }
   e.y = this.sim.world.generator===4?Math.max(this.sim.groundAt(e.x,e.z,e.y),e.y-9*dt):this.sim.groundAt(e.x,e.z);if(s.meadows)reconcileCreature(this.sim,e,previousEnemy);
   if(s.meadows&&!passive&&detected){if(strikeBarrier(this,e,p))continue;shamanMagic(this,e,dt);}
   if(e.definition==='draugrArcher'){archerAttack(this,e,p,dt);continue;}
   if (e.boss) {
    const ability = bossPartAttack(e,bossAttack(e.definition, e.health < def.health / 2, e.attackKind)), charge = this.charges.get(e.id);
    if (charge) {
     const length=Math.hypot(charge.x,charge.z); e.x+=charge.x/Math.max(length,0.01)*12*dt*bossPartMovementScale(e); e.z+=charge.z/Math.max(length,0.01)*12*dt*bossPartMovementScale(e); charge.seconds-=dt;if(this.sim.world.generator===4)reconcileCreature(this.sim,e,previousEnemy);
     for(const actor of this.sim.targets.length?this.sim.targets:[{player:this.sim.player,adventure:this}])if(this.combatDistance(actor.player,e)<2.6&&(this.sim.world.generator!==4||sees(this.sim,e,actor.player)))actor.adventure.hurtPlayer(def.damage,def.element,actor.player);
     if(charge.seconds<=0)this.charges.delete(e.id);
    } else if (e.windup > 0) {
     e.windup = Math.max(0, e.windup - dt);
     if (e.windup <= 0) {
      if (ability.charge) this.charges.set(e.id,{x:(e.definition==='stormcore'||e.definition==='loadwarden')?Math.sin(e.attackYaw??0):p.x-e.x,z:(e.definition==='stormcore'||e.definition==='loadwarden')?Math.cos(e.attackYaw??0):p.z-e.z,seconds:0.75});
      else if (ability.shots) {
       for(let j=0;j<ability.shots;j++) {
        const from={x:e.x,y:e.y+2,z:e.z},velocity=directedShot(from,['echowarden','sailwarden'].includes(e.definition)?{x:e.x+Math.sin(e.attackYaw??0)*12,y:p.y+.7,z:e.z+Math.cos(e.attackYaw??0)*12}:{x:p.x,y:p.y+0.7,z:p.z},(j-(ability.shots-1)/2)*0.15);
        this.projectiles.push({id:this.sim.allocateEntityId(),owner:'enemy:'+e.id,...from,vx:velocity.x,vy:velocity.y,vz:velocity.z,life:4,damage:def.damage,element:ability.element,radius:0.35});
       }
       if(e.definition==='frostwing')this.sim.fluid.freeze(e,6);
      } else for(const actor of this.sim.targets.length?this.sim.targets:[{player:this.sim.player,adventure:this}])if(this.combatDistance(actor.player,e)<ability.radius&&(this.sim.world.generator!==4||sees(this.sim,e,actor.player))) {
       actor.adventure.hurtPlayer(def.damage,def.element,actor.player); actor.adventure.state.chill=2;
      }
      if(e.definition==='stormcore'){e.attackReady??={};e.attackReady.exposed=Math.max(e.attackReady.exposed??0,s.seconds+STORMCORE.exposedSeconds);}
      e.cooldown=ability.cooldown;
     }
    } else if (d < 25 && e.cooldown <= 0) { if(['loadwarden','echowarden','sailwarden'].includes(e.definition))e.attackYaw=Math.atan2(p.x-e.x,p.z-e.z);if(e.definition==='stormcore'){e.attackKind=d>8?'prism':Math.floor(s.seconds/6)%2?'rush':'pulse';e.attackYaw=Math.atan2(p.x-e.x,p.z-e.z);}if(e.definition==='stormstag')e.attackKind=d>7?'beam':Math.floor(s.seconds/5)%2?'stomp':'antler';e.heading=e.attackYaw??e.heading;e.windup = bossAttack(e.definition,false,e.attackKind).windup; }
    continue;
   }
   if (e.windup > 0) { e.windup = Math.max(0, e.windup - dt); if (e.windup <= 0) { if (d < reach + 0.8&&(this.sim.world.generator!==4||sees(this.sim,e,p))) target.adventure.hurtPlayer(def.damage * (1+(e.stars??0)*.5) * (e.boss ? 1 : 1 + (e.tier - 1) * 0.35), def.element, p,e); e.cooldown = e.boss && e.health < def.health / 2 ? 1.2 : 2; } }
   else if (detected&&d < reach + 0.4 && e.cooldown <= 0) e.windup = e.boss ? 0.8 : 0.55;
  }
  for (let i = this.projectiles.length - 1; i >= 0; i--) {
   const shot = this.projectiles[i],previousShot={x:shot.x,y:shot.y,z:shot.z}; shot.life -= dt;shot.vy-=(shot.gravity??0)*dt; shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.z += shot.vz * dt;
   const hostile = shot.owner?.startsWith('enemy:'),ordinaryHostile=hostile&&this.sim.world.generator===4&&s.enemies.some(e=>shot.owner==='enemy:'+e.id&&isOrdinaryAdventureEnemy(e));
   if(ordinaryHostile&&crossesEntryClearing(this.sim,previousShot,shot))shot.life=0;
   const contact = shot.life>0&&!hostile ? sweptEnemyContact(s.enemies,previousShot,shot,shot.radius) : undefined;
   if(this.sim.world.generator===4&&!clearMeleeContact(s,previousShot,contact?.point??shot,point=>this.sim.world.density(point))){Object.assign(shot,previousShot);shot.life=0;}
   if(hostile&&shot.life>0) for(const actor of this.sim.targets.length?this.sim.targets:[{player:this.sim.player,adventure:this}])if(Math.hypot(actor.player.x-shot.x,actor.player.y+0.7-shot.y,actor.player.z-shot.z)<shot.radius+0.6){if(ordinaryHostile&&inEntryClearing(this.sim,actor.player)){shot.life=0;break;}const beginner=ordinaryHostile&&inBeginnerArea(this.sim,actor.player);actor.adventure.hurtPlayer(beginner?Math.min(shot.damage,BEGINNER_ENCOUNTER.damage):shot.damage,beginner?'physical':shot.element,actor.player,previousShot);shot.life=0;}
   if (contact&&shot.life>0) { const enemy=contact.enemy,owner = this.sim.targets.find(t => t.adventure.owner === shot.owner)?.adventure ?? this; owner.hit(enemy, shot.damage, shot.element,true,previousShot,contact.point);Object.assign(shot,contact.point);if(shot.burn)enemy.burn=shot.burn;enemy.alerted=10; shot.life = 0; }
   if (shot.element === 'frost' && (this.sim.fluid.immersion(shot, 0.3) > 0 || this.sim.world.density(shot) <= 0)) { this.sim.fluid.freeze(shot, 3); shot.life = 0; }
   if(shot.gearFlight!==undefined)updateGearFlight(this,shot);
   if (shot.life <= 0 || this.sim.world.density(shot) <= 0) {if(shot.gearFlight!==undefined)landGearFlight(this,shot.gearFlight);else if(shot.recover)s.resources.push({id:this.sim.allocateEntityId(),kind:shot.recover,x:shot.x,y:this.sim.groundAt(shot.x,shot.z,shot.y),z:shot.z,amount:1,ready:0});this.projectiles.splice(i, 1);}
  }
  if (this.sim.tick % 30 === 0) {
   recoverGearFlights(this);this.support();
   for (const b of s.buildings) {
    if (b.definition === 'spring') this.sim.fluid.add({x:b.x,y:b.y+1,z:b.z},0.8);
    if (b.definition === 'drain') this.sim.fluid.drain({x:b.x,y:b.y,z:b.z},2);
   }
   const weather = environmentAt(s.seconds, biomeAt(this.sim.player.x, this.sim.player.z).tier).weather;
   if (weather === 'rain' || weather === 'storm') { const x = this.sim.player.x + Math.sin(this.sim.tick * 3.17) * 6, z = this.sim.player.z + Math.cos(this.sim.tick * 5.13) * 6; this.sim.fluid.add({ x, y: this.sim.groundAt(x, z) + 3, z }, weather === 'storm' ? 1 : 0.4); }
  }
 }
 private refreshGrowth():void{if(this.sim.world.generator===4&&this.state.meadows){const m=this.state.meadows,limit=32+Math.min(3,this.state.siteWorld?.completed.length??0)*4;m.slotLimit=Math.max(m.slotLimit??32,limit);if(m.slots)while(m.slots.length<m.slotLimit)m.slots.push(null);}}
 snapshot(): AdventureSnapshot {
  this.refreshGrowth();this.gear.assertProjection();
  const s = this.state, p = this.sim.player, biome = biomeAt(p.x, p.z), boss = BOSSES.find(b => b.id === biome.boss)!;
  return { ...s,pendingBossRewards:s.enemies.filter(e=>e.rewardPending).length,chargeProgress:this.chargeProgress,progression:s.progression?structuredClone(s.progression):undefined,progressionView:this.sim.world.generator===4?this.progression.snapshot():undefined,gearItems:s.gearItems?structuredClone(s.gearItems):undefined,graveGear:s.graveGear?structuredClone(s.graveGear):undefined,gearFlights:undefined,raceTarget:s.race?.run?raceGates(this.sim)[s.race.run.next]:undefined,exploration:undefined,explorationStatus:explorationStatus(s),sharedPins:this.sim.sharedPins.map(p=>({...p,position:{...p.position}})),companions:this.sim.companions.snapshot(this.owner), ...(this.sim.world.generator===4?{expeditions:this.sites.snapshot(),dialogue:this.sites.dialogue??this.trials.dialogue,journey:this.trials.snapshot()}:{}), ...(this.sim.world.generator===4?{coop:{downedSeconds:s.downed??0,reviving:this.helping,beingRevived:this.receivingHelp}}:{}), traversal:this.traversal.snapshot(), skybound: this.sim.skybound.snapshot(this.owner), inventory: { ...s.inventory }, resources: s.resources.filter(n => distance(p, n) < 65 || this.sim.world.generator===4&&(n.id>=810001&&n.id<=810004||n.id>=825001&&n.id<=825007||n.id>=830001&&n.id<=830003)).map(n => ({ ...n })), enemies: s.enemies.filter(e => distance(p, e) < 65).map(e => ({ ...e,attackReady:e.attackReady?{...e.attackReady}:undefined,bossParts:e.bossParts?structuredClone(e.bossParts):undefined })), buildings: s.buildings.filter(b => distance(p, b) < 65).map(b => ({ ...b, gearItems:this.sim.world.generator===4&&b.creator&&b.creator!==this.owner&&!b.shared?undefined:b.gearItems?structuredClone(b.gearItems):undefined, contents: this.sim.world.generator===4&&b.creator&&b.creator!==this.owner&&!b.shared?{}:{ ...b.contents },cooking:this.sim.world.generator===4&&b.creator&&b.creator!==this.owner&&!b.shared?[]:b.cooking })), environment: this.sim.world.generator===4?adventureEnvironment(s.seconds,p):s.meadows&&s.enemies.some(e=>e.boss&&e.health>0)?{...environmentAt(s.seconds,1),daylight:.08,weather:'cloud'}:environmentAt(s.seconds, s.meadows?1:biome.tier), generator: this.sim.world.generator, biome: s.meadows?'verdant':biome.id, objective: this.sim.world.generator===4?adventureObjective(s):s.meadows ? (s.meadows.offered?'雷鹿の加護を得た。角のつるはしで次の旅へ':'草原を探索し、住まいと食事を整えて雷角の主に挑む') : s.defeated.length === 5 ? '五つの地域を攻略しました' : `探索 → 素材を集める → 作業台・装備 → 祭壇で${boss.name}を召喚`, projectiles: this.projectiles.map(v => ({ ...v })), guarding: this.guarding, dodging: this.dodge > 0, attack: this.attack, attackMotion: this.attackMotion, wet: this.sim.fluid.immersion(p, 1.45) > 0.1 };
 }
 static personalSave(state: AdventureSave): AdventureSave {
  // Exclude shared graphs before cloning, not after duplicating the world per member.
  const personal: AdventureSave = {...state, resources: [], enemies: [], buildings: [], defeated: [], unlocked: 1};
  delete personal.gearFlights;delete personal.waterSeeds; delete personal.trialWorld;delete personal.siteWorld;delete personal.exploration;
  if(state.meadows){
   const {worldTiles:_tiles,pendingWaterTiles:_water,raidCenter:_center,raidSpawn:_spawn,raidKind:_kind,...meadows}=state.meadows;
   personal.meadows={...meadows,raid:0,raidAt:2760};
  }
  return structuredClone(personal);
 }
 save(includeWorld = true): AdventureSave { this.gear.assertProjection();return includeWorld ? structuredClone(this.state) : Adventure.personalSave(this.state); }
}
