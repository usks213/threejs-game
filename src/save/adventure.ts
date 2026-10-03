import type { AdventureSave } from '../game/types';
import { BIOMES, BOSSES, BUILDINGS, ENEMIES, ITEM_NAMES } from '../content/catalog';
import { finiteVec, insideBounds, WORLD } from '../world/types';
export function validateAdventure(raw: AdventureSave): AdventureSave {
 const s = raw;
 const finite = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
 const items = (v: Record<string, number>) => v && typeof v === 'object' && Object.entries(v).every(([id, n]) => ITEM_NAMES[id] && Number.isSafeInteger(n) && n >= 0 && n <= 100000000);
 if (!s || !finite(s.seconds, 1e10) || !finite(s.health, 100) || !finite(s.stamina, 100) || !finite(s.mana, 70) || !items(s.inventory) || ![...Object.keys(ITEM_NAMES), 'hands'].includes(s.equipment) || !Number.isInteger(s.unlocked) || s.unlocked < 1 || s.unlocked > 5 || !finite(s.food, 10000) || !finite(s.rested, 10000)) throw new Error('冒険セーブの値が不正です');
 if (!Array.isArray(s.defeated) || s.defeated.length > 5 || new Set(s.defeated).size !== s.defeated.length || s.defeated.some(id => !BOSSES.some(b => b.id === id))) throw new Error('攻略データが不正です');
 if ((s.death && !insideBounds(s.death, WORLD, 1)) || (s.spawn && !insideBounds(s.spawn, WORLD, 1))) throw new Error('復活位置が不正です');
 for (const list of [s.resources, s.enemies, s.buildings]) if (!Array.isArray(list) || list.length > 100000 || new Set(list.map(v => v.id)).size !== list.length || list.some(v => !insideBounds(v, WORLD, 1) || !Number.isSafeInteger(v.id) || v.id < 1)) throw new Error('ワールド物体が不正です');
 for (const n of s.resources) if (!ITEM_NAMES[n.kind] || !finite(n.amount, 100) || !finite(n.ready, 1e10)) throw new Error('資源データが不正です');
 for (const e of s.enemies) if (!(e.boss ? BOSSES : ENEMIES).some(d => d.id === e.definition) || !Number.isInteger(e.tier) || e.tier < 1 || e.tier > BIOMES.length || !Number.isFinite(e.health) || Math.abs(e.health) > 10000 || (!Number.isFinite(e.windup) || e.windup < -1 / 30 || e.windup > 10) || !finite(e.slow, 10) || !Number.isFinite(e.cooldown) || Math.abs(e.cooldown) > 1e10 || !finiteVec({ x: e.homeX, y: 0, z: e.homeZ })) throw new Error('敵データが不正です');
 for (const b of s.buildings) if (!BUILDINGS.some(d => d.id === b.definition) || !finite(b.support, 10) || !Number.isFinite(b.rotation) || !items(b.contents)) throw new Error('建築データが不正です');
 if ((s.poison !== undefined && !finite(s.poison, 60)) || (s.chill !== undefined && !finite(s.chill, 60)) || (s.grave !== undefined && !items(s.grave))) throw new Error('状態異常・墓標データが不正です');
 if(s.waterSeeds && (!Array.isArray(s.waterSeeds) || s.waterSeeds.length>5 || s.waterSeeds.some(id=>!BIOMES.some(b=>b.id===id))))throw new Error('自然水域データが不正です');
 const copy = structuredClone(s);
 // Earlier versions saved the last windup tick just below zero.
 for (const enemy of copy.enemies) enemy.windup = Math.max(0, enemy.windup);
 return copy;
}

