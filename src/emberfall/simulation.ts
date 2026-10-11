import { CellWorld, Material, MATERIALS } from './materials';
import { generateLevel, random } from './generation';
import { castWand, createWand, editWand, resetWand, tickWand } from './wands';
import type { CastShot, Wand, SpellId } from './wands';
export type Phase = 'playing' | 'refuge' | 'dead' | 'won';
export interface Input { move: number; fly: boolean; fire: boolean; aimX: number; aimY: number; interact: boolean; spray: boolean }
export const idleInput = (): Input => ({ move: 0, fly: false, fire: false, aimX: 1, aimY: 0, interact: false, spray: false });
export interface Player { x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; fuel: number; maxFuel: number; wet: number; burning: number; toxic: number; oxygen: number; invulnerable: number; grounded: boolean }
export interface Enemy { id: number; x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; kind: 'crawler' | 'moth' | 'sentry' | 'warden'; cooldown: number; flash: number }
export interface Projectile extends CastShot { x: number; y: number; vx: number; vy: number; enemy: boolean }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
export interface Loot { x: number; y: number; value: number }
export const PERKS = {
  heart: { name: '琥珀の心臓', description: '最大体力 +25、同量回復' },
  reservoir: { name: '深い魔力槽', description: 'すべての杖の最大魔力 +40' },
  ascent: { name: '風の靴', description: '浮遊燃料 +35%' },
  heat: { name: '耐熱の外套', description: '炎・溶岩の被害を70%軽減' },
  magnet: { name: '金砂の磁針', description: '金貨を遠くから引き寄せる' },
  workshop: { name: '旅の工房', description: '洞窟でも杖を編集できる' },
} as const;
export type Perk = keyof typeof PERKS;
export class Run {
  world: CellWorld;
  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  loot: Loot[] = [];
  wands: Wand[];
  selected = 0;
  gold = 0;
  level = 0;
  phase: Phase = 'playing';
  perks: Perk[] = [];
  perkChosen = false;
  perkOffers: Perk[] = [];
  spells: SpellId[] = ['shard', 'ember', 'excavate', 'bomb'];
  portal = { x: 213, y: 355 };
  seed: number;
  time = 0;
  kills = 0;
  cause = '';
  notice = '下層の青い門を目指そう。左で移動、右で照準と射撃。';
  flask = 180;
  sprayCooldown = 0;
  materialAccumulator = 0;
  constructor(seed: number) {
    this.seed = seed >>> 0 || 1;
    const level = generateLevel(this.seed, 0);
    this.world = level.world;
    this.portal = level.portal;
    this.player = { ...level.spawn, vx: 0, vy: 0, hp: 100, maxHp: 100, fuel: 100, maxFuel: 100, wet: 0, burning: 0, toxic: 0, oxygen: 100, invulnerable: 0, grounded: false };
    this.wands = [createWand(0, seed), createWand(1, seed + 1)];
    this.setEnemies(level.enemies);
  }
  setEnemies(spawns: ReturnType<typeof generateLevel>['enemies']) {
    this.enemies = spawns.map((e, i) => { const hp = e.kind === 'warden' ? 210 : 22 + this.level * 9; return { ...e, id: i, vx: 0, vy: 0, hp, maxHp: hp, cooldown: 1 + i * 0.15, flash: 0 }; });
  }
  solid(x: number, y: number) { return MATERIALS[this.world.get(Math.floor(x), Math.floor(y))].solid; }
  collides(x: number, y: number, width = 2, height = 4) {
    for (let yy = -height; yy <= height; yy++) for (let xx = -width; xx <= width; xx++) if (this.solid(x + xx, y + yy)) return true;
    return false;
  }
  moveBody(body: { x: number; y: number; vx: number; vy: number }, dt: number, width = 2, height = 4) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(body.vx), Math.abs(body.vy)) * dt));
    let ground = false;
    for (let i = 0; i < steps; i++) {
      const dx = body.vx * dt / steps;
      if (!this.collides(body.x + dx, body.y, width, height)) body.x += dx;
      else if (dx && !this.collides(body.x + dx, body.y - 1, width, height)) { body.x += dx; body.y -= 1; }
      else body.vx = 0;
      const dy = body.vy * dt / steps;
      if (!this.collides(body.x, body.y + dy, width, height)) body.y += dy;
      else { if (dy > 0) ground = true; body.vy = 0; }
    }
    return ground;
  }
  damage(amount: number, cause: string, continuous = false) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const p = this.player;
    if (this.phase !== 'playing' || (!continuous && p.invulnerable > 0)) return;
    p.hp = Math.max(0, p.hp - amount); if (!continuous) p.invulnerable = 0.55;
    if (p.hp <= 0) { this.phase = 'dead'; this.cause = cause; this.notice = `${cause}で倒れた。種 ${this.seed} の旅はここまで。`; }
  }
  addShot(shot: CastShot, x: number, y: number, angle: number, enemy = false) {
    if (this.projectiles.length >= 128) return;
    this.projectiles.push({ ...shot, x, y, vx: Math.cos(angle + shot.angle) * shot.speed, vy: Math.sin(angle + shot.angle) * shot.speed, enemy });
  }
  burst(x: number, y: number, color: string, count = 10) {
    for (let i = 0; i < count && this.particles.length < 180; i++) { const angle = i * 2.399 + this.time; this.particles.push({ x, y, vx: Math.cos(angle) * 15, vy: Math.sin(angle) * 15, life: 0.4 + i % 3 * 0.1, color }); }
  }
  /** Mine gold before carving so destroyed ore becomes a collectible reward. */
  carveTerrain(x: number, y: number, radius: number, power: number) {
    if (![x, y, radius, power].every(Number.isFinite) || radius < 0 || power <= 0) return 0;
    let ore = 0;
    if (power >= 3) {
      for (let yy = Math.max(1, Math.floor(y - radius)); yy <= Math.min(this.world.height - 2, Math.ceil(y + radius)); yy++) {
        for (let xx = Math.max(1, Math.floor(x - radius)); xx <= Math.min(this.world.width - 2, Math.ceil(x + radius)); xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2 && this.world.get(xx, yy) === Material.Gold) ore++;
        }
      }
    }
    const removed = this.world.carveCircle(x, y, radius, power);
    if (ore) this.loot.push({ x, y, value: ore * 2 });
    return removed;
  }
  impact(p: Projectile) {
    if (p.blast > 0) {
      this.carveTerrain(p.x, p.y, p.blast, p.dig || 5);
      for (const e of this.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < p.blast + 3) { e.hp -= p.damage; e.flash = 0.1; }
      if (Math.hypot(this.player.x - p.x, this.player.y - p.y) < p.blast + 3) this.damage(p.damage * 0.65, '爆発');
      this.burst(p.x, p.y, '#ffd287', 20);
    } else if (p.dig) this.carveTerrain(p.x, p.y, 4 + p.dig, p.dig);
    if (p.fire) for (let i = -2; i <= 2; i++) if (this.world.get(p.x + i, p.y) === Material.Air) this.world.set(p.x + i, p.y, Material.Fire);
    if (p.trigger) for (const shot of p.trigger) this.addShot(shot, p.x - Math.sign(p.vx) * 2, p.y - Math.sign(p.vy) * 2, Math.atan2(p.vy, p.vx), p.enemy);
    this.burst(p.x, p.y, p.enemy ? '#ef7c91' : '#9bffe7', 5);
  }
  step(dt: number, input: Input) {
    if (this.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.max(0, Math.min(dt, 1 / 30)); this.time += dt;
    const p = this.player;
    for (const wand of this.wands) tickWand(wand, dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.vx += (Math.max(-1, Math.min(1, input.move)) * 38 - p.vx) * Math.min(1, dt * 14);
    p.vy = Math.min(58, p.vy + 85 * dt);
    if (input.fly && p.fuel > 0) { p.vy = Math.max(-40, p.vy - 180 * dt); p.fuel = Math.max(0, p.fuel - 29 * dt); }
    else if (p.grounded) p.fuel = Math.min(p.maxFuel, p.fuel + 60 * dt);
    p.grounded = this.moveBody(p, dt);
    // Feet touching a shallow pool must count, even with the head above it.
    let inWater = false, inToxic = false, inFire = false, inLava = false;
    for (let yy = -3; yy <= 4; yy++) for (let xx = -1; xx <= 1; xx++) {
      const contact = this.world.get(p.x + xx, p.y + yy);
      inWater ||= contact === Material.Water; inToxic ||= contact === Material.Toxic;
      inFire ||= contact === Material.Fire; inLava ||= contact === Material.Lava;
    }
    const head = this.world.get(p.x, p.y - 3);
    p.wet = Math.max(0, p.wet - dt); p.toxic = Math.max(0, p.toxic - dt); p.burning = Math.max(0, p.burning - dt);
    if (inWater) { p.wet = 5; p.burning = 0; p.toxic = Math.max(0, p.toxic - dt * 8); p.vy *= 0.92; this.flask = Math.min(180, this.flask + dt * 35); }
    if (inToxic) p.toxic = 3;
    if ((inFire || inLava) && p.wet <= 0) p.burning = 4;
    if (p.burning > 0) this.damage(dt * 5 * (this.perks.includes('heat') ? 0.3 : 1), '燃焼', true);
    if (inLava) this.damage(dt * 24 * (this.perks.includes('heat') ? 0.3 : 1), '溶岩', true);
    if (p.toxic > 0) this.damage(dt * 3, '毒', true);
    const submerged = [Material.Water, Material.Oil, Material.Toxic, Material.Lava].includes(head);
    p.oxygen = Math.max(0, Math.min(100, p.oxygen + dt * (submerged ? -20 : 50)));
    if (p.oxygen <= 0) this.damage(dt * 10, '窒息', true);
    if (this.phase !== 'playing') return;
    const angle = Math.atan2(input.aimY, input.aimX);
    if (input.fire) for (const shot of castWand(this.wands[this.selected])) this.addShot(shot, p.x, p.y - 1, angle);
    this.sprayCooldown = Math.max(0, this.sprayCooldown - dt);
    if (input.spray && this.flask > 0 && this.sprayCooldown === 0) {
      for (let i = 5; i < 10 && this.flask > 0; i++) { const x = p.x + Math.cos(angle) * i, y = p.y + Math.sin(angle) * i - 2; if (this.world.get(x, y) === Material.Air) { this.world.set(x, y, Material.Water); this.flask--; } }
      this.sprayCooldown = 0.09;
    }
    this.updateEnemies(dt);
    if (this.phase !== 'playing') return;
    // Reverse iteration permits bounded impact payload insertion without processing it twice.
    for (let i = this.projectiles.length - 1; i >= 0 && this.phase === 'playing'; i--) {
      const shot = this.projectiles[i]; shot.life -= dt;
      if (shot.blast) shot.vy += dt * 25;
      const steps = Math.max(1, Math.ceil(Math.hypot(shot.vx, shot.vy) * dt)); let hit = false;
      // An expired projectile impacts at its last location, never beyond its range.
      hit = shot.life <= 0 || this.solid(shot.x, shot.y);
      for (let s = 0; s < steps && !hit; s++) {
        shot.x += shot.vx * dt / steps; shot.y += shot.vy * dt / steps;
        hit = this.solid(shot.x, shot.y);
        if (!hit && shot.enemy && Math.hypot(p.x - shot.x, p.y - shot.y) < 4 && this.lineOfSight(shot.x, shot.y, p.x, p.y)) { this.damage(shot.damage, '魔弾'); hit = true; }
        if (!hit && !shot.enemy) for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - shot.x, e.y - shot.y) < (e.kind === 'warden' ? 9 : 5) && this.lineOfSight(shot.x, shot.y, e.x, e.y)) { if (!shot.blast) e.hp -= shot.damage; e.flash = 0.15; hit = true; break; }
      }
      if (hit || shot.life <= 0) { this.projectiles.splice(i, 1); this.impact(shot); }
    }
    if (this.phase !== 'playing') return;
    this.enemies = this.enemies.filter(e => { if (e.hp > 0) return true; this.kills++; this.loot.push({ x: e.x, y: e.y, value: e.kind === 'warden' ? 100 : 15 + this.level * 5 }); this.burst(e.x, e.y, '#f5b66d', 15); return false; });
    this.loot = this.loot.filter(l => { const d = Math.hypot(l.x - p.x, l.y - p.y); if (d < 7) { this.gold += l.value; return false; } if (d < (this.perks.includes('magnet') ? 50 : 16)) { l.x += (p.x - l.x) * dt * 5; l.y += (p.y - l.y) * dt * 5; } return true; });
    for (const pt of this.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 20 * dt; pt.life -= dt; }
    this.particles = this.particles.filter(pt => pt.life > 0);
    this.materialAccumulator += dt;
    if (this.materialAccumulator >= 1 / 30) { this.materialAccumulator -= 1 / 30; this.world.step(); }
    if (input.interact && Math.hypot(p.x - this.portal.x, p.y - this.portal.y) < 19) this.enterRefuge();
  }
  updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.hp <= 0 || this.phase !== 'playing') continue;
      e.flash = Math.max(0, e.flash - dt); e.cooldown -= dt;
      const dx = p.x - e.x, dy = p.y - e.y, distance = Math.hypot(dx, dy);
      if (distance > 145) continue;
      if (e.kind === 'moth' || e.kind === 'warden') {
        e.vx = Math.sign(dx) * (e.kind === 'warden' ? 9 : 17); e.vy = Math.sign(dy) * 12 + Math.sin(this.time * 3 + e.id) * 7;
        this.moveBody(e, dt, e.kind === 'warden' ? 5 : 2, e.kind === 'warden' ? 6 : 2);
      } else {
        e.vx = e.kind === 'crawler' ? Math.sign(dx) * 17 : 0; e.vy = Math.min(45, e.vy + 70 * dt);
        this.moveBody(e, dt, 2, 3);
      }
      if (distance < 8 && this.lineOfSight(e.x, e.y, p.x, p.y)) this.damage(9 + this.level * 3, '接触');
      if (e.kind !== 'crawler' && distance < 95 && e.cooldown <= 0 && this.lineOfSight(e.x, e.y, p.x, p.y)) {
        const angle = Math.atan2(dy, dx), count = e.kind === 'warden' ? 5 : 1;
        for (let i = 0; i < count; i++) this.addShot({ spell: 'ember', damage: 9 + this.level * 2, speed: 36, radius: 1, life: 3, blast: 0, dig: 0, fire: false, angle: (i - (count - 1) / 2) * 0.18 }, e.x, e.y, angle, true);
        e.cooldown = e.kind === 'warden' ? 1.7 : 2.8;
      }
      const m = this.world.get(e.x, e.y);
      if (m === Material.Lava || m === Material.Fire) e.hp -= dt * 15;
      if (m === Material.Toxic) e.hp -= dt * 3;
    }
  }
  lineOfSight(x: number, y: number, tx: number, ty: number) {
    const n = Math.ceil(Math.hypot(tx - x, ty - y));
    for (let i = 1; i < n; i++) if (this.solid(x + (tx - x) * i / n, y + (ty - y) * i / n)) return false;
    return true;
  }
  enterRefuge() {
    if (this.phase !== 'playing') return false;
    if (this.level === 2) { if (this.enemies.some(e => e.kind === 'warden')) { this.notice = '門は炉守に封じられている。'; return false; } this.phase = 'won'; this.notice = '炉心の種を持ち帰った。旅を越えて、次の種へ。'; return true; }
    this.phase = 'refuge'; this.player.hp = this.player.maxHp; this.player.fuel = this.player.maxFuel;
    this.player.wet = this.player.burning = this.player.toxic = 0; this.player.oxygen = 100; this.flask = 180;
    this.wands.forEach(resetWand); this.perkChosen = false;
    const rng = random(this.seed + this.level * 131); const pool = (Object.keys(PERKS) as Perk[]).filter(k => !this.perks.includes(k));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.perkOffers = pool.slice(0, 3); this.notice = '休息所。体力と弾数を回復した。杖を組み、特性を一つ選ぼう。'; return true;
  }
  canEditWands() {
    return this.phase === 'refuge' || (this.phase === 'playing' && this.perks.includes('workshop'));
  }
  editRunWand(index: number, spells: SpellId[]) {
    if (!Number.isInteger(index) || index < 0 || index >= this.wands.length || !this.canEditWands() || !spells.every(spell => this.spells.includes(spell))) return false;
    return editWand(this.wands[index], spells);
  }
  editSelectedWand(spells: SpellId[]) {
    return this.editRunWand(this.selected, spells);
  }
  choosePerk(perk: Perk) {
    if (this.phase !== 'refuge' || this.perkChosen || !this.perkOffers.includes(perk)) return false;
    this.perks.push(perk); this.perkChosen = true;
    if (perk === 'heart') { this.player.maxHp += 25; this.player.hp += 25; }
    if (perk === 'reservoir') for (const w of this.wands) { w.maxMana += 40; w.mana += 40; }
    if (perk === 'ascent') { this.player.maxFuel *= 1.35; this.player.fuel = this.player.maxFuel; }
    return true;
  }
  buySpell(spell: SpellId, price: number) {
    // Price is checked against the fixed shop catalog, never accepted from UI data.
    const catalog: Partial<Record<SpellId, number>> = { lance: 35, bomb: 30, force: 25, haste: 25, twin: 40, echo: 50 };
    if (this.phase !== 'refuge' || catalog[spell] !== price || this.gold < price || this.spells.includes(spell)) return false;
    this.gold -= price; this.spells.push(spell); return true;
  }
  descend() {
    if (this.phase !== 'refuge') return false;
    if (!this.perkChosen && this.perkOffers.length) { this.notice = '無料の特性を一つ選んでから出発しよう。'; return false; }
    this.level++; const next = generateLevel(this.seed, this.level); this.world = next.world; this.portal = next.portal;
    this.player.x = next.spawn.x; this.player.y = next.spawn.y; this.player.vx = this.player.vy = 0; this.player.grounded = false;
    this.player.invulnerable = 0; this.materialAccumulator = 0; this.sprayCooldown = 0;
    this.setEnemies(next.enemies); this.projectiles = []; this.loot = []; this.particles = []; this.phase = 'playing'; this.notice = '新しい地層に入った。'; return true;
  }
}
