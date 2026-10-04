import { FOODS, ARMOR, COOKING } from '../content/meadows/data';
import type { AdventureSave } from '../game/types';
import { BIOMES, BOSSES, BUILDINGS, ENEMIES, ITEM_NAMES } from '../content/catalog';
import { finiteVec, insideBounds, WORLD } from '../world/types';
export function validateAdventure(raw: AdventureSave): AdventureSave {
 const s = raw;
 const finite = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
 const items = (v: Record<string, number>) => v && typeof v === 'object' && Object.entries(v).every(([id, n]) => ITEM_NAMES[id] && Number.isSafeInteger(n) && n >= 0 && n <= 100000000);
 if (!s || !finite(s.seconds, 1e10) || !finite(s.health, 500) || !finite(s.stamina, 500) || !finite(s.mana, 70) || !items(s.inventory) || ![...Object.keys(ITEM_NAMES), 'hands'].includes(s.equipment) || !Number.isInteger(s.unlocked) || s.unlocked < 1 || s.unlocked > 5 || !finite(s.food, 10000) || !finite(s.rested, 10000)) throw new Error('冒険セーブの値が不正です');
 if (!Array.isArray(s.defeated) || s.defeated.length > BOSSES.length || new Set(s.defeated).size !== s.defeated.length || s.defeated.some(id => !BOSSES.some(b => b.id === id))) throw new Error('攻略データが不正です');
 if ((s.death && !insideBounds(s.death, WORLD, 1)) || (s.spawn && !insideBounds(s.spawn, WORLD, 1))) throw new Error('復活位置が不正です');
 for (const list of [s.resources, s.enemies, s.buildings]) if (!Array.isArray(list) || list.length > 100000 || new Set(list.map(v => v.id)).size !== list.length || list.some(v => !insideBounds(v, WORLD, 1) || !Number.isSafeInteger(v.id) || v.id < 1)) throw new Error('ワールド物体が不正です');
 for (const n of s.resources) if (!ITEM_NAMES[n.kind] || !finite(n.amount, 100) || !finite(n.ready, 1e10)) throw new Error('資源データが不正です');
 for(const n of s.resources)if(n.log){const l=n.log;if(!finite(l.length,5)||!finite(l.fall,3)||!Number.isFinite(l.heading)||!Array.isArray(l.hits)||!['wood','finewood'].includes(l.wood)||[l.a,l.b].some(b=>!b||!insideBounds(b.position,WORLD,0)||!finiteVec(b.velocity)))throw new Error('倒木の状態が不正です');}
 for (const e of s.enemies) if (!(e.boss ? BOSSES : ENEMIES).some(d => d.id === e.definition) || !Number.isInteger(e.tier) || e.tier < 1 || e.tier > BIOMES.length || !Number.isFinite(e.health) || Math.abs(e.health) > 10000 || (!Number.isFinite(e.windup) || e.windup < -1 / 30 || e.windup > 10) || !finite(e.slow, 10) || !Number.isFinite(e.cooldown) || Math.abs(e.cooldown) > 1e10 || !finiteVec({ x: e.homeX, y: 0, z: e.homeZ })) throw new Error('敵データが不正です');
 for (const b of s.buildings) if (!BUILDINGS.some(d => d.id === b.definition) || !finite(b.support, 10) || !Number.isFinite(b.rotation) || !items(b.contents)) throw new Error('建築データが不正です');
 if ((s.poison !== undefined && !finite(s.poison, 60)) || (s.chill !== undefined && !finite(s.chill, 60)) || (s.grave !== undefined && !items(s.grave))) throw new Error('状態異常・墓標データが不正です');
 if(s.waterSeeds && (!Array.isArray(s.waterSeeds) || s.waterSeeds.length>5 || s.waterSeeds.some(id=>!BIOMES.some(b=>b.id===id))))throw new Error('自然水域データが不正です');
 if(s.meadows){
 const m=s.meadows;
 if(m.slots&&(!Array.isArray(m.slots)||m.slots.length!==32||m.slots.some(s=>s&&(!ITEM_NAMES[s.id]||!Number.isInteger(s.count)||s.count<1||s.count>999))))throw new Error('持ち物の並びが不正です');
 if(m.pins&&(!Array.isArray(m.pins)||m.pins.length>100||m.pins.some(p=>!Number.isSafeInteger(p.id)||!insideBounds({x:p.x,y:0,z:p.z},WORLD)||typeof p.label!=='string'||p.label.length>24)))throw new Error('地図の目印が不正です');
 if(m.version!==1||!Array.isArray(m.foods)||m.foods.length>3||new Set(m.foods.map(f=>f.id)).size!==m.foods.length||m.foods.some(f=>!FOODS[f.id]||!finite(f.remaining,10000)))throw new Error('食事データが不正です');
 for(const record of [m.durability,m.quality,m.skills])if(!record||Object.values(record).some(n=>!finite(n,100000)))throw new Error('装備・熟練度が不正です');
 for(const n of [m.power,m.powerCooldown,m.wet,m.comfort,m.weight,m.raid,m.raidAt,m.tutorial])if(!finite(n,1e10))throw new Error('草原の状態が不正です');
 if(!Array.isArray(m.discovered)||m.discovered.some(id=>!ITEM_NAMES[id])||!m.gear||Object.values(m.gear).some(id=>!ARMOR[id]))throw new Error('草原の装備記録が不正です');
 }
 for(const e of s.enemies){if(e.attackReady&&Object.values(e.attackReady).some(v=>!finite(v,1e10)))throw new Error('敵の攻撃時間が不正です');if(e.attackYaw!==undefined&&!Number.isFinite(e.attackYaw))throw new Error('敵の向きが不正です');}
 for(const e of s.enemies)for(const value of [e.stars,e.tame,e.fed,e.baby,e.breeding])if(value!==undefined&&!finite(value,100000))throw new Error('生物の状態が不正です');
 for(const b of s.buildings){for(const value of [b.health,b.fuel,b.progress])if(value!==undefined&&!finite(value,1e10))throw new Error('設備の状態が不正です');if(b.cooking&&(!Array.isArray(b.cooking)||b.cooking.length>2||b.cooking.some(c=>!COOKING[c.id]||!finite(c.time,1e10))))throw new Error('調理状態が不正です');}
 for(const g of s.meadows?.graves??[])if(!insideBounds(g,WORLD,1)||!items(g.items))throw new Error('墓の状態が不正です');
 const copy = structuredClone(s);
 // Earlier versions saved the last windup tick just below zero.
 for (const enemy of copy.enemies) enemy.windup = Math.max(0, enemy.windup);
 return copy;
}

