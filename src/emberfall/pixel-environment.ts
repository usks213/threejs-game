import type { GraphicsQuality } from './lighting';
import type { Run } from './simulation';
import type { TerrainViewport } from './terrain-window';

interface Palette {
  background: string; far: string; middle: string; near: string; edge: string;
  detail: string; accent: string; sky: readonly string[]; motif: 'mine' | 'roots' | 'ruin' | 'crystal' | 'fungal' | 'furnace';
}
/** Original art palettes. Background values stay below playable terrain values. */
const PALETTES: readonly Palette[] = [
  { background: '#11141f', far: '#171d2a', middle: '#202936', near: '#2b343e', edge: '#35444c', detail: '#465153', accent: '#827254', sky: ['#232338', '#2c2b3e', '#3b3444', '#4e3e49'], motif: 'mine' },
  { background: '#101b20', far: '#18272b', middle: '#21352f', near: '#2c4039', edge: '#3b4d40', detail: '#4d5c43', accent: '#857c4c', sky: ['#26303b', '#313e43', '#44534e', '#5d6251'], motif: 'roots' },
  { background: '#201a24', far: '#2a2532', middle: '#34303c', near: '#48404a', edge: '#574d50', detail: '#6b5b54', accent: '#9b825d', sky: ['#39303f', '#4d3b48', '#654a4e', '#845c53'], motif: 'ruin' },
  { background: '#0e1b27', far: '#172937', middle: '#203847', near: '#294552', edge: '#385761', detail: '#497079', accent: '#709794', sky: ['#222f46', '#2b3d50', '#385263', '#496779'], motif: 'crystal' },
  { background: '#191623', far: '#252035', middle: '#302b42', near: '#3e3450', edge: '#524357', detail: '#655366', accent: '#839485', sky: ['#2e293d', '#3d3249', '#4e4152', '#60545b'], motif: 'fungal' },
  { background: '#24141c', far: '#301d2b', middle: '#3f2934', near: '#52343c', edge: '#654349', detail: '#795454', accent: '#ba8058', sky: ['#312332', '#4a2d3b', '#603740', '#794849'], motif: 'furnace' },
];

function mixColor(a: string, b: string, t: number): string {
  let result = '#';
  for (let channel = 1; channel < 7; channel += 2) {
    const left = parseInt(a.slice(channel, channel + 2), 16), right = parseInt(b.slice(channel, channel + 2), 16);
    result += Math.round(left + (right - left) * t).toString(16).padStart(2, '0');
  }
  return result;
}
// Precomputed once: the sky draws no dynamic gradients or per-frame palettes.
const SKY_RAMPS = PALETTES.map(palette => Array.from({ length: 16 }, (_, i) => mixColor(palette.sky[Math.floor(i / 5)], palette.sky[Math.min(3, Math.floor(i / 5) + 1)], i % 5 / 5)));

export const ENVIRONMENT_BUDGET = Object.freeze({ maxWidth: 320, maxHeight: 512, maxLayers: 3, maxDecorations: 40, maxMotes: 28 });
const hash = (x: number, y: number, seed: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return (n ^ n >>> 16) >>> 0;
};
const mod = (n: number, d: number) => (n % d + d) % d;

/** Pixel spans avoid antialiased vector edges, gradients and offscreen buffers. */
function span(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, clipTop: number) {
  x = Math.round(x); y = Math.round(y); width = Math.round(width); height = Math.round(height);
  if (y < clipTop) { height -= clipTop - y; y = clipTop; }
  if (width > 0 && height > 0) ctx.fillRect(x, y, width, height);
}

/** Asymmetric faceted outcrops, with steps at the native art-pixel scale. */
function outcrop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, color: string, edge: string, step: number, clip: number) {
  const downward = (seed & 1) === 0;
  const profile = ROCK_PROFILES[(seed >>> 2) % ROCK_PROFILES.length];
  const widthAt = (row: number) => {
    const t = (downward ? row / h : 1 - row / h) * (profile.length - 1);
    const index = Math.floor(t), fraction = t - index;
    return Math.max(2, Math.floor(w * (profile[index] * (1 - fraction) + profile[Math.min(profile.length - 1, index + 1)] * fraction)) - hash(Math.floor(row / 9), seed & 255, 71) % 4);
  };
  ctx.fillStyle = color;
  for (let row = 0; row < h; row += step) {
    const breadth = widthAt(row);
    const drift = Math.floor(row * ((seed & 4) ? 0.19 : -0.12));
    span(ctx, x + drift - breadth / 2, y + row, breadth, Math.min(step, h - row), clip);
  }
  // A single muted plane separates overlapping silhouettes without outlining
  // every object or turning the distant art into collectible-looking terrain.
  ctx.fillStyle = edge;
  for (let row = Math.floor(h * 0.18); row < h * 0.67; row += step) {
    const breadth = widthAt(row);
    const drift = Math.floor(row * ((seed & 4) ? 0.19 : -0.12));
    span(ctx, x + drift - breadth / 2 + 2, y + row, Math.max(1, Math.floor(breadth * 0.12)), step, clip);
  }
  // Broken horizontal mineral planes, large enough to read as geology rather
  // than noise. Restrained values keep these distant forms behind the player.
  for (let row = 9 + seed % 5; row < h - 10; row += 12) {
    const breadth = widthAt(row), drift = Math.floor(row * ((seed & 4) ? 0.19 : -0.12));
    span(ctx, x + drift - breadth * 0.25, y + row, Math.max(2, breadth * 0.46), 1, clip);
    span(ctx, x + drift + breadth * 0.19, y + row - 2, Math.max(1, breadth * 0.13), 1, clip);
  }
}

