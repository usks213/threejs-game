import {GEAR_LIMITS} from '../game/equipment/items';
import {validateAdventureGear} from '../game/equipment/validation';
import {validateRace} from '../game/trail-race';
import {validateExploration} from '../game/adventure-exploration';
import {validateSiteWorld,validSiteJournal,siteId} from '../game/site-state';
import { FOODS, ARMOR, COOKING } from '../content/meadows/data';
import type { AdventureSave } from '../game/types';
import { BIOMES, BOSSES, BUILDINGS, ENEMIES, ITEM_NAMES } from '../content/catalog';
import { finiteVec, insideBounds, WORLD } from '../world/types';
export function validateAdventure(raw: AdventureSave): AdventureSave {
 const s = raw;
 const finite = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
 const items = (v: Record<string, number>) => v && typeof v === 'object' && Object.entries(v).every(([id, n]) => Object.hasOwn(ITEM_NAMES,id) && Number.isSafeInteger(n) && n >= 0 && n <= 100000000);
 if (!s || !finite(s.seconds, 1e10) || !finite(s.health, 500) || !finite(s.stamina, 500) || !finite(s.mana, 70) || !items(s.inventory) || ![...Object.keys(ITEM_NAMES), 'hands'].includes(s.equipment) || !Number.isInteger(s.unlocked) || s.unlocked < 1 || s.unlocked > 5 || !finite(s.food, 10000) || !finite(s.rested, 10000)) throw new Error('冒険セーブの値が不正です');
 if(s.exploration)validateExploration(s.exploration);
 if(s.siteWorld)validateSiteWorld(s.siteWorld);if(s.siteJournal&&!validSiteJournal(s.siteJournal))throw new Error('探索記録が不正です');
 if(s.trialWorld){const t=s.trialWorld,ids=(v:unknown):v is number[]=>Array.isArray(v)&&v.length<=7&&new Set(v).size===v.length&&v.every(n=>Number.isInteger(n)&&n>=825001&&n<=825007);if(t.version!==1||!ids(t.completed)||!ids(t.evidence)||!t.epochs||typeof t.epochs!=='object'||Array.isArray(t.epochs)||Object.keys(t.epochs).length>7||Object.entries(t.epochs).some(([id,n])=>!/^82500[1-7]$/.test(id)||!Number.isSafeInteger(n)||n<0||n>1000000))throw new Error('試練の保存が不正です');}
 if(s.trialJournal&&(!Array.isArray(s.trialJournal)||s.trialJournal.length>7||new Set(s.trialJournal).size!==s.trialJournal.length||s.trialJournal.some(n=>!Number.isInteger(n)||n<825001||n>825007)))throw new Error('依頼帳が不正です');
 if(s.race){s.race=validateRace(s.race);if(s.race.run&&s.race.run.started>s.seconds)throw Error('競走の開始時刻が不正です');}
 if (s.downed !== undefined && (!finite(s.downed,20) || s.downed <= 0 || s.health !== 0)) throw new Error('救助待ち保存が不正です');
 if (!Array.isArray(s.defeated) || s.defeated.length > BOSSES.length || new Set(s.defeated).size !== s.defeated.length || s.defeated.some(id => !BOSSES.some(b => b.id === id))) throw new Error('攻略データが不正です');
 if ((s.death && !insideBounds(s.death, WORLD, 1)) || (s.spawn && !insideBounds(s.spawn, WORLD, 1))) throw new Error('復活位置が不正です');
 for (const list of [s.resources, s.enemies, s.buildings]) if (!Array.isArray(list) || list.length > 100000 || new Set(list.map(v => v.id)).size !== list.length || list.some(v => !insideBounds(v, WORLD, 1) || !Number.isSafeInteger(v.id) || v.id < 1)) throw new Error('ワールド物体が不正です');
 for (const n of s.resources) if (!Object.hasOwn(ITEM_NAMES,n.kind) || !finite(n.amount, n.gearItems!==undefined?GEAR_LIMITS.count:100) || !finite(n.ready, 1e10)) throw new Error('資源データが不正です');
 for(const n of s.resources){if(n.swimming&&![n.swimming.homeX,n.swimming.homeZ,n.swimming.heading].every(Number.isFinite))throw new Error('魚の状態が不正です');if(n.growth&&(!['beech','birch','oak'].includes(n.growth.kind)||!finite(n.growth.remaining,8001)))throw new Error('苗木の状態が不正です');if(n.health!==undefined&&!Number.isFinite(n.health))throw new Error('資源の体力が不正です');if(n.spawnTimer!==undefined&&!Number.isFinite(n.spawnTimer))throw new Error('巣の時間が不正です');}
 for(const n of s.resources)if(n.log){const l=n.log;if(!finite(l.length,5)||!finite(l.fall,3)||!Number.isFinite(l.heading)||!Array.isArray(l.hits)||!['wood','finewood'].includes(l.wood)||[l.a,l.b].some(b=>!b||!insideBounds(b.position,WORLD,0)||!finiteVec(b.velocity)))throw new Error('倒木の状態が不正です');}
 for(const e of s.enemies)if(e.homeY!==undefined&&(!Number.isFinite(e.homeY)||e.homeY<WORLD.minY||e.homeY>WORLD.maxY))throw new Error('敵の帰還高度が不正です');
 for (const e of s.enemies) if (!(e.boss ? BOSSES : ENEMIES).some(d => d.id === e.definition) || !Number.isInteger(e.tier) || e.tier < 1 || e.tier > BIOMES.length || !Number.isFinite(e.health) || Math.abs(e.health) > 10000 || (!Number.isFinite(e.windup) || e.windup < -1 / 30 || e.windup > 10) || !finite(e.slow, 10) || !Number.isFinite(e.cooldown) || Math.abs(e.cooldown) > 1e10 || !finiteVec({ x: e.homeX, y: 0, z: e.homeZ })) throw new Error('敵データが不正です');
 for (const b of s.buildings) if (!BUILDINGS.some(d => d.id === b.definition) || !finite(b.support, 10) || !Number.isFinite(b.rotation) || !items(b.contents)) throw new Error('建築データが不正です');
 if ((s.poison !== undefined && !finite(s.poison, 60)) || (s.chill !== undefined && !finite(s.chill, 60)) || (s.grave !== undefined && !items(s.grave))) throw new Error('状態異常・墓標データが不正です');
 if(s.waterSeeds && (!Array.isArray(s.waterSeeds) || s.waterSeeds.length>5 || s.waterSeeds.some(id=>!BIOMES.some(b=>b.id===id))))throw new Error('自然水域データが不正です');
 if(s.meadows){
 const m=s.meadows;
 if(m.slotLimit!==undefined&&(!Number.isInteger(m.slotLimit)||m.slotLimit<32||m.slotLimit>44||m.slotLimit%4!==0))throw Error('所持枠の上限が不正です');
 if(m.raidKind&&!['animals','forest'].includes(m.raidKind)||m.raidCenter&&!insideBounds({x:m.raidCenter.x,y:0,z:m.raidCenter.z},WORLD))throw new Error('襲撃の記録が不正です');
 if(m.fishing){const f=m.fishing;if(!Number.isSafeInteger(f.fish)||!['waiting','bite','fight'].includes(f.phase)||![f.time,f.progress,f.strain].every(n=>finite(n,10000)))throw new Error('釣りの状態が不正です');}
 if(m.slots&&(!Array.isArray(m.slots)||m.slots.length!==(m.slotLimit??32)||m.slots.some(s=>s&&(!Object.hasOwn(ITEM_NAMES,s.id)||!Number.isInteger(s.count)||s.count<1||s.count>999))))throw new Error('持ち物の並びが不正です');
 if(m.pins&&(!Array.isArray(m.pins)||m.pins.length>100||m.pins.some(p=>!Number.isSafeInteger(p.id)||!insideBounds({x:p.x,y:p.y??0,z:p.z},WORLD)||typeof p.label!=='string'||p.label.length>24)))throw new Error('地図の目印が不正です');
 if(m.version!==1||!Array.isArray(m.foods)||m.foods.length>3||new Set(m.foods.map(f=>f.id)).size!==m.foods.length||m.foods.some(f=>!FOODS[f.id]||!finite(f.remaining,10000)))throw new Error('食事データが不正です');
 for(const record of [m.durability,m.quality,m.skills])if(!record||Object.values(record).some(n=>!finite(n,100000)))throw new Error('装備・熟練度が不正です');
 for(const n of [m.power,m.powerCooldown,m.wet,m.comfort,m.weight,m.raid,m.raidAt,m.tutorial])if(!finite(n,1e10))throw new Error('草原の状態が不正です');
 if(!Array.isArray(m.discovered)||m.discovered.some(id=>!Object.hasOwn(ITEM_NAMES,id))||!m.gear||Object.values(m.gear).some(id=>!ARMOR[id]&&!['shield','towerShield'].includes(id)))throw new Error('草原の装備記録が不正です');
 }
 for(const e of s.enemies){if(e.attackReady&&Object.values(e.attackReady).some(v=>!finite(v,1e10)))throw new Error('敵の攻撃時間が不正です');if(e.attackYaw!==undefined&&!Number.isFinite(e.attackYaw))throw new Error('敵の向きが不正です');}
 for(const e of s.enemies)for(const value of [e.stars,e.tame,e.fed,e.baby,e.breeding,e.burn,e.alerted,e.attackFlash,e.stagger])if(value!==undefined&&!finite(value,100000))throw new Error('生物の状態が不正です');
 for(const b of s.buildings){if(b.site!==undefined&&(!siteId(b.site)||Object.values(b.salvage??{}).some(n=>n!==0)))throw new Error('遺構の保存が不正です');if((b.creator!==undefined&&(typeof b.creator!=='string'||! /^[a-zA-Z0-9_-]{1,64}$/.test(b.creator)||['__proto__','constructor','prototype'].includes(b.creator)))||(b.shared!==undefined&&typeof b.shared!=='boolean'))throw new Error('建築の権限が不正です');if(b.salvage&&!items(b.salvage))throw new Error('建築素材の残量が不正です');for(const value of [b.health,b.fuel,b.progress])if(value!==undefined&&!finite(value,1e10))throw new Error('設備の状態が不正です');if(b.cooking&&(!Array.isArray(b.cooking)||b.cooking.length>2||b.cooking.some(c=>!COOKING[c.id]||!finite(c.time,1e10))))throw new Error('調理状態が不正です');}
 if(s.meadows){const m=s.meadows;for(const value of [m.resting,m.raidSpawn,m.noSkillDrain,m.corpseRun,m.contentVersion,m.kills,m.riding])if(value!==undefined&&!finite(value,1e10))throw new Error('草原の進行値が不正です');for(const [cells,pattern]of [[m.mapCells,/^(?:(?:surface|sky|depths):)?-?\d+,-?\d+$/],[m.worldTiles,/^-?\d+,-?\d+$/]]as const)if(cells&&(!Array.isArray(cells)||cells.length>100000||cells.some(c=>typeof c!=='string'||!pattern.test(c))))throw new Error('地図の記録が不正です');}
 if(s.meadows?.pendingWaterTiles){const jobs=s.meadows.pendingWaterTiles;if(!Array.isArray(jobs)||jobs.length>3481||jobs.some(j=>!j||!Number.isInteger(j.x)||Math.abs(j.x)>29||!Number.isInteger(j.z)||Math.abs(j.z)>29||!Number.isInteger(j.column)||j.column<0||j.column>=4096)||new Set(jobs.map(j=>j.x+','+j.z)).size!==jobs.length)throw new Error('水の生成記録が不正です');}
 for(const g of s.meadows?.graves??[])if(!insideBounds(g,WORLD,1)||!items(g.items))throw new Error('墓の状態が不正です');
 for(const o of [...s.resources,...s.buildings])if(o.removed&&(!Array.isArray(o.removed)||o.removed.length>100000||new Set(o.removed).size!==o.removed.length||o.removed.some(key=>typeof key!=='string'||!/^[-0-9]+,[-0-9]+,[-0-9]+$/.test(key))))throw new Error('Voxelの破壊記録が不正です');
 for(const n of s.resources)if(n.drop!==undefined&&(typeof n.drop!=='boolean'||n.velocity&&(!finiteVec(n.velocity)||Math.hypot(n.velocity.x,n.velocity.y,n.velocity.z)>30)))throw new Error('ドロップの状態が不正です');
 const copy = structuredClone(s);validateAdventureGear(copy);if(s.siteWorld)copy.siteWorld=validateSiteWorld(s.siteWorld);
 // Earlier versions saved the last windup tick just below zero.
 for (const enemy of copy.enemies){enemy.windup = Math.max(0, enemy.windup);}if(s.exploration)copy.exploration=validateExploration(s.exploration);
 return copy;
}

