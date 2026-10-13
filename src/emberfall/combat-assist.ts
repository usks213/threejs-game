import type { Enemy, Run } from './simulation';
import type { Wand } from './wands';

/** Input assistance only: no projectile, enemy or resource rules are changed. */
export const ASSIST_RANGE = 72;
export interface CombatViewport { x: number; y: number; width: number; height: number }
export interface CombatTarget { id: number; x: number; y: number; aimX: number; aimY: number }
const ordinaryCards = new Set(['shard', 'lance', 'pebble', 'force', 'haste', 'twin', 'echo']);
export function readCombatAssist(value: unknown): boolean {
  return value !== null && typeof value === 'object' && 'version' in value && value.version === 1 &&
    'combatAssist' in value && typeof value.combatAssist === 'boolean' ? value.combatAssist : false;
}
export function allowsAssistedFire(wand: Pick<Wand, 'spells'>): boolean {
  // Inspect the whole deck, including trigger payloads. Excavation, fire and
  // finite/explosive cards require an explicit manual weapon drag every time.
  return wand.spells.length > 0 && wand.spells.every(card => ordinaryCards.has(card)) &&
    wand.spells.some(card => ['shard', 'lance', 'pebble', 'echo'].includes(card));
}
export function enemyInView(enemy: Pick<Enemy, 'x' | 'y'>, view: CombatViewport): boolean {
  return enemy.x >= view.x + 3 && enemy.x <= view.x + view.width - 3 &&
    enemy.y >= view.y + 3 && enemy.y <= view.y + view.height - 3;
}
export function findCombatTarget(run: Pick<Run, 'player' | 'enemies' | 'isEnemyActive' | 'lineOfSight'>, view: CombatViewport): CombatTarget | null {
  const x = run.player.x, y = run.player.y - 1;
  let target: CombatTarget | null = null, nearest = ASSIST_RANGE * ASSIST_RANGE;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0 || !run.isEnemyActive(enemy) || !enemyInView(enemy, view)) continue;
    const dx = enemy.x - x, dy = enemy.y - y, distance = dx * dx + dy * dy;
    if (distance >= nearest || !run.lineOfSight(x, y, enemy.x, enemy.y)) continue;
    nearest = distance; target = { id: enemy.id, x: enemy.x, y: enemy.y, aimX: dx, aimY: dy };
  }
  return target;
}

/** On-demand, detached observability. Never walk/serialize actors in a HUD tick. */
export function readCombatSnapshot(run: Run, view: CombatViewport, assistEnabled: boolean, target: CombatTarget | null) {
  const player = run.player;
  return { selected: run.selected, ammo: { ...run.ammo }, kills: run.kills, castSequence: run.castSequence, assistEnabled,
    wands: run.wands.map(w => ({ spells: [...w.spells], mana: w.mana, cursor: w.cursor, cooldown: w.cooldown })),
    enemies: run.enemies.filter(e => run.isEnemyActive(e) && Math.hypot(e.x-player.x,e.y-player.y)<100).slice(0,16)
      .map(e => ({ id:e.id, x:e.x, y:e.y, hp:e.hp, maxHp:e.maxHp, kind:e.kind, active:true, onScreen:enemyInView(e,view), lineOfSight:run.lineOfSight(player.x,player.y-1,e.x,e.y) })),
    projectiles: run.projectiles.filter(p => !p.enemy).slice(0,24).map(p => ({ x:p.x,y:p.y,spell:p.spell,damage:p.damage })),
    assistedTarget: target ? { ...target } : null };
}