const ROCK_PROFILES: readonly (readonly number[])[] = [
  [0.2, 0.58, 0.78, 0.7, 0.95, 0.81, 0.66, 0.72, 0.39, 0.28, 0.13, 0.03],
  [0.38, 0.75, 0.9, 0.62, 0.69, 0.88, 0.7, 0.51, 0.54, 0.31, 0.16, 0.05],
  [0.13, 0.31, 0.52, 0.78, 0.94, 0.76, 0.88, 0.6, 0.44, 0.49, 0.23, 0.08],
];

function roots(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, palette: Palette, clip: number) {
  const length = 18 + seed % 27;
  ctx.fillStyle = palette.near;
  for (let branch = 0; branch < 3; branch++) {
    const direction = branch === 1 ? -1 : 1;
    for (let i = 0; i < length - branch * 5; i += 3) {
      const xx = x + branch * 6 + Math.round(Math.sin(i * 0.12 + branch) * 3) + direction * Math.floor(i / 9);
      span(ctx, xx, y + i, i < 9 ? 3 : 1, 4, clip);
      if (i > 7 && i % 9 === 0) { span(ctx, xx - direction * 4, y + i, 5, 1, clip); }
    }
  }
  ctx.fillStyle = palette.detail;
  for (let i = 0; i < 5; i++) {
    const yy = y + 6 + i * 5, xx = x + 4 + Math.round(Math.sin(i + seed) * 7);
    span(ctx, xx, yy, 3, 1, clip); span(ctx, xx + 1, yy - 1, 1, 3, clip);
  }
}

function ruin(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, palette: Palette, clip: number) {
  const w = 29 + seed % 13, h = 25 + seed % 21;
  ctx.fillStyle = palette.middle;
  span(ctx, x - 2, y + h - 3, w + 9, 5, clip);
  ctx.fillStyle = palette.near;
  span(ctx, x, y + 5, 6, h - 5, clip); span(ctx, x + w - 5, y + 10, 5, h - 10, clip);
  span(ctx, x + 4, y + 3, w - 7, 4, clip); span(ctx, x + 8, y, w - 18, 3, clip);
  // A broken arch and staggered mortar, rather than repeated rectangular fins.
  ctx.fillStyle = palette.edge;
  span(ctx, x + 1, y + 7, 1, h - 9, clip); span(ctx, x + 5, y + 3, w - 10, 1, clip);
  span(ctx, x + w - 4, y + 13, 1, h - 15, clip);
  for (let row = 0; row < 4; row++) {
    ctx.fillStyle = row % 2 ? palette.middle : palette.detail;
    span(ctx, x + 1, y + 11 + row * 5, row % 2 ? 5 : 2, 1, clip);
    span(ctx, x + w - 4, y + 15 + row * 5, 3, 1, clip);
  }
  ctx.fillStyle = palette.middle;
  span(ctx, x + w - 5, y + 10, 3, 3, clip);
  ctx.fillStyle = palette.accent;
  span(ctx, x + 12, y + 4, 1, 2, clip); span(ctx, x + 16, y + 4, 2, 1, clip);
}

