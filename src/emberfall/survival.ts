import { Material } from './materials';
import { Run } from './simulation';
import type { Input, Perk } from './simulation';
import type { SpellId } from './wands';

export const BLOCK_SIZE = 3;
export const TOOL_RANGE = 18;
export const MAX_STRUCTURES = 96;
export const MAX_STRUCTURE_ID = 1_000_000_000;
export const MAX_RESOURCE = 100_000;
export const WORKBENCH_RANGE = 22;
export const SURVIVAL_TOOLS = ['pick', 'wood', 'stone', 'sand', 'torch', 'workbench', 'camp', 'wand'] as const;
export type SurvivalTool = typeof SURVIVAL_TOOLS[number];
export type StructureType = 'torch' | 'workbench' | 'camp';
export type Placeable = Exclude<SurvivalTool, 'pick' | 'wand'>;
export interface PlacementStatus { ok: boolean; reason: 'ready' | 'inactive' | 'cooldown' | 'range' | 'blocked' | 'resources' | 'floor' | 'limit' | 'camp-clearance'; message: string }
export type Resource = 'wood' | 'stone' | 'sand' | 'ore' | StructureType;
export type ResourceCounts = Record<Resource, number>;
export interface Structure { id: number; type: StructureType; x: number; y: number }
export interface Point { x: number; y: number }
export const RECIPES = {
  torch: { name: 'たいまつ', description: '暗い洞窟を照らす。2本できる', cost: { wood: 4, sand: 2 }, output: 2, workbench: false },
  workbench: { name: '作業台', description: '杖編集と道具強化の拠点', cost: { wood: 18, stone: 9 }, output: 1, workbench: false },
  camp: { name: '焚き火の拠点', description: '設置した場所を復帰地点にする', cost: { wood: 12, stone: 12 }, output: 1, workbench: false },
  ammo: { name: '鉱山の実の補充', description: '作業台で爆弾を2発補充（最大6発）', cost: { ore: 6, sand: 6 }, output: 2, workbench: true },
  pickaxe: { name: '鉱石のつるはし', description: '採掘速度が約2倍になる', cost: { wood: 9, stone: 18, ore: 12 }, output: 1, workbench: true },
} as const;
export type RecipeId = keyof typeof RECIPES;
const drops: Partial<Record<Material, Resource>> = { [Material.Wood]: 'wood', [Material.Rock]: 'stone', [Material.Sand]: 'sand', [Material.Gold]: 'ore' };
const blocks = { wood: Material.Wood, stone: Material.Rock, sand: Material.Sand } as const;
const hazardous = new Set([Material.Water, Material.Oil, Material.Toxic, Material.Lava, Material.Fire]);
export function structureSize(type: StructureType): { halfWidth: number; height: number } {
  return type === 'torch' ? { halfWidth: 1, height: 6 } : { halfWidth: 3, height: type === 'camp' ? 3 : 5 };
}

/** One editable, seeded world. Combat/material physics remain the shared engine. */
export class SurvivalRun extends Run {
  readonly mode = 'survival' as const;
  resources: ResourceCounts = { wood: 0, stone: 0, sand: 0, ore: 0, torch: 0, workbench: 0, camp: 0 };
  structures: Structure[] = [];
  spawn: Point;
  camp: Point | null = null;
  deaths = 0;
  pickaxeLevel: 0 | 1 = 0;
  tool: SurvivalTool = 'pick';
  toolCooldown = 0;
  respawnProtection = 0;
  nextStructureId = 1;
  private stepping = false;

  constructor(seed: number) {
    super(seed);
    this.spawn = { x: this.player.x, y: this.player.y };
    // A usable surface workshop clearing connected to the original seeded caves.
    this.world.fillRect(15, 8, 147, 26, Material.Air);
    this.world.fillRect(15, 34, 147, 3, Material.Rock);
    this.world.fillRect(52, 23, 4, 11, Material.Wood);
    this.world.fillRect(54, 19, 11, 4, Material.Wood);
    this.world.fillRect(83, 29, 10, 5, Material.Sand);
    this.world.fillRect(65, 35, 6, 3, Material.Gold);
    // The shallow reservoir has an excavatable wall: water is actual finite cells.
    this.world.fillRect(110, 27, 30, 9, Material.Rock);
    this.world.fillRect(112, 27, 26, 7, Material.Water);
    this.world.fillRect(147, 23, 4, 11, Material.Wood);
    this.world.fillRect(142, 19, 14, 4, Material.Wood);
    this.notice = '木・石・砂を採り、作業台とたいまつを作ろう。水をせき止め、拠点から洞窟へ。';
  }

