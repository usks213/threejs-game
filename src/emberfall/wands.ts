/** Deterministic, DOM-free spell decks. All times are seconds and angles radians. */
export type SpellId = 'shard' | 'ember' | 'lance' | 'excavate' | 'bomb' | 'force' | 'haste' | 'twin' | 'echo' | 'pebble';
export interface Spell {
  name: string;
  description: string;
  kind: 'projectile' | 'modifier' | 'multicast' | 'trigger';
  mana: number;
  color: string;
  charges?: number;
}
export const SPELLS: Record<SpellId, Spell> = {
  shard: { name: '星片', description: '速く真っ直ぐ飛ぶ、扱いやすい結晶弾。', kind: 'projectile', mana: 5, color: '#7ee5ff' },
  ember: { name: '種火', description: '地面や油に火をつける小さな火球。', kind: 'projectile', mana: 9, color: '#ff9655' },
  lance: { name: '暁の槍', description: '高威力の細い光。マナ消費は大きい。', kind: 'projectile', mana: 20, color: '#fff1a6' },
  excavate: { name: '土ほどき', description: '柔らかい岩を掘る短射程の魔法。', kind: 'projectile', mana: 7, color: '#d1b487' },
  bomb: { name: '鉱山の実', description: '広い範囲を爆破する。使用回数は休息で回復。', kind: 'projectile', mana: 18, color: '#ffcc68', charges: 6 },
  force: { name: '重ね力', description: 'この詠唱の後続弾の威力を増す。', kind: 'modifier', mana: 8, color: '#ff82c3' },
  haste: { name: '風紡ぎ', description: 'この詠唱の後続弾を速くする。', kind: 'modifier', mana: 4, color: '#a8f1c7' },
  twin: { name: '二重奏', description: '続く二つの魔法を同時に詠唱する。', kind: 'multicast', mana: 5, color: '#b9a0ff' },
  echo: { name: '残響の器', description: '命中時に次の魔法を放つ弾。中の魔法のマナも先払い。', kind: 'trigger', mana: 10, color: '#ddaaff' },
  pebble: { name: '石ころ', description: '安いマナで放つ、遅く重い小石。', kind: 'projectile', mana: 3, color: '#b9b4a8' },
};
export interface Wand {
  id: string;
  name: string;
  shuffle: boolean;
  capacity: number;
  spells: SpellId[];
  mana: number;
  maxMana: number;
  regen: number;
  castDelay: number;
  recharge: number;
  spread: number;
  cooldown: number;
  cursor: number;
  deck: SpellId[];
  charges: Record<string, number>;
  rng: number;
}
export interface CastShot {
  spell: SpellId;
  damage: number;
  speed: number;
  radius: number;
  life: number;
  blast: number;
  dig: number;
  fire: boolean;
  angle: number;
  trigger?: CastShot[];
}
type ShotShape = Omit<CastShot, 'spell' | 'angle' | 'trigger'>;
const SHOTS: Partial<Record<SpellId, ShotShape>> = {
  shard: { damage: 13, speed: 210, radius: 2, life: 1.6, blast: 0, dig: 1, fire: false },
  ember: { damage: 10, speed: 145, radius: 3, life: 1.7, blast: 5, dig: 1, fire: true },
  lance: { damage: 36, speed: 310, radius: 2, life: 1.4, blast: 0, dig: 3, fire: false },
  excavate: { damage: 5, speed: 145, radius: 3, life: 0.65, blast: 0, dig: 9, fire: false },
  bomb: { damage: 65, speed: 105, radius: 4, life: 1.4, blast: 23, dig: 23, fire: true },
  echo: { damage: 7, speed: 175, radius: 3, life: 1.7, blast: 0, dig: 1, fire: false },
  pebble: { damage: 17, speed: 125, radius: 3, life: 1.3, blast: 0, dig: 2, fire: false },
};
function random(wand: Pick<Wand, 'rng'>): number {
  let n = wand.rng >>> 0 || 0x9e3779b9;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  wand.rng = n >>> 0;
  return wand.rng / 0x100000000;
}
function rebuildDeck(wand: Wand): void {
  wand.deck = [...wand.spells];
  wand.cursor = 0;
  if (wand.shuffle) {
    for (let i = wand.deck.length - 1; i > 0; i--) {
      const j = Math.floor(random(wand) * (i + 1));
      [wand.deck[i], wand.deck[j]] = [wand.deck[j], wand.deck[i]];
    }
  }
}
export function createWand(kind: 0 | 1 | 2, seed: number): Wand {
  const variants = [
    { name: '旅人の枝', shuffle: false, capacity: 5, spells: ['shard', 'shard'] as SpellId[], maxMana: 90, regen: 35, castDelay: 0.18, recharge: 0.48, spread: 0.035 },
    { name: '採掘師の根', shuffle: false, capacity: 6, spells: ['excavate', 'bomb'] as SpellId[], maxMana: 130, regen: 24, castDelay: 0.3, recharge: 0.85, spread: 0.07 },
    { name: '嵐の枝角', shuffle: true, capacity: 8, spells: ['twin', 'ember', 'shard', 'haste', 'lance'] as SpellId[], maxMana: 160, regen: 45, castDelay: 0.12, recharge: 0.62, spread: 0.14 },
  ];
  const config = variants[kind];
  const wand: Wand = { ...config, spells: [...config.spells], id: `wand-${kind}-${seed >>> 0}`, mana: config.maxMana, cooldown: 0, cursor: 0, deck: [], charges: {}, rng: seed >>> 0 };
  resetWand(wand);
  return wand;
}
/** Rest/refuge reset, the only operation that replenishes limited-use spells. */
export function resetWand(wand: Wand): void {
  wand.mana = wand.maxMana;
  wand.cooldown = 0;
  for (const [id, spell] of Object.entries(SPELLS)) {
    if (spell.charges !== undefined) wand.charges[id] = spell.charges;
  }
  rebuildDeck(wand);
}
export function tickWand(wand: Wand, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  wand.mana = Math.min(wand.maxMana, wand.mana + wand.regen * dt);
  wand.cooldown = Math.max(0, wand.cooldown - dt);
}
/** The caller controls when editing is allowed (for example, only inside a refuge). */
export function editWand(wand: Wand, spells: SpellId[]): boolean {
  if (spells.length > wand.capacity || !spells.every(id => Object.hasOwn(SPELLS, id))) return false;
  wand.spells = [...spells];
  // Editing cannot bypass an ongoing recharge or replenish mana/ammunition.
  rebuildDeck(wand);
  return true;
}
interface Modifiers { damage: number; speed: number }
/**
 * Evaluate at most one deck's remaining cards, never wrapping within a cast.
 * A block is transactional on insufficient mana, including prepaid trigger payloads.
 * Trigger descriptors are NOT additional immediate shots: the world releases them on impact.
 */
