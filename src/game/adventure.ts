import { populateMeadowTiles } from './meadows/exploration';
import { surfaceHeight } from './meadows/building-shapes';
import { stepStag } from './meadows/boss';
import { reconcileCreature, sees } from './meadows/obstacles';
import { MeadowRules } from './meadows/rules';
import { foodStats, newMeadows, learn } from './meadows/state';
import { seedMeadows } from './meadows/world';
import { TREE_KINDS } from '../content/meadows/data';
import { placementPoint, placementIssue } from './placement';
import { bossAttack, directedShot } from './bosses';
import { BIOMES, BOSSES, BUILDINGS, ENEMIES, ITEM_NAMES, RECIPES, SPELLS, WEAPONS, biomeAt } from '../content/catalog';
import { environmentAt } from '../environment/time';
import type { GameSimulation } from '../simulation/game-simulation';
import type { Vec3 } from '../world/types';
import type { AdventureSave, AdventureSnapshot, GameAction, EnemyState, Projectile } from './types';
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
export class Adventure {
 readonly state: AdventureSave;
 readonly meadowRules = new MeadowRules(this);
 owner = 'host';
 private fallPeak:number|null=null;
 private readonly charges = new Map<number,{x:number;z:number;seconds:number}>();
 projectiles: Projectile[] = [];
 guarding = false; dodge = 0; attack = 0; private cast = 0; private tiles = new Set<number>(); private dodgeX = 0; private dodgeZ = 0; private hurt = 0; private respawn = 0; private portalCooldown = 0; private poisonTick = 0;
 constructor(readonly sim: GameSimulation, saved?: AdventureSave) {
  this.state = saved ?? { seconds: 0, health: 100, stamina: 100, mana: 70, inventory: { berry: 3 }, equipment: 'hands', unlocked: 1, defeated: [], resources: [], enemies: [], buildings: [], death: null, food: 0, rested: 0, spawn: null, meadows:newMeadows() };
  if (!saved&&sim.world.generator===3) { this.state.health=25;this.state.stamina=50;this.state.inventory={ragTunic:1};seedMeadows(sim,this.state);return; }
  if(!saved)delete this.state.meadows;
  if (!saved) for (const biome of BIOMES) {
   for (let i = 0; i < 36; i++) { const angle = i * 2.399, radius = 8 + i % 9 * 2.5, x = biome.center.x + Math.sin(angle) * radius, z = biome.center.z + Math.cos(angle) * radius + (i === 0 ? 2.2 : 0);
    this.state.resources.push({ id: biome.tier * 100 + i, x, z, y: sim.groundAt(x, z), kind: i % 4 === 0 ? 'berry' : i % 3 === 0 ? biome.resource : i % 3 === 1 ? 'wood' : 'stone', amount: i % 3 === 1 ? 3 : 2, ready: 0 }); }
   for (let i = 0; i < 8; i++) { const angle = i * 2.399, x = biome.center.x + Math.sin(angle) * (20 + i * 1.5), z = biome.center.z + Math.cos(angle) * (20 + i * 1.5); this.state.enemies.push(this.enemy(biome.tier * 1000 + i, ENEMIES[i % ENEMIES.length].id, biome.tier, x, z)); }
  }
 }
 private enemy(id: number, definition: string, tier: number, x: number, z: number, boss = false): EnemyState {
  const def = boss ? BOSSES.find(b => b.id === definition)! : ENEMIES.find(e => e.id === definition)!;
  return { id, definition, tier, x, z, y: this.sim.groundAt(x, z), homeX: x, homeZ: z, health: def.health * (boss ? 1 : 1 + (tier - 1) * 0.4), cooldown: 1 + (id % 5) * 0.2, windup: 0, slow: 0, boss };
 }
 private populate(p = this.sim.player): void {
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
   this.state.enemies.push(this.enemy(2000000 + tile, ENEMIES[tile % ENEMIES.length].id, biome.tier, center.x, center.z));
  }
 }
 private grant(id: string, amount: number): void { this.state.inventory[id] = (this.state.inventory[id] ?? 0) + amount; }
 private spend(cost: Record<string, number>): void {
  for (const [id, amount] of Object.entries(cost)) if ((this.state.inventory[id] ?? 0) < amount) throw new Error(`${ITEM_NAMES[id] ?? id}が${amount}個必要です`);
  for (const [id, amount] of Object.entries(cost)) this.state.inventory[id] -= amount;
 }
 private stamina(amount: number): void { if (this.state.stamina < amount) throw new Error('スタミナが足りません'); this.state.stamina -= amount; }
 private hit(enemy: EnemyState, damage: number, element: string): void {
  const def = ENEMIES.find(d => d.id === enemy.definition);
  if(this.state.meadows)damage*=1+(this.state.meadows.skills[this.state.equipment]??0)*.005;
  enemy.health -= damage * (def?.resistance === element ? 0.65 : 1);
  enemy.slow = Math.max(enemy.slow, element === 'frost' ? 3 : 0.25);
  if (enemy.health <= 0) {
   if (!enemy.boss) enemy.respawnAt = this.state.seconds + 120;
   if(this.state.meadows){if(enemy.boss){this.meadowRules.grant('hardAntler',3);this.meadowRules.grant('stormTrophy',1);if(!this.state.defeated.includes(enemy.definition))this.state.defeated.push(enemy.definition);}else this.meadowRules.loot(enemy.definition,enemy.stars??0);return;}
   this.grant('fang', enemy.boss ? 8 : 1); this.grant('resin', enemy.boss ? 5 : 1);
   if (enemy.boss && !this.state.defeated.includes(enemy.definition)) { this.state.defeated.push(enemy.definition); this.state.unlocked = Math.min(5, Math.max(this.state.unlocked, enemy.tier + 1)); this.sim.adventure.state.unlocked = this.state.unlocked; this.grant(BOSSES.find(b => b.id === enemy.definition)!.reward, 4); }
  }
 }
 hurtPlayer(amount: number, element: string, player = this.sim.player, source?:Vec3): void {
  if (this.hurt > 0 || this.dodge > 0 || this.state.health <= 0) return;
  const shield=this.state.inventory.towerShield?'towerShield':this.state.inventory.shield?'shield':'';
  const facing=!source||((source.x-player.x)*Math.sin(player.heading)+(source.z-player.z)*Math.cos(player.heading))>=0;
  if(this.guarding&&shield&&facing&&(!this.state.meadows||this.state.meadows.durability[shield]!==0)){
   const cost=amount*.4,parry=shield==='shield'&&this.attack>.05;
   if(this.state.stamina>=cost){this.state.stamina-=cost;const q=this.state.meadows?.quality[shield]??1,block=(shield==='shield'?6+6*(q-1):10+6*(q-1))*(parry?1.5:1);amount=Math.max(0,amount-block);}
   else{this.state.stamina=0;this.guarding=false;}
   if(this.state.meadows){learn(this.state,'blocking',.2);this.meadowRules.wear(shield);}
  }
  if(this.state.meadows)amount=this.meadowRules.damage(amount);
  const armor = !this.state.meadows&&this.state.inventory.armor ? 0.75 : 1;
  if (element === 'poison') this.state.poison = 8; if (element === 'frost') this.state.chill = 5;
  this.state.health = Math.max(0, this.state.health - amount * armor * (element === 'frost' && this.state.rested > 0 ? 0.8 : 1)); this.hurt = 0.65;
  if (this.state.health <= 0) {if(this.state.meadows){const m=this.state.meadows;if(!(m.noSkillDrain??0))for(const key of Object.keys(m.skills))m.skills[key]=Math.floor(m.skills[key]*.95);m.noSkillDrain=600;} const p = player;if(this.state.meadows&&this.state.death&&Object.values(this.state.grave??{}).some(n=>n>0)){this.state.meadows.graves??=[];this.state.meadows.graves.push({...this.state.death,items:{...this.state.grave}});}
   this.state.death = { x: p.x, y: p.y, z: p.z }; this.state.stamina = 0; this.respawn = 3; this.state.grave = {}; for (const id of this.state.meadows?Object.keys(this.state.inventory):['wood', 'stone', 'copper', 'iron', 'crystal', 'aether', 'resin', 'fang', 'berry']) { const lost = Math.floor((this.state.inventory[id] ?? 0) * (this.state.meadows?1:0.2)); if (lost) { this.state.grave[id] = lost; this.state.inventory[id] -= lost; } } }
 }
 action(action: GameAction, id = '', target?: Vec3, aim: Vec3 = { x: 0, y: 0, z: -1 }): { dirty: string[]; message: string } {
  const p = this.sim.player, s = this.state, ground = target ?? { x: p.x + aim.x * 2.5, y: p.y, z: p.z + aim.z * 2.5 };
  if (s.health <= 0) throw new Error('復活を待ってください');
  if(s.meadows){const result=this.meadowRules.action(action,id,ground);if(result)return result;}
  if (action === 'gather') {
   if (s.death && distance(p, s.death) < 2.5) { for (const [id, amount] of Object.entries(s.grave ?? {})) this.grant(id, amount); s.grave = {}; s.death = null; s.health = Math.min(foodStats(s).health, s.health + 30); s.stamina = foodStats(s).stamina; return { dirty: [], message: '墓標へ戻りました。体力とスタミナが回復します' }; }
   const nodes = s.resources.filter(n => n.ready <= s.seconds && distance(p, n) < 3).sort((a, b) => distance(p, a) - distance(p, b)), node = nodes[0];
   if (!node) throw new Error('木・石・木の実・鉱脈に近づいてください');
   const tier = biomeAt(node.x, node.z).tier; if (tier > s.unlocked) throw new Error('前の地域のボスを倒して採掘技術を解放してください');
   this.stamina(5); const amount = node.kind === 'wood' && s.inventory.axe ? 3 : node.amount; this.grant(node.kind, amount); if (node.kind === 'wood') { this.grant('resin', 1); this.sim.dropDebris({x:node.x,y:node.y+1.2,z:node.z},'wood',2); } node.ready = s.seconds + 90;
   return { dirty: [], message: `${ITEM_NAMES[node.kind]} +${amount}` };
  }
  if (action === 'craft') {
   const recipe = RECIPES.find(r => r.id === id); if (!recipe || recipe.tier > s.unlocked) throw new Error('未解放のレシピです');
   if (recipe.station && !s.buildings.some(b => b.definition === 'bench' && distance(p, b) < 5)) throw new Error('作業台の近くで作ってください');
   this.spend(recipe.cost); this.grant(recipe.output, recipe.amount); if (WEAPONS[id]) s.equipment = id;
   return { dirty: [], message: `${recipe.name}を作りました` };
  }
  if (action === 'equip') { if (!(s.inventory[id] > 0) || !WEAPONS[id]) throw new Error('その装備は持っていません'); s.equipment = id; return { dirty: [], message: `${ITEM_NAMES[id]}を装備` }; }
  if (action === 'eat') { const food = s.inventory.stew ? 'stew' : 'berry'; this.spend({ [food]: 1 }); s.food = food === 'stew' ? 300 : 90; s.health = Math.min(100, s.health + (food === 'stew' ? 35 : 12)); return { dirty: [], message: '食事で回復。しばらく体力が自然回復します' }; }
  if (action === 'guard') { p.heading=Math.atan2(aim.x,aim.z); this.guarding = !this.guarding; this.attack = 0.25; return { dirty: [], message: this.guarding ? 'ガード中：もう一度押して解除' : 'ガード解除' }; }
  if (action === 'dodge') { if (this.dodge > 0) throw new Error('回避中です'); this.stamina(22); this.dodge = 0.4; this.dodgeX = aim.x; this.dodgeZ = aim.z; this.guarding = false; return { dirty: [], message: '回避' }; }
  if (action === 'attack' || action === 'heavy') {
   p.heading = Math.atan2(aim.x, aim.z);
   if (this.attack > 0) throw new Error('攻撃の回復を待ってください'); const weapon = WEAPONS[s.equipment] ?? WEAPONS.hands, heavy = action === 'heavy';
   if(s.meadows&&s.meadows.durability[s.equipment]===0)throw new Error('装備が壊れています。作業台で修理してください');
   if(s.stamina<weapon.stamina*(heavy?1.8:1))throw new Error('スタミナが足りません');
   if(s.meadows&&weapon.ranged){const arrow=['fireArrow','flintArrow','woodArrow'].find(k=>s.inventory[k]>0);if(!arrow)throw new Error('矢が必要です');this.spend({[arrow]:1});}
   if(s.meadows){this.meadowRules.wear(s.equipment);learn(s,s.equipment,.1);}
   this.stamina(weapon.stamina * (heavy ? 1.8 : 1)); this.attack = weapon.cooldown * (heavy ? 1.8 : 1);
   const damage = weapon.damage * (heavy ? 1.7 : 1)*(1+((s.meadows?.quality[s.equipment]??1)-1)*.2); let hits=0;
   if(s.meadows&&s.equipment==='flintSpear'&&heavy){this.spend({flintSpear:1});s.equipment='hands';this.projectile(aim,damage,'physical',.2);this.projectiles[this.projectiles.length-1].recover='flintSpear';return {dirty:[],message:'槍を投げました。着地点で拾えます'};}
   if (weapon.ranged) { this.projectile(aim, damage, 'physical', 0.15); return { dirty: [], message: '矢を放ちました' }; }
   for (const e of s.enemies) if (e.health > 0 && distance(p, e) < weapon.reach + (heavy ? 0.4 : 0) && Math.abs(e.y - p.y) < 3) {
    const d = distance(p, e); if (d < 1 || ((e.x - p.x) * aim.x + (e.z - p.z) * aim.z) / d > 0.1) {
     this.hit(e, damage, 'physical');hits++;
     if (heavy || damage >= 25) { e.windup = 0; e.cooldown = Math.max(e.cooldown, 0.7); const push = e.boss ? 0.15 : 0.7; e.x += (e.x - p.x) / Math.max(d, 0.01) * push; e.z += (e.z - p.z) / Math.max(d, 0.01) * push; }
    }
   }
   return { dirty: [], message: hits?`命中 · ${Math.round(damage)}${hits>1?' ×'+hits:''}`:action === 'heavy' ? '強攻撃' : '攻撃' };
  }
  if (action === 'spell') {
   p.heading = Math.atan2(aim.x, aim.z);
   const spell = SPELLS.find(v => v.id === id); if (!spell) throw new Error('未知の魔法です'); if (!s.inventory.staff && !s.inventory.book) throw new Error('杖を作ると魔法が使えます');
   if (this.cast > 0 || s.mana < spell.mana) throw new Error('魔力不足、または詠唱の回復中です'); s.mana -= spell.mana; this.cast = spell.cooldown;
   let dirty: string[] = [];
   if (id === 'mend') s.health = Math.min(100, s.health + 35);
   else if (id === 'quake' || id === 'raise') dirty = this.sim.editGround(id === 'raise' ? 'add' : 'dig', ground, 2.3);
   else this.projectile(aim, spell.damage, spell.element, 0.4);
   if (id === 'quake') for (const b of this.sim.bodies) if (distance(b.position, ground) < 5) { b.sleeping = false; b.velocity.y += 4; }
   return { dirty, message: spell.name };
  }
  if (action === 'build') {
   const def = BUILDINGS.find(b => b.id === id); if (!def || distance(p, ground) > 7) throw new Error('近くに設置してください');
   const {x,y,z}=ground;if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||Math.abs(y-p.y)>7)throw new Error('近くに設置してください');
   const issue=placementIssue(def,p,{x,y,z},s.buildings,s.inventory);if(issue)throw new Error(issue);
   if (Math.hypot(x - p.x, z - p.z) < 1.1 && Math.abs(y - p.y) < 1.8) throw new Error('自分の体から少し離して設置してください');
   if (s.buildings.some(b => Math.hypot(b.x - x, b.y - y, b.z - z) < 0.6)) throw new Error('同じ場所には設置できません');
   this.spend(def.cost); s.buildings.push({ id: this.sim.allocateEntityId(), definition: id, x, y, z, rotation: Math.atan2(aim.x, aim.z), support: def.support, contents: {}, ...(s.meadows?{health:100,fuel:id==='fire'?300:0}:{}) });
   this.support(); return { dirty: [], message: `${def.name}を設置。支持がないものは崩れます` };
  }
  if (action === 'remove') {
   const b = s.buildings.filter(b => distance(p, b) < 4).sort((a, b) => distance(p, a) - distance(p, b))[0]; if (!b) throw new Error('建築物に近づいてください');
   s.buildings = s.buildings.filter(v => v.id !== b.id); for (const [material, amount] of Object.entries(BUILDINGS.find(v => v.id === b.definition)!.cost)) this.grant(material, amount); this.support(); return { dirty: [], message: '解体して素材を回収しました' };
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
  if (action === 'chest') { const chest = s.buildings.find(b => b.definition === 'chest' && distance(p, b) < 3); if (!chest) throw new Error('箱に近づいてください'); if (Object.values(chest.contents).some(v => v > 0)) { for (const [material, amount] of Object.entries(chest.contents)) this.grant(material, amount); chest.contents = {}; return { dirty: [], message: '箱の素材を取り出しました' }; } for (const material of ['wood', 'stone', 'copper', 'iron', 'crystal', 'aether']) { const amount = s.inventory[material] ?? 0; if (amount) { chest.contents[material] = amount; s.inventory[material] = 0; } } return { dirty: [], message: '素材を箱へ預けました' }; }
  throw new Error('未知のゲーム操作です');
 }
 private projectile(aim: Vec3, damage: number, element: string, radius: number): void { const p = this.sim.player;
  const target = this.state.enemies.filter(e => e.health > 0 && distance(p,e) < 25 && ((e.x-p.x)*aim.x+(e.z-p.z)*aim.z)/Math.max(0.01,distance(p,e)) > 0.65).sort((a,b)=>distance(p,a)-distance(p,b))[0];
  if (target) { const dx=target.x-p.x, dy=target.y+(target.boss?1.7:0.6)-p.y-1, dz=target.z-p.z, length=Math.hypot(dx,dy,dz); aim={x:dx/length,y:dy/length,z:dz/length}; }
  this.projectiles.push({ id: this.sim.allocateEntityId(), owner: this.owner, x: p.x, y: p.y + 1, z: p.z, vx: aim.x * 12, vy: aim.y * 12, vz: aim.z * 12, life: 2.5, damage, element, radius }); }
 support(): void {
  const buildings = this.state.buildings;
  for (const b of buildings) b.support = b.definition==='raft'?4: this.sim.world.density({ x: b.x, y: b.y - 0.15, z: b.z }) < 0.2 ? BUILDINGS.find(d => d.id === b.definition)!.support : 0;
  for (let pass = 0; pass < 8; pass++) for (const b of buildings) for (const other of buildings) if (b !== other && Math.abs(b.x - other.x) <= 2.2 && Math.abs(b.z - other.z) <= 2.2 && Math.abs(b.y - other.y) <= 2.2) b.support = Math.max(b.support, other.support - 1);
  for (const b of buildings.filter(b => b.support <= 0)) { this.sim.dropDebris({x:b.x,y:b.y+0.5,z:b.z},'debris',2); for (const [id, amount] of Object.entries(BUILDINGS.find(d => d.id === b.definition)!.cost)) this.grant(id, Math.max(1, Math.floor(amount / 2))); }
  this.state.buildings = buildings.filter(b => b.support > 0);
 }
 collidePlayer(previousY: number): void {
  const p = this.sim.player;
  for (const b of this.state.buildings) {
   const def = BUILDINGS.find(d => d.id === b.definition)!;
   if (b.definition === 'portal' || b.definition === 'fire' || b.definition === 'cook' || ((b.definition==='door'||b.definition==='gate')&&b.open)) continue;
   const cos = Math.cos(b.rotation), sin = Math.sin(b.rotation), dx = p.x - b.x, dz = p.z - b.z, x = dx * cos - dz * sin, z = dx * sin + dz * cos;
   const rx = def.size[0] / 2 + 0.3, rz = def.size[2] / 2 + 0.3, surface=surfaceHeight(b,Math.max(-1,Math.min(1,x)),Math.max(-1,Math.min(1,z))),top = surface??b.y + def.size[1],bottom=surface!==null&&!['stairs','ladder'].includes(b.definition)?surface-.22:b.y;
   if (Math.abs(x) >= rx || Math.abs(z) >= rz || p.y > top + 0.18 || p.y + 1.45 < bottom) continue;
   if (p.vy <= 0 && previousY >= top - (['stairs','ladder'].includes(b.definition)?.45:.15)) { p.y = top; p.vy = 0; p.grounded = true; }
   else { let nx = x, nz = z; if (rx - Math.abs(x) < rz - Math.abs(z)) nx = Math.sign(x || 1) * rx; else nz = Math.sign(z || 1) * rz; p.x = b.x + nx * cos + nz * sin; p.z = b.z - nx * sin + nz * cos; }
  }
  for (const n of this.state.resources) if (((!this.state.meadows&&n.kind === 'wood')||TREE_KINDS.has(n.kind)) && n.ready <= this.state.seconds && Math.abs(p.y - n.y) < 3) {
   const d = distance(p, n); if (d < 0.47) { const dx = p.x - n.x, dz = p.z - n.z; p.x = n.x + (d ? dx / d : 1) * 0.47; p.z = n.z + (d ? dz / d : 0) * 0.47; }
  }
 }
 stepPersonal(dt: number): void {
  const s = this.state, p = this.sim.player; s.seconds += dt; this.attack = Math.max(0, this.attack - dt); this.cast = Math.max(0, this.cast - dt); this.hurt = Math.max(0, this.hurt - dt); this.dodge = Math.max(0, this.dodge - dt);
  this.portalCooldown = Math.max(0, this.portalCooldown - dt);
  s.poison = Math.max(0, (s.poison ?? 0) - dt); s.chill = Math.max(0, (s.chill ?? 0) - dt);
  if (s.poison > 0 && s.health > 0) { this.poisonTick += dt; if (this.poisonTick >= 1) { this.poisonTick = 0; this.hurtPlayer(2, 'physical'); } } else this.poisonTick = 0;
  s.food = Math.max(0, s.food - dt); s.rested = Math.max(0, s.rested - dt); s.stamina = Math.min(foodStats(s).stamina, s.stamina + dt * (s.meadows?.exerting?0:this.guarding ? 3 : s.rested ? 20 : 12)*(s.meadows?.cold?.5:1)*(s.meadows?.wet?.75:1)); s.mana = Math.min(70, s.mana + dt * 6);
  if (s.health <= 0) { this.respawn -= dt; if (this.respawn <= 0) { this.sim.resetPlayer(); if (s.spawn) Object.assign(p, s.spawn); s.health = s.meadows?25:70; s.stamina = foodStats(s).stamina; if(s.meadows)s.equipment='hands'; } return; }
  if(s.meadows){if(!p.grounded)this.fallPeak=Math.max(this.fallPeak??p.y,p.y);else if(this.fallPeak!==null){const fall=this.fallPeak-p.y;this.fallPeak=null;if(fall>4&&this.sim.fluid.immersion(p,1.45)<.3)this.hurtPlayer(Math.min(100,(fall-4)*8),'physical');}this.meadowRules.step(dt);}
  if (!s.meadows&&s.food > 0) s.health = Math.min(100, s.health + dt * 0.8);
  if (this.dodge > 0) this.sim.movePlayer(this.dodgeX * 8 * dt, this.dodgeZ * 8 * dt);
 }
 private closestActor(point: Vec3): { player: import('../simulation/protocol').PlayerState; adventure: Adventure } | undefined {
  let nearest: { player: import('../simulation/protocol').PlayerState; adventure: Adventure } | undefined;
  let length = Infinity;
  const targets = this.sim.targets.length ? this.sim.targets : [{ player: this.sim.player, adventure: this }];
  for (const candidate of targets) if (candidate.adventure.state.health > 0) {
   const d = distance(candidate.player, point); if (d < length) { length = d; nearest = candidate; }
  }
  return nearest;
 }
 step(dt: number): void {
  if (this.sim.targets.length) for (const target of this.sim.targets) this.populate(target.player); else this.populate();
  this.stepPersonal(dt);
  const s = this.state;
  if (s.health <= 0 && !this.sim.targets.some(t => t.adventure.state.health > 0)) return;
  for (const e of s.enemies) {
   const target = this.closestActor(e); if (!target) continue;
   const p = target.player,previousEnemy={x:e.x,y:e.y,z:e.z};
   if (e.health <= 0 && !e.boss && e.respawnAt && e.respawnAt <= s.seconds) { const def = ENEMIES.find(d => d.id === e.definition)!; e.health = def.health * (1 + (e.stars??0)) * (1 + (e.tier - 1) * 0.4); e.x = e.homeX; e.z = e.homeZ; e.cooldown = 3; }
   if (e.health <= 0 || distance(p, e) > 45) continue;
   if(s.meadows&&e.boss&&e.definition==='stormstag'){stepStag(this,e,dt);continue;}
   const def = e.boss ? BOSSES.find(d => d.id === e.definition)! : ENEMIES.find(d => d.id === e.definition)!;
   const d = distance(p, e), reach = e.boss ? 3.3 : (def as typeof ENEMIES[number]).reach, speed = e.boss ? (e.health < def.health / 2 ? 2.3 : 1.4) : (def as typeof ENEMIES[number]).speed;
   e.slow = Math.max(0, e.slow - dt); e.cooldown -= dt;
   const passive=def.damage===0||(e.tame??0)>=1;
   const fire=['boar','deer','greyling','greydwarf'].includes(e.definition)&&s.buildings.find(b=>b.definition==='fire'&&(b.fuel??0)>0&&!b.open&&distance(b,e)<6);
   if(s.meadows&&(passive||fire)){if((d<(target.adventure.state.meadows?.sneaking?3:9)&&passive&&(e.tame??0)<1&&sees(this.sim,e,p))||fire){const threat=fire||p,away=Math.max(.1,distance(e,threat));e.x+=(e.x-threat.x)/away*speed*dt;e.z+=(e.z-threat.z)/away*speed*dt;}const wet=this.sim.fluid.immersion(e,1),current=this.sim.fluid.current(e,1);e.x+=current.x*wet*dt;e.z+=current.z*wet*dt;e.y=this.sim.groundAt(e.x,e.z);reconcileCreature(this.sim,e,previousEnemy);continue;}
   if (d < (e.boss ? 25 : environmentAt(s.seconds).daylight < 0.2 ? 15 : 10) && d > reach) { e.x += (p.x - e.x) / d * speed * dt * (e.slow ? 0.4 : 1); e.z += (p.z - e.z) / d * speed * dt * (e.slow ? 0.4 : 1); }
   const water = this.sim.fluid.immersion(e, e.boss ? 2.4 : 1.2), flow = this.sim.fluid.current(e, e.boss ? 2.4 : 1.2);
   if (water > 0) {
    const carry = Math.min(1, water * 3) * (e.boss ? 0.3 : 1);
    const nx = e.x + flow.x * carry * dt, nz = e.z + flow.z * carry * dt;
    if (this.sim.world.density({ x:nx, y:e.y+0.65, z:nz }) > 0.1) { e.x=nx; e.z=nz; }
    e.slow = Math.max(e.slow, water * 0.5);
   }
   e.y = this.sim.groundAt(e.x, e.z);if(s.meadows)reconcileCreature(this.sim,e,previousEnemy);
   if (e.boss) {
    const ability = bossAttack(e.definition, e.health < def.health / 2, e.attackKind), charge = this.charges.get(e.id);
    if (charge) {
     const length=Math.hypot(charge.x,charge.z); e.x+=charge.x/Math.max(length,0.01)*12*dt; e.z+=charge.z/Math.max(length,0.01)*12*dt; charge.seconds-=dt;
     for(const actor of this.sim.targets.length?this.sim.targets:[{player:this.sim.player,adventure:this}])if(distance(actor.player,e)<2.6)actor.adventure.hurtPlayer(def.damage,def.element,actor.player);
     if(charge.seconds<=0)this.charges.delete(e.id);
    } else if (e.windup > 0) {
     e.windup = Math.max(0, e.windup - dt);
     if (e.windup <= 0) {
      if (ability.charge) this.charges.set(e.id,{x:p.x-e.x,z:p.z-e.z,seconds:0.75});
      else if (ability.shots) {
       for(let j=0;j<ability.shots;j++) {
        const from={x:e.x,y:e.y+2,z:e.z},velocity=directedShot(from,{x:p.x,y:p.y+0.7,z:p.z},(j-(ability.shots-1)/2)*0.15);
        this.projectiles.push({id:this.sim.allocateEntityId(),owner:'enemy:'+e.id,...from,vx:velocity.x,vy:velocity.y,vz:velocity.z,life:4,damage:def.damage,element:ability.element,radius:0.35});
       }
       if(e.definition==='frostwing')this.sim.fluid.freeze(e,6);
      } else for(const actor of this.sim.targets.length?this.sim.targets:[{player:this.sim.player,adventure:this}])if(distance(actor.player,e)<ability.radius) {
       actor.adventure.hurtPlayer(def.damage,def.element,actor.player); actor.adventure.state.chill=2;
      }
      e.cooldown=ability.cooldown;
     }
    } else if (d < 25 && e.cooldown <= 0) { if(e.definition==='stormstag')e.attackKind=d>7?'beam':Math.floor(s.seconds/5)%2?'stomp':'antler';e.windup = bossAttack(e.definition,false,e.attackKind).windup; }
    continue;
   }
   if (e.windup > 0) { e.windup = Math.max(0, e.windup - dt); if (e.windup <= 0) { if (d < reach + 0.8) target.adventure.hurtPlayer(def.damage * (1+(e.stars??0)*.5) * (e.boss ? 1 : 1 + (e.tier - 1) * 0.35), def.element, p,e); e.cooldown = e.boss && e.health < def.health / 2 ? 1.2 : 2; } }
   else if (d < reach + 0.4 && e.cooldown <= 0) e.windup = e.boss ? 0.8 : 0.55;
  }
  for (let i = this.projectiles.length - 1; i >= 0; i--) {
   const shot = this.projectiles[i]; shot.life -= dt; shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.z += shot.vz * dt;
   const hostile = shot.owner?.startsWith('enemy:');
   if(hostile) for(const actor of this.sim.targets.length?this.sim.targets:[{player:this.sim.player,adventure:this}])if(Math.hypot(actor.player.x-shot.x,actor.player.y+0.7-shot.y,actor.player.z-shot.z)<shot.radius+0.6){actor.adventure.hurtPlayer(shot.damage,shot.element,actor.player);shot.life=0;}
   const enemy = !hostile && s.enemies.find(e => e.health > 0 && Math.hypot(e.x - shot.x, e.y + (e.boss ? 1.7 : 0.6) - shot.y, e.z - shot.z) < shot.radius + (e.boss ? 1.8 : 0.7));
   if (enemy) { const owner = this.sim.targets.find(t => t.adventure.owner === shot.owner)?.adventure ?? this; owner.hit(enemy, shot.damage, shot.element); shot.life = 0; }
   if (shot.element === 'frost' && (this.sim.fluid.immersion(shot, 0.3) > 0 || this.sim.world.density(shot) <= 0)) { this.sim.fluid.freeze(shot, 3); shot.life = 0; }
   if (shot.life <= 0 || this.sim.world.density(shot) <= 0) {if(shot.recover)s.resources.push({id:this.sim.allocateEntityId(),kind:shot.recover,x:shot.x,y:this.sim.groundAt(shot.x,shot.z),z:shot.z,amount:1,ready:0});this.projectiles.splice(i, 1);}
  }
  if (this.sim.tick % 30 === 0) {
   this.support();
   for (const b of s.buildings) {
    if (b.definition === 'spring') this.sim.fluid.add({x:b.x,y:b.y+1,z:b.z},0.8);
    if (b.definition === 'drain') this.sim.fluid.drain({x:b.x,y:b.y,z:b.z},2);
   }
   const weather = environmentAt(s.seconds, biomeAt(this.sim.player.x, this.sim.player.z).tier).weather;
   if (weather === 'rain' || weather === 'storm') { const x = this.sim.player.x + Math.sin(this.sim.tick * 3.17) * 6, z = this.sim.player.z + Math.cos(this.sim.tick * 5.13) * 6; this.sim.fluid.add({ x, y: this.sim.groundAt(x, z) + 3, z }, weather === 'storm' ? 1 : 0.4); }
  }
 }
 snapshot(): AdventureSnapshot {
  const s = this.state, p = this.sim.player, biome = biomeAt(p.x, p.z), boss = BOSSES.find(b => b.id === biome.boss)!;
  return { ...s, inventory: { ...s.inventory }, resources: s.resources.filter(n => distance(p, n) < 65).map(n => ({ ...n })), enemies: s.enemies.filter(e => distance(p, e) < 65).map(e => ({ ...e })), buildings: s.buildings.filter(b => distance(p, b) < 65).map(b => ({ ...b, contents: { ...b.contents } })), environment: s.meadows&&s.enemies.some(e=>e.boss&&e.health>0)?{...environmentAt(s.seconds,1),daylight:.08,weather:'cloud'}:environmentAt(s.seconds, s.meadows?1:biome.tier), generator: this.sim.world.generator, biome: s.meadows?'verdant':biome.id, objective: s.meadows ? (s.meadows.offered?'雷鹿の加護を得た。角のつるはしで次の旅へ':'草原を探索し、住まいと食事を整えて雷角の主に挑む') : s.defeated.length === 5 ? '五つの地域を攻略しました' : `探索 → 素材を集める → 作業台・装備 → 祭壇で${boss.name}を召喚`, projectiles: this.projectiles.map(v => ({ ...v })), guarding: this.guarding, dodging: this.dodge > 0, attack: this.attack, wet: this.sim.fluid.immersion(p, 1.45) > 0.1 };
 }
 save(): AdventureSave { return structuredClone(this.state); }
}