function mine(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, palette: Palette, clip: number) {
  const w = 26 + seed % 16, h = 30 + seed % 22;
  ctx.fillStyle = palette.near;
  span(ctx, x, y, w, 3, clip); span(ctx, x + 2, y + 3, 3, h, clip); span(ctx, x + w - 5, y + 3, 3, h - 8, clip);
  for (let i = 0; i < 9; i++) { span(ctx, x + 3 + i, y + 3 + i, 2, 2, clip); span(ctx, x + w - 6 - i, y + 3 + i, 2, 2, clip); }
  ctx.fillStyle = palette.edge;
  span(ctx, x + 1, y, w - 3, 1, clip); span(ctx, x + 2, y + 4, 1, h - 2, clip);
  ctx.fillStyle = palette.middle;
  for (let i = 0; i < 4; i++) span(ctx, x + 2, y + 9 + i * 8, 3, 1, clip);
  // Rusted chain and brass fittings are dim background details, not emitters.
  const chain = 9 + seed % 12;
  ctx.fillStyle = palette.detail;
  for (let i = 0; i < chain; i += 3) span(ctx, x + w / 2 + i % 2, y + 4 + i, 1, 2, clip);
  ctx.fillStyle = palette.accent;
  span(ctx, x + 3, y + 2, 1, 1, clip); span(ctx, x + w - 4, y + 2, 1, 1, clip);
}

function crystal(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, palette: Palette, clip: number) {
  for (let shard = 0; shard < 3; shard++) {
    const h = 8 + (seed >>> shard * 4) % 16, base = x + shard * 6;
    ctx.fillStyle = palette.near;
    for (let row = 0; row < h; row += 2) {
      const half = Math.min(4, 1 + Math.floor(Math.min(row, h - row) / 2));
      span(ctx, base - half, y - h + row, half * 2 + 1, 2, clip);
    }
    ctx.fillStyle = palette.edge;
    span(ctx, base - 1, y - h + 4, 1, Math.max(1, h - 5), clip);
    ctx.fillStyle = palette.accent;
    span(ctx, base - 1, y - h + 3, 1, 2, clip);
  }
}

function fungus(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, palette: Palette, clip: number) {
  for (let i = 0; i < 3; i++) {
    const h = 10 + (seed >>> i * 3) % 18, w = 5 + (seed >>> i * 4) % 5, xx = x + i * 11;
    ctx.fillStyle = palette.near;
    span(ctx, xx, y - h + 4, 2, h - 4, clip); span(ctx, xx - w, y - h + 3, w * 2 + 3, 3, clip);
    span(ctx, xx - w + 2, y - h + 1, w * 2 - 1, 2, clip); span(ctx, xx - 2, y - h, 5, 1, clip);
    ctx.fillStyle = palette.edge;
    span(ctx, xx - w + 3, y - h + 1, w + 1, 1, clip); span(ctx, xx, y - h + 7, 1, h - 8, clip);
    ctx.fillStyle = palette.detail;
    span(ctx, xx - w + 2, y - h + 5, w * 2 - 1, 1, clip);
    ctx.fillStyle = palette.accent;
    span(ctx, xx - 2, y - h + 2, 1, 1, clip);
  }
}

/** Screen-space parallax artwork, drawn before terrain. No world reads or
 * mutations, no per-frame canvas allocations, and no work proportional to the
 * world area. Changing quality only changes distant detail, never game cells. */