export function castWand(wand: Wand): CastShot[] {
  if (wand.cooldown > 0 || wand.spells.length === 0) return [];
  const work: Wand = { ...wand, deck: [...wand.deck], charges: { ...wand.charges } };
  if (work.cursor >= work.deck.length) rebuildDeck(work);
  let starved = false;
  let budget = work.deck.length - work.cursor;
  const read = (count: number, modifiers: Modifiers): CastShot[] => {
    const shots: CastShot[] = [];
    while (count > 0 && budget > 0 && work.cursor < work.deck.length && !starved) {
      budget--;
      const id = work.deck[work.cursor++];
      const spell = SPELLS[id];
      if (spell.charges !== undefined && (work.charges[id] ?? 0) <= 0) continue;
      if (work.mana < spell.mana) { starved = true; break; }
      work.mana -= spell.mana;
      if (spell.kind === 'modifier') {
        if (id === 'force') modifiers.damage += 11;
        if (id === 'haste') modifiers.speed *= 1.4;
        continue;
      }
      if (spell.kind === 'multicast') { count++; continue; }
      const shape = SHOTS[id];
      if (!shape) continue;
      if (spell.charges !== undefined) work.charges[id]--;
      const shot: CastShot = { ...shape, spell: id, damage: shape.damage + modifiers.damage, speed: shape.speed * modifiers.speed, angle: (random(work) * 2 - 1) * work.spread };
      if (spell.kind === 'trigger') {
        const payload = read(1, { ...modifiers });
        if (payload.length) shot.trigger = payload;
      }
      shots.push(shot);
      count--;
    }
    return shots;
  };
  const shots = read(1, { damage: 0, speed: 1 });
  if (starved) return [];
  wand.cursor = work.cursor;
  wand.deck = work.deck;
  wand.rng = work.rng;
  wand.charges = work.charges;
  // A modifier-only or exhausted-ammunition deck fizzles without draining mana.
  if (shots.length) wand.mana = work.mana;
  wand.cooldown = work.cursor >= work.deck.length ? wand.recharge : wand.castDelay;
  return shots;
}
