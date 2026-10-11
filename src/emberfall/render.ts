import { BIOMES } from './generation';
import { CaveLighting, collectCaveLights, GRAPHICS_PRESETS } from './lighting';
import type { GraphicsEffects, GraphicsOptions, GraphicsQuality, LightStructure } from './lighting';
import { TerrainWindow } from './terrain-window';
import { QualityGovernor } from './render-quality';
import { SPELLS } from './wands';
import { structureSize } from './survival';
import type { Run, Input } from './simulation';

type Placeable = 'wood' | 'stone' | 'sand' | 'torch' | 'workbench' | 'camp';
type SurvivalView = Run & { mode: 'survival'; structures: readonly LightStructure[]; tool?: string; targetFromAim?: (x: number, y: number) => { x: number; y: number }; canPlace?: (type: Placeable, x: number, y: number) => boolean };
const isSurvival = (run: Run): run is SurvivalView => 'mode' in run && run.mode === 'survival' && 'structures' in run && Array.isArray(run.structures);
const wrap = (value: number, period: number) => ((value % period) + period) % period;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly terrain = document.createElement('canvas');
  readonly terrainCtx: CanvasRenderingContext2D;
  pixels: ImageData;
  readonly terrainWindow = new TerrainWindow();
  private readonly qualityGovernor = new QualityGovernor();
  private effects: GraphicsEffects = { pbr: true, volumetric: true, bloom: true };
  private readonly sourceScan = { cells: 0 };
  readonly lighting = new CaveLighting();
  private readonly lightCanvas = document.createElement('canvas');
  private readonly bloomCanvas = document.createElement('canvas');
  private readonly lightCtx: CanvasRenderingContext2D | null;
  private readonly bloomCtx: CanvasRenderingContext2D | null;
  private lightPixels: ImageData | null = null;
  private bloomPixels: ImageData | null = null;
  private lastLightTime = -Infinity;
  private lightCameraX = 0; private lightCameraY = 0;
  private lightWorld: Run['world'] | null = null;
  private renderMs = 0;
  private terrainUploads = 0;
  cameraX = 0; cameraY = 0; width = 240; height = 135; scale = 1;
  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    const terrainCtx = this.terrain.getContext('2d', { willReadFrequently: true });
    const lightCtx = this.lightCanvas.getContext('2d');
    const bloomCtx = this.bloomCanvas.getContext('2d');
    if (!ctx || !terrainCtx) throw new Error('2D描画を開始できません。ブラウザを更新して再試行してください。');
    this.ctx = ctx; this.terrainCtx = terrainCtx; this.lightCtx = lightCtx; this.bloomCtx = bloomCtx;
    this.terrain.width = 1; this.terrain.height = 1; this.pixels = terrainCtx.createImageData(1, 1);
  }
  get options(): Readonly<GraphicsOptions> { return { quality: this.qualityGovernor.requested, ...this.effects }; }
  setQuality(quality: GraphicsQuality) {
    if (!Object.hasOwn(GRAPHICS_PRESETS, quality)) return false;
    this.qualityGovernor.set(quality); this.lastLightTime = -Infinity; return true;
  }
  setEffects(effects: Partial<GraphicsEffects>) {
    for (const key of ['pbr', 'volumetric', 'bloom'] as const) if (typeof effects[key] === 'boolean') this.effects[key] = effects[key];
    this.lastLightTime = -Infinity;
  }
  get metrics() {
    const effectiveQuality = this.qualityGovernor.effective, preset = GRAPHICS_PRESETS[effectiveQuality];
    return { ...this.lighting.metrics, renderMs: this.renderMs, terrainUploads: this.terrainUploads, lightWidth: this.lighting.width, lightHeight: this.lighting.height,
      canvasWidth: this.width, canvasHeight: this.height, terrainWidth: this.terrainWindow.width, terrainHeight: this.terrainWindow.height,
      terrainCellsWritten: this.terrainWindow.cellsWritten, terrainChunksChecked: this.terrainWindow.chunksChecked, emitterCellsScanned: this.sourceScan.cells,
      quality: this.qualityGovernor.requested, effectiveQuality, fallback: !this.lightCtx || !this.bloomCtx ? 'canvas' : effectiveQuality !== this.qualityGovernor.requested ? 'performance' : 'none',
      ...this.effects, rayBudget: preset.maxRays, lightBudget: preset.maxLights, lightCellSize: preset.cellSize };
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width < rect.height ? 160 : 240;
    this.height = Math.min(512, Math.ceil(this.width * rect.height / Math.max(1, rect.width)));
    // Native cell pixels only. CSS upscales the scene; the HUD remains sharp.
    this.canvas.width = this.width; this.canvas.height = this.height;
    this.scale = 1; this.ctx.imageSmoothingEnabled = false; this.lastLightTime = -Infinity;
  }
  point(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * this.width + this.cameraX, y: (clientY - rect.top) / rect.height * this.height + this.cameraY };
  }
  private background(run: Run) {
    const { ctx, width, height } = this;
    ctx.fillStyle = BIOMES[run.level].background; ctx.fillRect(0, 0, width, height);
    // Layered, hand-pixelled rock fins and abandoned supports. They move more
    // slowly than actual terrain and never impersonate collidable resources.
    for (let layer = 0; layer < 2; layer++) {
      const parallax = layer ? 0.34 : 0.16;
      for (let i = 0; i < 19; i++) {
        const x = Math.round(wrap(i * 53 + run.seed % 37 - this.cameraX * parallax, width + 80) - 40);
        const y = Math.round(wrap(i * 79 + layer * 43 - this.cameraY * parallax, height + 100) - 50);
        const w = 7 + i % 11, h = 30 + i * 13 % 53;
        ctx.fillStyle = layer ? '#1c2c38' : '#15222e';
        ctx.fillRect(x, y, w, h); ctx.fillRect(x + 2, y + h, w - 4, 6); ctx.fillRect(x + 4, y + h + 6, Math.max(1, w - 8), 5);
        if (layer) {
          ctx.fillStyle = '#263a43'; ctx.fillRect(x + w - 2, y + 8, 1, h - 15);
          if (i % 3 === 0) { ctx.fillStyle = '#3d6564'; ctx.fillRect(x + 3, y + h - 3, 1, 2); ctx.fillRect(x + 5, y + h, 2, 1); }
        }
        if (i % 4 === 0) {
          ctx.fillStyle = '#21313a'; ctx.fillRect(x - 15, y + 13, 2, 23); ctx.fillRect(x - 16, y + 12, 26, 3);
          ctx.fillStyle = '#2c3e43'; ctx.fillRect(x - 13, y + 15, 20, 1);
        }
      }
    }
    // A few cool spores give open space depth without a full-screen effect.
    ctx.fillStyle = '#507473';
    for (let i = 0; i < 16; i++) {
      const x = Math.round(wrap(i * 47 + run.seed % 53 + Math.sin(run.time * 0.13 + i) * 3 - this.cameraX * 0.55, width + 40) - 20);
      const y = Math.round(wrap(i * 71 + run.time * (0.2 + i % 3 * 0.1) - this.cameraY * 0.6, height + 40) - 20);
      if (i % 3 === Math.floor(run.time * 0.3) % 3) ctx.fillRect(x, y, 1, 1);
    }
  }
  private uploadTerrain(run: Run) {
    const raster = this.terrainWindow, dirty = raster.update(run.world, { x: this.cameraX, y: this.cameraY, width: this.width, height: this.height });
    if (!dirty) return;
    if (this.pixels.width !== raster.width || this.pixels.height !== raster.height) {
      this.terrain.width = raster.width; this.terrain.height = raster.height;
      this.pixels = this.terrainCtx.createImageData(raster.width, raster.height);
      this.pixels.data.set(raster.pixels); raster.pixels = this.pixels.data;
    }
    // Shared ImageData storage, one dirty-union upload, no full-world allocation.
    this.terrainCtx.putImageData(this.pixels, 0, 0, dirty.x, dirty.y, dirty.width, dirty.height); this.terrainUploads++;
  }
  private structure(s: LightStructure, time: number) {
    const ctx = this.ctx, x = Math.round(s.x), y = Math.round(s.y), flicker = Math.floor(time * 9 + x) % 3;
    // Match the simulation's compact footprints; only fire/tool tips overhang.
    if (s.type === 'torch') {
      ctx.fillStyle = '#513d31'; ctx.fillRect(x - 1, y - 3, 3, 1); ctx.fillRect(x, y - 2, 1, 3);
      ctx.fillStyle = '#d09a60'; ctx.fillRect(x, y - 2, 1, 2);
      ctx.fillStyle = '#ed7f43'; ctx.fillRect(x - 1, y - 5, 3, 3); ctx.fillRect(x + flicker - 1, y - 6, 1, 2);
      ctx.fillStyle = '#ffd183'; ctx.fillRect(x, y - 5, 1, 3); ctx.fillStyle = '#fff0bc'; ctx.fillRect(x, y - 4, 1, 1);
      if (flicker === 1) { ctx.fillStyle = '#dd9b61'; ctx.fillRect(x + 1, y - 9, 1, 1); }
    } else if (s.type === 'workbench') {
      ctx.fillStyle = '#42302c'; ctx.fillRect(x - 3, y - 3, 7, 2); ctx.fillRect(x - 2, y - 1, 1, 2); ctx.fillRect(x + 2, y - 1, 1, 2);
      ctx.fillStyle = '#c08d5c'; ctx.fillRect(x - 3, y - 4, 7, 1); ctx.fillStyle = '#806b52'; ctx.fillRect(x - 2, y - 2, 5, 1);
      ctx.fillStyle = '#b4c8c5'; ctx.fillRect(x - 2, y - 6, 3, 1); ctx.fillStyle = '#916943'; ctx.fillRect(x - 1, y - 5, 1, 1);
      ctx.fillStyle = '#75b8a6'; ctx.fillRect(x + 2, y - 6, 1, 2); ctx.fillStyle = '#d9efd1'; ctx.fillRect(x + 2, y - 6, 1, 1);
    } else {
      ctx.fillStyle = '#66656a'; ctx.fillRect(x - 3, y - 1, 7, 2); ctx.fillStyle = '#a49a86'; ctx.fillRect(x - 3, y - 1, 1, 1); ctx.fillRect(x + 2, y, 1, 1);
      ctx.fillStyle = '#4e342d'; ctx.fillRect(x - 2, y - 1, 5, 1); ctx.fillStyle = '#b67c46'; ctx.fillRect(x - 2, y - 2, 4, 1);
      ctx.fillStyle = '#e98944'; ctx.fillRect(x - 1, y - 5, 3, 3); ctx.fillRect(x + flicker - 1, y - 6, 1, 2);
      ctx.fillStyle = '#ffcd77'; ctx.fillRect(x, y - 3, 2, 2); ctx.fillStyle = '#fff0b5'; ctx.fillRect(x, y - 2, 1, 1);
    }
  }
  private illuminate(run: Run, structures: readonly LightStructure[]) {
    const { ctx, lighting, lightCtx, bloomCtx } = this;
    // Optional effects failing to allocate never stop the playable pixel scene.
    if (!lightCtx || !bloomCtx) { if (this.canvas.dataset && this.lightWorld !== run.world) this.canvas.dataset.lighting = JSON.stringify(this.metrics); this.lightWorld = run.world; return; }
    const quality = this.qualityGovernor.effective, preset = GRAPHICS_PRESETS[quality], changedWorld = this.lightWorld !== run.world;
    const moved = Math.abs(this.cameraX - this.lightCameraX) > preset.cellSize * 2 || Math.abs(this.cameraY - this.lightCameraY) > preset.cellSize * 2;
    if (changedWorld || run.time < this.lastLightTime || run.time - this.lastLightTime >= preset.updateSeconds || moved) {
      const viewport = { x: this.cameraX, y: this.cameraY, width: this.width, height: this.height };
      lighting.update(run.world, collectCaveLights(run.world, run.player, structures, viewport, preset.maxLights, this.sourceScan), viewport, { quality, ...this.effects }, run.time);
      if (!this.lightPixels || this.lightCanvas.width !== lighting.width || this.lightCanvas.height !== lighting.height) {
        this.lightCanvas.width = this.bloomCanvas.width = lighting.width; this.lightCanvas.height = this.bloomCanvas.height = lighting.height;
        this.lightPixels = lightCtx.createImageData(lighting.width, lighting.height); this.bloomPixels = bloomCtx.createImageData(lighting.width, lighting.height);
      }
      this.lightPixels.data.set(lighting.illumination); this.bloomPixels!.data.set(lighting.effects);
      lightCtx.putImageData(this.lightPixels, 0, 0); bloomCtx.putImageData(this.bloomPixels!, 0, 0);
      this.lastLightTime = run.time; this.lightWorld = run.world; this.lightCameraX = this.cameraX; this.lightCameraY = this.cameraY;
      if (this.qualityGovernor.observe(lighting.metrics.lightingMs)) this.lastLightTime = -Infinity;
      if (this.canvas.dataset) this.canvas.dataset.lighting = JSON.stringify(this.metrics);
    }
    const x = lighting.x - this.cameraX, y = lighting.y - this.cameraY, w = lighting.width * lighting.cellSize, h = lighting.height * lighting.cellSize;
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(this.lightCanvas, x, y, w, h);
    ctx.globalCompositeOperation = 'screen'; ctx.drawImage(this.bloomCanvas, x, y, w, h);
    ctx.restore(); ctx.imageSmoothingEnabled = false;
  }
  draw(run: Run, input: Input) {
    const began = performance.now(), { ctx, width, height, scale } = this;
    const p = run.player, world = run.world, survival = isSurvival(run);
    this.cameraX = Math.round(Math.max(0, Math.min(Math.max(0, world.width - width), p.x - width * 0.45)));
    // Portrait survival keeps the character below its taller workshop HUD, even at the surface.
    const topMargin = survival && width < height ? -Math.ceil(height * 0.4) : -38;
    this.cameraY = Math.round(Math.max(topMargin, Math.min(world.height - height, p.y - height * 0.4)));
    ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    this.background(run); this.uploadTerrain(run);
    ctx.drawImage(this.terrain, this.terrainWindow.x - this.cameraX, this.terrainWindow.y - this.cameraY);
    ctx.save(); ctx.translate(-this.cameraX, -this.cameraY);
    const gate = run.portal;
    if (!survival) {
      const pulse = Math.sin(run.time * 3) * 0.2 + 0.8;
      ctx.fillStyle = '#142c41'; ctx.fillRect(gate.x - 6, gate.y - 10, 12, 18);
      ctx.strokeStyle = `rgba(102,232,243,${pulse})`; ctx.lineWidth = 2; ctx.strokeRect(gate.x - 5, gate.y - 9, 10, 17);
      ctx.fillStyle = '#72e8e1'; ctx.fillRect(gate.x - 1, gate.y - 5, 2, 8);
    }
    if (survival) for (const structure of run.structures) this.structure(structure, run.time);
    for (const item of run.wandPickups) {
      const x = Math.round(item.x), y = Math.round(item.y);
      ctx.fillStyle = '#304c55'; ctx.fillRect(x - 7, y + 3, 14, 3);
      ctx.strokeStyle = '#e5b874'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 5, y + 1); ctx.lineTo(x + 4, y - 4); ctx.stroke();
      ctx.fillStyle = '#c5afff'; ctx.fillRect(x + 2, y - 6, 4, 4);
      ctx.fillStyle = '#725f83'; ctx.fillRect(x - 6, y - 7, 1, 1); ctx.fillRect(x + 6, y - 9, 1, 1);
    }
    for (const l of run.loot) { ctx.fillStyle = '#a97836'; ctx.fillRect(Math.round(l.x) - 1, Math.round(l.y) - 1, 3, 3); ctx.fillStyle = '#ffe5a0'; ctx.fillRect(Math.round(l.x), Math.round(l.y) - 1, 1, 1); }
    for (const e of run.enemies) {
      const x = Math.round(e.x), y = Math.round(e.y), boss = e.kind === 'warden';
      ctx.fillStyle = e.flash > 0 ? '#fff4d2' : e.kind === 'crawler' ? '#b8966b' : boss ? '#d47771' : '#b898d2';
      if (boss) { ctx.fillRect(x - 7, y - 7, 14, 13); ctx.fillStyle = '#5b334b'; ctx.fillRect(x - 4, y - 9, 8, 3); }
      else if (e.kind === 'moth') { const wing = Math.sin(run.time * 15) > 0 ? -3 : 0; ctx.fillRect(x - 6, y + wing, 5, 3); ctx.fillRect(x + 2, y + wing, 5, 3); ctx.fillRect(x - 2, y - 2, 4, 5); ctx.fillStyle = '#705780'; ctx.fillRect(x - 5, y + wing + 2, 3, 1); ctx.fillRect(x + 3, y + wing + 2, 3, 1); }
      else { ctx.fillRect(x - 3, y - 3, 6, 6); ctx.fillRect(x - 4, y + 3, 2, 2); ctx.fillRect(x + 2, y + 3, 2, 2); ctx.fillStyle = '#645360'; ctx.fillRect(x - 3, y + 1, 6, 2); }
      ctx.fillStyle = '#ffe7a0'; ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1);
      if (e.hp < e.maxHp) { ctx.fillStyle = '#301e32'; ctx.fillRect(x - 5, y - 8, 10, 1); ctx.fillStyle = '#f6948c'; ctx.fillRect(x - 5, y - 8, 10 * e.hp / e.maxHp, 1); }
    }
    // Original copper-hooded cavekeeper: dark outline, teal cloak, belt lantern.
    const px = Math.round(p.x), py = Math.round(p.y), facing = input.aimX < 0 ? -1 : 1;
    const a = Math.atan2(input.aimY, input.aimX), handX = Math.round(px + Math.cos(a) * 7), handY = Math.round(py - 1 + Math.sin(a) * 7);
    if (p.invulnerable === 0 || Math.floor(run.time * 20) % 2 === 0) {
      ctx.fillStyle = '#17212d'; ctx.fillRect(px - 4, py - 4, 8, 10); ctx.fillRect(px - 3, py - 7, 6, 4);
      ctx.fillStyle = '#43797b'; ctx.fillRect(px - 3, py - 1, 6, 5); ctx.fillRect(px - 4, py + 3, 8, 2); ctx.fillStyle = '#70aaa0'; ctx.fillRect(px - 3, py, 1, 3);
      ctx.fillStyle = '#b87c56'; ctx.fillRect(px - 3, py - 5, 6, 4); ctx.fillRect(px - 2, py - 7, 4, 2); ctx.fillStyle = '#ddab75'; ctx.fillRect(px - 2, py - 6, 4, 1);
      ctx.fillStyle = '#f3d9ab'; ctx.fillRect(px + (facing > 0 ? 0 : -2), py - 4, 3, 2); ctx.fillStyle = '#222634'; ctx.fillRect(px + facing, py - 4, 1, 1);
      ctx.fillStyle = '#ba865a'; ctx.fillRect(px - 2, py + 4, 2, 2); ctx.fillRect(px + 1, py + 4, 2, 2);
      ctx.fillStyle = '#473d37'; ctx.fillRect(px - 3, py + 1, 6, 1); ctx.fillStyle = '#ffe0a0'; ctx.fillRect(px + 2, py, 1, 2);
      ctx.strokeStyle = '#ddb47b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + facing * 2, py - 1); ctx.lineTo(handX, handY); ctx.stroke();
      if (survival && run.tool === 'pick') { ctx.strokeStyle = '#b4c8c5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(handX - Math.sin(a) * 3, handY + Math.cos(a) * 3); ctx.lineTo(handX + Math.sin(a) * 3, handY - Math.cos(a) * 3); ctx.stroke(); }
      else { ctx.fillStyle = '#c6ffe4'; ctx.fillRect(handX, handY, 1, 1); }
    }
    if (input.fly && p.fuel > 0) { ctx.fillStyle = '#bce9d4'; for (let i = 0; i < 3; i++) ctx.fillRect(px - 2 + i * 2, py + 7 + Math.floor((run.time * 20 + i * 3) % 5), 1, 2); }
    if (p.burning > 0) { ctx.fillStyle = '#ffac5e'; ctx.fillRect(px - 4, py - 3, 1, 7); }
    for (const shot of run.projectiles) { ctx.strokeStyle = shot.enemy ? '#ef839b' : SPELLS[shot.spell].color; ctx.lineWidth = shot.radius; ctx.beginPath(); ctx.moveTo(shot.x, shot.y); ctx.lineTo(shot.x - shot.vx * 0.035, shot.y - shot.vy * 0.035); ctx.stroke(); }
    for (const pt of run.particles) { ctx.globalAlpha = Math.min(1, pt.life * 3); ctx.fillStyle = pt.color; ctx.fillRect(Math.round(pt.x), Math.round(pt.y), 1, 1); } ctx.globalAlpha = 1;
    ctx.restore();
    this.illuminate(run, survival ? run.structures : []);
    // A crisp, unobtrusive placement/mining reticle is drawn after illumination.
    if (survival && run.tool !== 'wand' && run.targetFromAim) {
      const target = run.targetFromAim(input.aimX, input.aimY), x = Math.round(target.x) - this.cameraX, y = Math.round(target.y) - this.cameraY;
      const tool = run.tool;
      const placement = tool === 'wood' || tool === 'stone' || tool === 'sand' || tool === 'torch' || tool === 'workbench' || tool === 'camp';
      const valid = placement && run.canPlace ? run.canPlace(tool, target.x, target.y) : null;
      ctx.fillStyle = valid === false ? '#d48987' : valid === true ? '#b0deb3' : input.fire ? '#ffe0a0' : '#a0c8b8';
      const structure = run.tool === 'torch' || run.tool === 'workbench' || run.tool === 'camp' ? structureSize(run.tool) : null;
      const half = structure ? structure.halfWidth + 1 : 2, top = structure ? y - structure.height : y - 2, bottom = structure ? y + 1 : y + 2;
      for (const sx of [-1, 1]) for (const yy of [top, bottom]) { ctx.fillRect(x + sx * half, yy, 1, 1); ctx.fillRect(x + sx * (half - 1), yy, 1, 1); }
      if (structure) { ctx.globalAlpha = 0.45; ctx.fillRect(x - half + 1, bottom, half * 2 - 1, 1); ctx.globalAlpha = 1; }

    }
    if (!survival && Math.hypot(p.x - gate.x, p.y - gate.y) > 30) {
      const gx = Math.max(12, Math.min(width - 12, gate.x - this.cameraX)), gy = Math.max(22, Math.min(height - 23, gate.y - this.cameraY)); ctx.fillStyle = '#82c7cb'; ctx.font = '5px monospace'; ctx.textAlign = 'center'; ctx.fillText('◇', gx, gy);
    }
    this.renderMs = performance.now() - began;
  }
}
