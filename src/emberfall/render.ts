import { BIOMES } from './generation';
import { Material, MATERIALS } from './materials';
import { SPELLS } from './wands';
import type { Run, Input } from './simulation';
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly terrain = document.createElement('canvas');
  readonly terrainCtx: CanvasRenderingContext2D;
  readonly pixels: ImageData;
  cameraX = 0; cameraY = 0; width = 240; height = 135; scale = 1;
  private world: Run['world'] | null = null;
  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const terrainCtx = this.terrain.getContext('2d');
    if (!ctx || !terrainCtx) throw new Error('2D描画を開始できません。ブラウザを更新して再試行してください。');
    this.ctx = ctx; this.terrainCtx = terrainCtx;
    this.terrain.width = 256; this.terrain.height = 384; this.pixels = terrainCtx.createImageData(256, 384);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * dpr); this.canvas.height = Math.round(rect.height * dpr);
    this.width = rect.width < rect.height ? 160 : 240;
    this.height = this.width * rect.height / rect.width;
    this.scale = this.canvas.width / this.width; this.ctx.imageSmoothingEnabled = false;
  }
  point(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * this.width + this.cameraX, y: (clientY - rect.top) / rect.height * this.height + this.cameraY };
  }
  draw(run: Run, input: Input) {
    const { ctx, width, height, scale } = this;
    const p = run.player, world = run.world;
    this.cameraX = Math.max(0, Math.min(world.width - width, p.x - width * 0.45));
    this.cameraY = Math.max(-38, Math.min(world.height - height, p.y - height * 0.4));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = BIOMES[run.level].background; ctx.fillRect(0, 0, width, height);
    // Original distant architecture and mineral flecks, with two parallax layers.
    for (let i = 0; i < 30; i++) {
      const x = ((i * 67 + run.seed % 29) % 300) - this.cameraX * 0.25;
      const y = ((i * 43) % 390) - this.cameraY * 0.35;
      ctx.fillStyle = i % 2 ? '#233243' : '#1b2a35'; ctx.fillRect(x, y, 8 + i % 8, 42 + i % 19);
      ctx.fillStyle = '#4e706c'; ctx.fillRect(x + 2, y + 5, 1, 2);
    }
    if (this.world !== world) { this.world = world; for (let i = 0; i < 16 * 24; i++) world.dirty.add(i); }
    for (const chunk of world.dirty) {
      const cx = (chunk % 16) * 16, cy = Math.floor(chunk / 16) * 16;
      for (let y = cy; y < cy + 16; y++) for (let x = cx; x < cx + 16; x++) {
        const index = y * 256 + x, m = world.cells[index], color = MATERIALS[m].color;
        const shade = ((x * 17 + y * 29 + (x ^ y) * 7) % 19 - 9);
        const pixel = index * 4;
        this.pixels.data[pixel] = color[0] + shade; this.pixels.data[pixel + 1] = color[1] + shade; this.pixels.data[pixel + 2] = color[2] + shade;
        this.pixels.data[pixel + 3] = m === Material.Air ? 0 : 255;
      }
      this.terrainCtx.putImageData(this.pixels, 0, 0, cx, cy, 16, 16);
    }
    world.dirty.clear();
    ctx.drawImage(this.terrain, -Math.round(this.cameraX), -Math.round(this.cameraY));
    ctx.save(); ctx.translate(-this.cameraX, -this.cameraY);
    // Glowing gate, visible even against rock, gives a consistent objective silhouette.
    const gate = run.portal, pulse = Math.sin(run.time * 3) * 0.2 + 0.8;
    ctx.fillStyle = '#142c41'; ctx.fillRect(gate.x - 6, gate.y - 10, 12, 18);
    ctx.strokeStyle = `rgba(102,232,243,${pulse})`; ctx.lineWidth = 2; ctx.strokeRect(gate.x - 5, gate.y - 9, 10, 17);
    ctx.fillStyle = '#72e8e1'; ctx.fillRect(gate.x - 1, gate.y - 5, 2, 8);
    for (const l of run.loot) { ctx.fillStyle = '#ffda78'; ctx.fillRect(l.x - 1, l.y - 1, 3, 3); }
    for (const e of run.enemies) {
      const x = Math.round(e.x), y = Math.round(e.y), boss = e.kind === 'warden';
      ctx.fillStyle = e.flash > 0 ? '#fff4d2' : e.kind === 'crawler' ? '#c19b69' : boss ? '#d47771' : '#b898d2';
      if (boss) { ctx.fillRect(x - 7, y - 7, 14, 13); ctx.fillStyle = '#5b334b'; ctx.fillRect(x - 4, y - 9, 8, 3); }
      else if (e.kind === 'moth') { const wing = Math.sin(run.time * 15) > 0 ? -3 : 0; ctx.fillRect(x - 6, y + wing, 5, 3); ctx.fillRect(x + 2, y + wing, 5, 3); ctx.fillRect(x - 2, y - 2, 4, 5); }
      else { ctx.fillRect(x - 3, y - 3, 6, 6); ctx.fillRect(x - 4, y + 3, 2, 2); ctx.fillRect(x + 2, y + 3, 2, 2); }
      ctx.fillStyle = '#ffe7a0'; ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1);
      if (e.hp < e.maxHp) { ctx.fillStyle = '#301e32'; ctx.fillRect(x - 5, y - 8, 10, 1); ctx.fillStyle = '#f6948c'; ctx.fillRect(x - 5, y - 8, 10 * e.hp / e.maxHp, 1); }
    }
    // Hand-authored 9x12 alchemist silhouette: copper hood, ivory face, teal cloak.
    const px = Math.round(p.x), py = Math.round(p.y), facing = input.aimX < 0 ? -1 : 1;
    if (p.invulnerable === 0 || Math.floor(run.time * 20) % 2 === 0) {
      ctx.fillStyle = '#284a59'; ctx.fillRect(px - 3, py - 1, 6, 5); ctx.fillRect(px - 4, py + 3, 8, 2);
      ctx.fillStyle = '#a46d58'; ctx.fillRect(px - 3, py - 5, 6, 5); ctx.fillRect(px - 2, py - 7, 4, 2);
      ctx.fillStyle = '#e9cbaa'; ctx.fillRect(px + (facing > 0 ? 0 : -2), py - 4, 3, 2);
      ctx.fillStyle = '#171c2a'; ctx.fillRect(px + facing, py - 4, 1, 1);
      ctx.fillStyle = '#ba865a'; ctx.fillRect(px - 2, py + 4, 2, 2); ctx.fillRect(px + 1, py + 4, 2, 2);
      const a = Math.atan2(input.aimY, input.aimX); ctx.strokeStyle = '#ddb47b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px + facing * 2, py - 1); ctx.lineTo(px + Math.cos(a) * 7, py - 1 + Math.sin(a) * 7); ctx.stroke();
      ctx.fillStyle = '#aaffdd'; ctx.fillRect(px + Math.cos(a) * 7, py - 1 + Math.sin(a) * 7, 1.5, 1.5);
    }
    if (input.fly && p.fuel > 0) { ctx.fillStyle = '#bce9d4'; for (let i = 0; i < 3; i++) ctx.fillRect(px - 2 + i * 2, py + 7 + (run.time * 20 + i * 3) % 5, 1, 2); }
    if (p.burning > 0) { ctx.fillStyle = '#ffac5e'; ctx.fillRect(px - 4, py - 3, 1, 7); }
    for (const shot of run.projectiles) { ctx.strokeStyle = shot.enemy ? '#ef839b' : SPELLS[shot.spell].color; ctx.lineWidth = shot.radius; ctx.beginPath(); ctx.moveTo(shot.x, shot.y); ctx.lineTo(shot.x - shot.vx * 0.035, shot.y - shot.vy * 0.035); ctx.stroke(); }
    for (const pt of run.particles) { ctx.globalAlpha = Math.min(1, pt.life * 3); ctx.fillStyle = pt.color; ctx.fillRect(pt.x, pt.y, 1, 1); } ctx.globalAlpha = 1;
    // Local light pools use cheap gradients, with no external textures or assets.
    const glow = ctx.createRadialGradient(px, py, 4, px, py, 47); glow.addColorStop(0, '#e0b8890b'); glow.addColorStop(1, '#00000000'); ctx.fillStyle = glow; ctx.fillRect(px - 47, py - 47, 94, 94);
    ctx.restore();
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, width * 0.7); vignette.addColorStop(0, '#090e1600'); vignette.addColorStop(1, '#090e1690'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
    const dist = Math.hypot(p.x - gate.x, p.y - gate.y);
    if (dist > 30) { const gx = Math.max(12, Math.min(width - 12, gate.x - this.cameraX)), gy = Math.max(22, Math.min(height - 23, gate.y - this.cameraY)); ctx.fillStyle = '#82c7cb'; ctx.font = '5px monospace'; ctx.textAlign = 'center'; ctx.fillText('◇', gx, gy); }
  }
}
