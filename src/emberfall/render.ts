import { CaveLighting, collectCaveLights, GRAPHICS_PRESETS } from './lighting';
import type { GraphicsEffects, GraphicsOptions, GraphicsQuality, LightStructure } from './lighting';
import { TerrainWindow } from './terrain-window';
import { QualityGovernor } from './render-quality';
import { drawPixelEnvironment } from './pixel-environment';
import { drawPixelEnemy, drawPixelKeeper, pixelLine } from './pixel-actors';
import { drawPixelFlame, drawPixelProjectiles, drawWandAim, PixelCastFeedback, PixelMaterialEffects } from './pixel-effects';
import { structureSize } from './survival';
import type { Run, Input } from './simulation';

type Placeable = 'wood' | 'stone' | 'sand' | 'torch' | 'workbench' | 'camp';
type SurvivalView = Run & { mode: 'survival'; structures: readonly LightStructure[]; tool?: string; targetFromAim?: (x: number, y: number) => { x: number; y: number }; canPlace?: (type: Placeable, x: number, y: number) => boolean };
const isSurvival = (run: Run): run is SurvivalView => 'mode' in run && run.mode === 'survival' && 'structures' in run && Array.isArray(run.structures);

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly terrain = document.createElement('canvas');
  readonly terrainCtx: CanvasRenderingContext2D;
  pixels: ImageData;
  readonly terrainWindow = new TerrainWindow();
  private readonly qualityGovernor = new QualityGovernor();
  private readonly materialEffects = new PixelMaterialEffects();
  private readonly castFeedback = new PixelCastFeedback();
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
      canvasWidth: this.width, canvasHeight: this.height, backingWidth: this.canvas.width, backingHeight: this.canvas.height, artScale: this.scale,
      accentCellsScanned: this.materialEffects.cellsScanned, accentCount: this.materialEffects.count, terrainWidth: this.terrainWindow.width, terrainHeight: this.terrainWindow.height,
      terrainCellsWritten: this.terrainWindow.cellsWritten, terrainChunksChecked: this.terrainWindow.chunksChecked, emitterCellsScanned: this.sourceScan.cells,
      quality: this.qualityGovernor.requested, effectiveQuality, fallback: !this.lightCtx || !this.bloomCtx ? 'canvas' : effectiveQuality !== this.qualityGovernor.requested ? 'performance' : 'none',
      ...this.effects, rayBudget: preset.maxRays, lightBudget: preset.maxLights, lightCellSize: preset.cellSize };
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width < rect.height ? 160 : 240;
    this.height = Math.min(512, Math.ceil(this.width * rect.height / Math.max(1, rect.width)));
    this.syncBacking(); this.lastLightTime = -Infinity;
  }
  point(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * this.width + this.cameraX, y: (clientY - rect.top) / rect.height * this.height + this.cameraY };
  }
  private syncBacking() {
    // Two original art pixels per physics cell. Low/fallback uses one; DPR
    // never multiplies these strict 480 × 1024 maximum backing dimensions.
    this.scale = this.qualityGovernor.effective === 'low' ? 1 : 2;
    if (this.canvas.width !== this.width * this.scale || this.canvas.height !== this.height * this.scale) {
      this.canvas.width = this.width * this.scale; this.canvas.height = this.height * this.scale;
      this.ctx.imageSmoothingEnabled = false;
    }
  }
  private background(run: Run) {
    drawPixelEnvironment(this.ctx, run, { x: this.cameraX, y: this.cameraY, width: this.width, height: this.height }, this.qualityGovernor.effective);
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
    const ctx = this.ctx, x = Math.round(s.x), y = Math.round(s.y);
    // Match the simulation's compact footprints; only fire/tool tips overhang.
    if (s.type === 'torch') {
      ctx.fillStyle = '#513d31'; ctx.fillRect(x - 1, y - 3, 3, 1); ctx.fillRect(x, y - 2, 1, 3);
      ctx.fillStyle = '#d09a60'; ctx.fillRect(x, y - 2, 1, 2);
      drawPixelFlame(ctx, x, y - 3, time, 0.75, this.qualityGovernor.effective !== 'low');
    } else if (s.type === 'workbench') {
      ctx.fillStyle = '#42302c'; ctx.fillRect(x - 3, y - 3, 7, 2); ctx.fillRect(x - 2, y - 1, 1, 2); ctx.fillRect(x + 2, y - 1, 1, 2);
      ctx.fillStyle = '#c08d5c'; ctx.fillRect(x - 3, y - 4, 7, 1); ctx.fillStyle = '#806b52'; ctx.fillRect(x - 2, y - 2, 5, 1);
      ctx.fillStyle = '#b4c8c5'; ctx.fillRect(x - 2, y - 6, 3, 1); ctx.fillStyle = '#916943'; ctx.fillRect(x - 1, y - 5, 1, 1);
      ctx.fillStyle = '#75b8a6'; ctx.fillRect(x + 2, y - 6, 1, 2); ctx.fillStyle = '#d9efd1'; ctx.fillRect(x + 2, y - 6, 1, 1);
    } else {
      ctx.fillStyle = '#66656a'; ctx.fillRect(x - 3, y - 1, 7, 2); ctx.fillStyle = '#a49a86'; ctx.fillRect(x - 3, y - 1, 1, 1); ctx.fillRect(x + 2, y, 1, 1);
      ctx.fillStyle = '#4e342d'; ctx.fillRect(x - 2, y - 1, 5, 1); ctx.fillStyle = '#b67c46'; ctx.fillRect(x - 2, y - 2, 4, 1);
      drawPixelFlame(ctx, x, y - 2, time, 1, this.qualityGovernor.effective !== 'low');
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
    this.syncBacking();
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
    const viewport = { x: this.cameraX, y: this.cameraY, width, height }, quality = this.qualityGovernor.effective;
    this.materialEffects.update(world, viewport, run.time, quality); this.materialEffects.draw(ctx, world, run.time);
    const onScreen = (x: number, y: number, margin = 12) => x >= this.cameraX - margin && y >= this.cameraY - margin && x <= this.cameraX + width + margin && y <= this.cameraY + height + margin;
    const gate = run.portal;
    if (!survival) {
      const pulse = Math.sin(run.time * 3) * 0.2 + 0.8;
      ctx.fillStyle = '#142c41'; ctx.fillRect(gate.x - 6, gate.y - 10, 12, 18);
      ctx.strokeStyle = `rgba(102,232,243,${pulse})`; ctx.lineWidth = 2; ctx.strokeRect(gate.x - 5, gate.y - 9, 10, 17);
      ctx.fillStyle = '#72e8e1'; ctx.fillRect(gate.x - 1, gate.y - 5, 2, 8);
    }
    if (survival) for (const structure of run.structures) if (onScreen(structure.x, structure.y)) this.structure(structure, run.time);
    for (const item of run.wandPickups) {
      if (!onScreen(item.x, item.y)) continue;
      const x = Math.round(item.x), y = Math.round(item.y), glint = Math.floor(run.time * 3) % 4;
      ctx.fillStyle = '#283d45'; ctx.fillRect(x - 5, y + 3, 10, 1); ctx.fillRect(x - 4, y + 4, 8, 1);
      ctx.fillStyle = '#46616a'; ctx.fillRect(x - 4, y + 3, 3, 0.5);
      pixelLine(ctx, x - 3.5, y + 0.5, x + 3, y - 3.5, '#352c35', 1.5);
      pixelLine(ctx, x - 3.5, y, x + 3, y - 4, '#c9985d', 0.5);
      ctx.fillStyle = '#71598b'; ctx.fillRect(x + 2.5, y - 5.5, 2, 2);
      ctx.fillStyle = '#b79ccb'; ctx.fillRect(x + 3, y - 5.5, 1, 1.5);
      ctx.fillStyle = '#ecd5dc'; ctx.fillRect(x + 3, y - 5.5, 0.5, 0.5);
      ctx.fillStyle = '#8b819b'; ctx.fillRect(x - 4 + glint * 2.5, y - 5 - glint % 2, 0.5, 0.5);
    }
    for (const l of run.loot) if (onScreen(l.x, l.y)) {
      const x = Math.round(l.x * 2) / 2, y = Math.round(l.y * 2) / 2;
      ctx.fillStyle = '#7c5734'; ctx.fillRect(x - 1, y - 1, 2.5, 2);
      ctx.fillStyle = '#d4a34f'; ctx.fillRect(x - 0.5, y - 1, 1.5, 1.5);
      ctx.fillStyle = '#ffe8a0'; ctx.fillRect(x - 0.5, y - 1, 0.5, 1);
    }
    for (const enemy of run.enemies) if (onScreen(enemy.x, enemy.y)) drawPixelEnemy(ctx, enemy, run.time);
    this.castFeedback.update(run);
    drawPixelKeeper(ctx, p, input, run.time, survival ? run.tool ?? 'wand' : 'wand', this.castFeedback.castUntil);
    drawPixelProjectiles(ctx, run.projectiles, run.particles, run.time, viewport, quality);
    ctx.restore();
    this.illuminate(run, survival ? run.structures : []);
    // A world-space wand sight stays ahead of the character, away from thumbs.
    if (survival && run.tool === 'wand') drawWandAim(ctx, world, p, input, this.cameraX, this.cameraY);
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