export function drawPixelEnvironment(ctx: CanvasRenderingContext2D, run: Run, viewport: TerrainViewport, quality: GraphicsQuality): void {
  const width = Math.max(1, Math.min(ENVIRONMENT_BUDGET.maxWidth, viewport.width));
  const height = Math.max(1, Math.min(ENVIRONMENT_BUDGET.maxHeight, viewport.height));
  const region = run.world.width > 256 ? Math.max(0, Math.min(5, Math.floor(run.player.x / 256))) : run.level === 2 ? 5 : run.level === 1 ? 4 : 0;
  const palette = PALETTES[region], clip = Math.max(0, Math.min(height, Math.ceil(3 - viewport.y)));
  ctx.fillStyle = palette.background; ctx.fillRect(0, 0, width, height);
  // Twilight only above the real world's top edge. Underground shafts never
  // accidentally expose a sky layer when the camera moves or resizes.
  if (clip > 0) {
    for (let i = 0; i < 16; i++) { ctx.fillStyle = SKY_RAMPS[region][i]; ctx.fillRect(0, Math.floor(clip * i / 16), width, Math.ceil(clip / 16) + 1); }
    // Dim clustered cloud banks and two irregular distant ridges break up the
    // broad portrait sky while leaving enough quiet space for the touch HUD.
    for (let cloud = 0; cloud < 6 && clip >= 12; cloud++) {
      const n = hash(cloud, 47, run.seed), x = mod(n % 397 - Math.floor(viewport.x * 0.09), 397) - 50;
      const y = Math.floor(clip * (0.2 + (n % 7) * 0.075)), w = 25 + (n >>> 4) % 45;
      ctx.fillStyle = SKY_RAMPS[region][Math.max(0, Math.floor(y / clip * 15) - 2)];
      ctx.fillRect(x + 7, y, w - 13, 2); ctx.fillRect(x + 2, y + 2, w - 4, 2); ctx.fillRect(x, y + 4, w, 2);
      ctx.fillRect(x + 9, y + 6, w - 19, 1);
    }
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer ? palette.far : palette.middle;
      const offset = viewport.x * (layer ? 0.2 : 0.11);
      for (let x = 0; x < width; x += 2) {
        const position = x + offset, section = Math.floor(position / 31), t = mod(position, 31) / 31;
        const a = hash(section, layer, run.seed) % 17, b = hash(section + 1, layer, run.seed) % 17;
        const ridge = Math.round((a * (1 - t) + b * t) * (layer ? 0.35 : 0.6)) + (layer ? 1 : 3);
        ctx.fillRect(x, clip - ridge, 2, ridge);
      }
    }
    ctx.fillStyle = palette.detail;
    for (let i = 0; i < 15; i++) {
      const x = mod(hash(i, 4, run.seed) % 367 - Math.floor(viewport.x * 0.08), 367);
      const y = hash(i, 2, run.seed) % Math.max(1, Math.floor(clip * 0.8));
      if (x < width) ctx.fillRect(x, y, 1, 1);
    }
  }
  const layers = quality === 'low' ? 2 : 3, step = quality === 'high' ? 2 : 3;
  for (let layer = 0; layer < layers; layer++) {
    const parallax = 0.12 + layer * 0.16, size = 94 - layer * 8;
    const cameraX = Math.floor(viewport.x * parallax), cameraY = Math.floor(viewport.y * parallax);
    const firstX = Math.floor(cameraX / size) - 1, firstY = Math.floor(cameraY / size) - 1;
    const color = layer === 0 ? palette.far : layer === 1 ? palette.middle : palette.near;
    const edge = layer === 0 ? palette.far : layer === 1 ? palette.near : palette.edge;
    for (let yy = firstY; yy <= Math.floor((cameraY + height) / size); yy++) {
      for (let xx = firstX; xx <= Math.floor((cameraX + width) / size) + 1; xx++) {
        const n = hash(xx, yy, run.seed + layer * 137);
        if (n % 4 === 0) continue;
        const x = xx * size + n % 35 - cameraX, y = yy * size + (n >>> 6) % 23 - cameraY;
        outcrop(ctx, x, y, 36 + (n >>> 11) % 31, 48 + (n >>> 17) % 49, n, color, edge, Math.max(step, 4 - layer), clip);
      }
    }
  }
  const cameraX = Math.floor(viewport.x * 0.56), cameraY = Math.floor(viewport.y * 0.56), grid = 82;
  let count = 0;
  for (let yy = Math.floor(cameraY / grid) - 1; yy <= Math.floor((cameraY + height) / grid) && count < ENVIRONMENT_BUDGET.maxDecorations; yy++) {
    for (let xx = Math.floor(cameraX / grid) - 1; xx <= Math.floor((cameraX + width) / grid) && count < ENVIRONMENT_BUDGET.maxDecorations; xx++) {
      const n = hash(xx, yy, run.seed ^ 0x29fba), x = xx * grid + n % 21 - cameraX, y = yy * grid + (n >>> 7) % 25 - cameraY;
      if (n % (quality === 'low' ? 3 : 5) === 0 || y + 64 < clip) continue;
      count++;
      if (palette.motif === 'roots') roots(ctx, x, y, n, palette, clip);
      else if (palette.motif === 'fungal') { fungus(ctx, x, y + 40, n, palette, clip); if (quality !== 'low' && n % 3 === 0) roots(ctx, x + 19, y - 5, n, palette, clip); }
      else if (palette.motif === 'crystal') { crystal(ctx, x, y + 40, n, palette, clip); if (n % 3 === 0) ruin(ctx, x - 9, y - 16, n, palette, clip); }
      else if (palette.motif === 'ruin' || palette.motif === 'furnace') ruin(ctx, x, y, n, palette, clip);
      else mine(ctx, x, y, n, palette, clip);
    }
  }
  // Sparse, slow motes use stable world anchoring instead of a screen-sized
  // modulo, so rotation does not rearrange the entire background composition.
  const motes = quality === 'low' ? 8 : quality === 'balanced' ? 17 : ENVIRONMENT_BUDGET.maxMotes;
  ctx.fillStyle = palette.detail;
  for (let i = 0; i < motes; i++) {
    const x = mod(hash(i, 9, run.seed) % 383 - Math.floor(viewport.x * 0.65) + Math.floor(Math.sin(run.time * 0.17 + i) * 3), 383);
    const y = mod(hash(i, 6, run.seed) % 577 - Math.floor(viewport.y * 0.65) + Math.floor(run.time * 0.8), 577);
    if (x < width && y >= clip && y < height) ctx.fillRect(x, y, 1, 1);
  }
}