  override step(dt: number, input: Input): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase !== 'playing') return;
    const elapsed = Math.min(dt, 1 / 30);
    this.toolCooldown = Math.max(0, this.toolCooldown - elapsed);
    this.respawnProtection = Math.max(0, this.respawnProtection - elapsed);
    if (input.fire && this.tool !== 'wand') {
      const target = this.targetFromAim(input.aimX, input.aimY);
      this.useToolAt(target.x, target.y);
    }
    this.stepping = true;
    try { super.step(dt, { ...input, fire: input.fire && this.tool === 'wand', interact: false }); }
    finally { this.stepping = false; }
    this.recoverUnsupportedStructures();
    if (this.player.hp <= 0) this.respawn(this.cause);
    // Structures have no hidden material generation or periodic free healing.
  }

  targetFromAim(aimX: number, aimY: number): Point {
    if (![aimX, aimY].every(Number.isFinite) || Math.hypot(aimX, aimY) < 0.0001) { aimX = 1; aimY = 0; }
    const length = Math.hypot(aimX, aimY), dx = aimX / length, dy = aimY / length;
    const origin = { x: this.player.x, y: this.player.y - 1 };
    let last = { x: Math.floor(origin.x + dx * 8), y: Math.floor(origin.y + dy * 8) };
    for (let distance = 1; distance <= TOOL_RANGE - 1; distance += 0.5) {
      const point = { x: Math.floor(origin.x + dx * distance), y: Math.floor(origin.y + dy * distance) };
      if (this.tool === 'pick' && !this.solid(point.x, point.y) && this.structureAt(point.x, point.y)) return point;
      if (this.solid(point.x, point.y)) {
        if (this.tool === 'pick' || this.tool === 'wand') return point;
        if (this.tool === 'torch' || this.tool === 'workbench' || this.tool === 'camp') return last;
        // Align the 3×3 block to the surface face, not a global grid. A
        // floor at y=34 needs center y=32 so its bottom touches that floor.
        const verticalFace = point.y !== last.y && !this.solid(point.x, point.y - Math.sign(dy));
        return verticalFace ? { x: point.x, y: point.y - Math.sign(dy) * 2 } : { x: point.x - Math.sign(dx) * 2, y: point.y };
      }
      last = point;
    }
    return last;
  }

  useToolAt(x: number, y: number): boolean { return this.useTool(this.tool, x, y); }
  useTool(tool: SurvivalTool, x: number, y: number): boolean {
    if (tool === 'pick') return this.mine(x, y);
    if (tool === 'wand' || !SURVIVAL_TOOLS.includes(tool)) return false;
    return this.place(tool, x, y);
  }
  private reachable(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 3 && y >= 5 && x < this.world.width - 3 && y < this.world.height - 5 &&
      Math.hypot(x - this.player.x, y - (this.player.y - 1)) <= TOOL_RANGE && this.lineOfSight(this.player.x, this.player.y - 1, x + 0.5, y + 0.5);
  }
  mine(x: number, y: number): boolean {
    if (this.phase !== 'playing' || this.toolCooldown > 0 || !this.reachable(x, y)) return false;
    const structure = this.structureAt(x, y);
    if (structure) return this.recoverStructure(structure.id);
    if (drops[this.world.get(x, y)] === undefined) return false;
    const mined: { x: number; y: number; resource: Resource }[] = [];
    const counts: Partial<ResourceCounts> = {};
    // A bounded 3×3 strike. The selected surface must be visible before carving.
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
      if (xx < 3 || yy < 3 || xx >= this.world.width - 3 || yy >= this.world.height - 4 || Math.hypot(xx - this.player.x, yy - this.player.y + 1) > TOOL_RANGE) continue;
      const resource = drops[this.world.get(xx, yy)];
      if (resource) { mined.push({ x: xx, y: yy, resource }); counts[resource] = (counts[resource] ?? 0) + 1; }
    }
    if (!mined.length || Object.entries(counts).some(([key, amount]) => this.resources[key as Resource] + amount > MAX_RESOURCE)) return false;
    for (const cell of mined) { this.world.set(cell.x, cell.y, Material.Air); this.resources[cell.resource]++; }
    this.toolCooldown = this.pickaxeLevel ? 0.14 : 0.32;
    this.burst(x, y, '#d2b58b', 5);
    this.notice = Object.entries(counts).map(([key, count]) => `${({ wood: '木', stone: '石', sand: '砂', ore: '鉱石' } as Record<string, string>)[key]} +${count}`).join(' / ');
    const minedNotice = this.notice;
    if (this.recoverUnsupportedStructures()) this.notice = `${minedNotice}。${this.notice}`;
    return true;
  }
  /** A pure query shared by the placement preview and the actual transaction. */
  placementStatus(type: Placeable, x: number, y: number): PlacementStatus {
    if (this.phase !== 'playing') return { ok: false, reason: 'inactive', message: '探索を再開してから設置しよう。' };
    if (this.toolCooldown > 0) return { ok: false, reason: 'cooldown', message: '少し待つと、次を設置できる。' };
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 3 || y < 5 || x >= this.world.width - 3 || y >= this.world.height - 5 || Math.hypot(x - this.player.x, y - (this.player.y - 1)) > TOOL_RANGE) {
      return { ok: false, reason: 'range', message: '届かない。設置場所へ近づこう。' };
    }
    if (!this.lineOfSight(this.player.x, this.player.y - 1, x + 0.5, y + 0.5)) return { ok: false, reason: 'blocked', message: '手前の地形が邪魔で設置できない。' };
    const block = type === 'wood' || type === 'stone' || type === 'sand';
    if (!block && type !== 'torch' && type !== 'workbench' && type !== 'camp') return { ok: false, reason: 'blocked', message: '設置する道具を選ぼう。' };
    if (block) {
      if (this.resources[type] < BLOCK_SIZE ** 2) return { ok: false, reason: 'resources', message: `${type === 'wood' ? '木材' : type === 'stone' ? '石材' : '砂'}が9個必要。つるはしで集めよう。` };
    } else {
      if (this.resources[type] < 1) return { ok: false, reason: 'resources', message: `${RECIPES[type].name}がない。工作メニューで作ろう。` };
      if (type === 'camp' && y < 12) return { ok: false, reason: 'camp-clearance', message: 'ここは天井に近すぎる。復帰できる広い場所へ。' };
      if (this.structures.length >= MAX_STRUCTURES || this.nextStructureId >= MAX_STRUCTURE_ID) return { ok: false, reason: 'limit', message: 'この世界の建物数の上限に達した。' };
      if (!this.solid(x, y + 1)) return { ok: false, reason: 'floor', message: '足場が必要。地面のすぐ上を狙おう。' };
    }
    const size = block ? { halfWidth: 1, height: BLOCK_SIZE } : structureSize(type);
    const top = block ? y - 1 : y - size.height + 1, bottom = block ? y + 1 : y;
    for (let yy = top; yy <= bottom; yy++) for (let xx = x - size.halfWidth; xx <= x + size.halfWidth; xx++) {
      if (!this.emptyBuildCell(xx, yy) || this.hitsStructure(xx, yy)) return { ok: false, reason: 'blocked', message: '地形・水・建物に重なっている。空いた場所を狙おう。' };
      if (this.hitsActor(xx, yy)) return { ok: false, reason: 'blocked', message: '自分や敵に重なっている。少し離れて設置しよう。' };
    }
    return { ok: true, reason: 'ready', message: 'ここに設置できる。' };
  }
  canPlace(type: Placeable, x: number, y: number): boolean { return this.placementStatus(type, x, y).ok; }
  place(type: Placeable, x: number, y: number): boolean {
    const status = this.placementStatus(type, x, y);
    if (!status.ok) {
      // Holding the tool through its short cooldown should not overwrite the
      // successful placement notice. Other failures explain how to proceed.
      if (status.reason !== 'cooldown') this.notice = status.message;
      return false;
    }
    if (type === 'wood' || type === 'stone' || type === 'sand') {
      this.resources[type] -= BLOCK_SIZE ** 2;
      this.world.fillRect(x - 1, y - 1, BLOCK_SIZE, BLOCK_SIZE, blocks[type]);
      this.toolCooldown = 0.2;
      this.notice = `${type === 'wood' ? '木材' : type === 'stone' ? '石材' : '砂'}を9個使って設置した。`;
      return true;
    }
    this.resources[type]--;
    this.structures.push({ id: this.nextStructureId++, type, x, y });
    if (type === 'camp') this.camp = { x, y: y - 4 };
    this.toolCooldown = 0.2;
    this.notice = type === 'camp' ? 'この焚き火が新しい復帰地点になった。' : `${RECIPES[type].name}を設置した。`;
    return true;
  }
  private emptyBuildCell(x: number, y: number): boolean {
    // Liquids may not be silently deleted by construction; dam from dry edges.
    return x >= 3 && y >= 3 && x < this.world.width - 3 && y < this.world.height - 4 && this.world.get(x, y) === Material.Air;
  }
  private hitsActor(x: number, y: number): boolean {
    const p = this.player;
    return (Math.abs(x - p.x) < 3 && Math.abs(y - p.y) < 5) || this.enemies.some(e => e.hp > 0 && Math.abs(x - e.x) < 4 && Math.abs(y - e.y) < 5);
  }
  private structureAt(x: number, y: number): Structure | undefined {
    return this.structures.find(s => { const size = structureSize(s.type); return Math.abs(x - s.x) <= size.halfWidth && y <= s.y && y > s.y - size.height; });
  }
  private hitsStructure(x: number, y: number): boolean { return this.structureAt(x, y) !== undefined; }
  private refreshCamp(): void {
    let newest: Structure | undefined;
    for (const structure of this.structures) if (structure.type === 'camp' && this.solid(structure.x, structure.y + 1) && (!newest || structure.id > newest.id)) newest = structure;
    this.camp = newest ? { x: newest.x, y: newest.y - 4 } : null;
  }
  /** Pickaxe recovery moves one whole placed item back into inventory. */
  private recoverStructure(id: number): boolean {
    const index = this.structures.findIndex(s => s.id === id);
    if (index < 0) return false;
    const structure = this.structures[index];
    if (this.resources[structure.type] >= MAX_RESOURCE) { this.notice = '設備の所持数が上限。先に設置して空きを作ろう。'; return false; }
    this.structures.splice(index, 1);
    this.resources[structure.type]++;
    this.refreshCamp();
    this.toolCooldown = this.pickaxeLevel ? 0.14 : 0.32;
    this.burst(structure.x, structure.y - 1, '#dfbd88', 5);
    this.notice = `${RECIPES[structure.type].name}を1個回収した。再び設置できる。`;
    if (structure.type === 'camp') this.notice += this.camp ? '残る焚き火が復帰地点になった。' : '復帰地点は入口に戻った。';
    return true;
  }
  /**
   * Loss of the same center-cell support required at placement packs an item
   * once. No recipe ingredients are generated. Recovery also reconciles old
   * floating structures when a v1 survival save is opened.
   */
  recoverUnsupportedStructures(): number {
    const unsupported = this.structures.filter(s => !this.solid(s.x, s.y + 1));
    if (!unsupported.length) return 0;
    const removed = new Set(unsupported.map(s => s.id));
    // Remove first: repeat calls, respawn and save/load cannot recover twice.
    this.structures = this.structures.filter(s => !removed.has(s.id));
    let packed = 0, lost = 0;
    for (const structure of unsupported) {
      if (this.resources[structure.type] < MAX_RESOURCE) { this.resources[structure.type]++; packed++; }
      else lost++;
    }
    this.refreshCamp();
    this.notice = packed ? `足場を失った設備を${packed}個回収した。再び設置できる。` : '';
    if (lost) this.notice += `所持上限のため${lost}個は破損して失われた。`;
    if (unsupported.some(s => s.type === 'camp')) this.notice += this.camp ? '残る焚き火が復帰地点になった。' : '復帰地点は入口に戻った。';
    return unsupported.length;
  }
  override carveTerrain(x: number, y: number, radius: number, power: number): number {
    const removed = super.carveTerrain(x, y, radius, power);
    if (removed) this.recoverUnsupportedStructures();
    return removed;
  }
  nearWorkbench(): boolean {
    return this.structures.some(s => s.type === 'workbench' && this.solid(s.x, s.y + 1) && Math.hypot(s.x - this.player.x, s.y - this.player.y) <= WORKBENCH_RANGE && this.lineOfSight(this.player.x, this.player.y - 1, s.x, s.y - 2));
  }
  canCraft(recipe: RecipeId): boolean {
    if (!Object.hasOwn(RECIPES, recipe) || this.phase !== 'playing') return false;
    const entry = RECIPES[recipe];
    if (entry.workbench && !this.nearWorkbench()) return false;
    if (recipe === 'pickaxe' && this.pickaxeLevel >= 1) return false;
    if (recipe === 'ammo' && this.ammo.bomb >= 6) return false;
    if (recipe !== 'pickaxe' && recipe !== 'ammo' && this.resources[recipe] + entry.output > MAX_RESOURCE) return false;
    return Object.entries(entry.cost).every(([key, amount]) => this.resources[key as Resource] >= amount);
  }
  craft(recipe: RecipeId): boolean {
    if (!this.canCraft(recipe)) return false;
    const entry = RECIPES[recipe];
    for (const [key, amount] of Object.entries(entry.cost)) this.resources[key as Resource] -= amount;
    if (recipe === 'pickaxe') this.pickaxeLevel = 1;
    else if (recipe === 'ammo') {
      this.ammo.bomb = Math.min(6, this.ammo.bomb + entry.output);
      for (const wand of [...this.wands, ...this.wandPickups.map(p => p.wand)]) wand.charges = { ...this.ammo };
    } else this.resources[recipe] += entry.output;
    this.notice = `${entry.name}を作った。${entry.description}`;
    return true;
  }

  override canEditWands(): boolean { return this.phase === 'playing' && this.nearWorkbench(); }
  override enterRefuge(): boolean { return false; }
  override descend(): boolean { return false; }
  override choosePerk(_perk: Perk): boolean { return false; }
  override buySpell(_spell: SpellId, _price: number): boolean { return false; }
  override damage(amount: number, cause: string, continuous = false): void {
    if (this.respawnProtection > 0) return;
    super.damage(amount, cause, continuous);
    if (this.phase === 'dead' && !this.stepping) this.respawn(cause);
  }
  private safeSpawn(point: Point): boolean {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 5 || point.y < 8 || point.x > this.world.width - 6 || point.y > this.world.height - 10) return false;
    for (let y = point.y - 5; y <= point.y + 4; y++) for (let x = point.x - 3; x <= point.x + 3; x++) {
      if (this.solid(x, y) || hazardous.has(this.world.get(x, y))) return false;
    }
    return this.solid(point.x, point.y + 5);
  }
  /** Recovery is bounded near the requested camp and never creates harvestable cells. */
  recoverSpawn(target: Point = this.camp ?? this.spawn): Point {
    const center = { x: Math.max(6, Math.min(this.world.width - 7, Math.round(target.x))), y: Math.max(9, Math.min(this.world.height - 11, Math.round(target.y))) };
    for (let radius = 0; radius <= 20; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const candidate = { x: center.x + dx, y: center.y + dy };
      if (this.safeSpawn(candidate)) return candidate;
    }
    // A completely buried/flooded camp needs a small recovery shelter. Cleared
    // matter has no drops and the floor is unmineable, so death cannot farm it.
    this.world.fillRect(center.x - 4, center.y - 7, 9, 12, Material.Air);
    this.world.fillRect(center.x - 4, center.y + 5, 9, 2, Material.HardRock);
    return center;
  }
  respawn(cause = '探索中の事故'): void {
    this.recoverUnsupportedStructures();
    const point = this.recoverSpawn();
    Object.assign(this.player, point, { vx: 0, vy: 0, hp: this.player.maxHp, fuel: this.player.maxFuel, wet: 0, burning: 0, toxic: 0, oxygen: 100, invulnerable: 3, grounded: false });
    this.respawnProtection = 3;
    this.phase = 'playing'; this.deaths++; this.cause = cause;
    this.notice = `${cause}で倒れた。${this.camp ? '焚き火' : '入口'}で復帰した。世界は続き、持ち物と残った設備は引き継がれる。`;
    // Keep distant projectiles, but remove immediate spawn killers.
    this.projectiles = this.projectiles.filter(p => Math.hypot(p.x - point.x, p.y - point.y) > 18);
  }
  recoverLoadedPlayer(): void {
    if (!this.collides(this.player.x, this.player.y)) return;
    const point = this.recoverSpawn();
    Object.assign(this.player, point, { vx: 0, vy: 0, wet: 0, burning: 0, toxic: 0, oxygen: 100, invulnerable: 3, grounded: false });
    this.respawnProtection = 3;
  }
}
