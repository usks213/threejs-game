import { Material, MATERIALS } from './materials';
import type { CellWorld } from './materials';
import { pixelNoise } from './render-materials';

export interface TerrainViewport { x: number; y: number; width: number; height: number }
export interface DirtyRect { x: number; y: number; width: number; height: number }
/** A fixed-size, chunk-aligned window; memory/work never scale with world area. */
export class TerrainWindow {
  x = 0; y = 0; width = 0; height = 0; cellsWritten = 0; chunksChecked = 0;
  pixels = new Uint8ClampedArray(0);
  private world: CellWorld | null = null;
  update(world: CellWorld, view: TerrainViewport): DirtyRect | null {
    const width = Math.min(world.width, Math.ceil(Math.min(320, view.width) / 16) * 16 + 48);
    const height = Math.min(world.height, Math.ceil(Math.min(512, view.height) / 16) * 16 + 48);
    const x = Math.max(0, Math.min(world.width - width, Math.floor(view.x / 16) * 16 - 16));
    const y = Math.max(0, Math.min(world.height - height, Math.floor(view.y / 16) * 16 - 16));
    const force = this.world !== world || this.x !== x || this.y !== y || this.width !== width || this.height !== height;
    if (this.width !== width || this.height !== height) this.pixels = new Uint8ClampedArray(width * height * 4);
    this.x = x; this.y = y; this.width = width; this.height = height; this.world = world; this.cellsWritten = 0; this.chunksChecked = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    // Query only viewport chunks; don't iterate an entire large world's dirty set.
    for (let cy = Math.floor(y / 16); cy <= Math.floor((y + height - 1) / 16); cy++) for (let cx = Math.floor(x / 16); cx <= Math.floor((x + width - 1) / 16); cx++) {
      this.chunksChecked++;
      const chunk = cy * world.chunkColumns + cx;
      if (!force && !world.dirty.has(chunk) && !world.dirty.has(chunk - world.chunkColumns) && !world.dirty.has(chunk + world.chunkColumns) && !world.dirty.has(chunk - 1) && !world.dirty.has(chunk + 1)) continue;
      const left = Math.max(x, cx * 16), top = Math.max(y, cy * 16), right = Math.min(x + width, cx * 16 + 16), bottom = Math.min(y + height, cy * 16 + 16);
      minX = Math.min(minX, left - x); minY = Math.min(minY, top - y); maxX = Math.max(maxX, right - x); maxY = Math.max(maxY, bottom - y);
      for (let yy = top; yy < bottom; yy++) for (let xx = left; xx < right; xx++) { this.paint(world, xx, yy); this.cellsWritten++; }
    }
    // Off-window edits will be read fresh when the camera enters that window.
    world.dirty.clear();
    return maxX > minX ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
  }
  private paint(world: CellWorld, x: number, y: number) {
    const index = y * world.width + x, m = world.cells[index], color = MATERIALS[m].color;
    const pixel = ((y - this.y) * this.width + x - this.x) * 4;
    // Never paint outside the actual material silhouette. In particular a mined
    // cell becomes completely transparent, rather than retaining painted ore.
    if (m === Material.Air) { this.pixels.fill(0, pixel, pixel + 4); return; }
    const noise = pixelNoise(x, y), grain = pixelNoise(x >> 1, y >> 1);
    const above = world.get(x, y - 1), below = world.get(x, y + 1);
    const left = world.get(x - 1, y), right = world.get(x + 1, y);
    const topEdge = !MATERIALS[above].solid, bottomEdge = !MATERIALS[below].solid;
    let shade = noise % 5 - 2, r = color[0], g = color[1], b = color[2];
    if (m === Material.Rock || m === Material.HardRock) {
      // Warped, staggered mineral slabs use coarse color fields and thin seams.
      // Their coordinates stay fixed when dirty chunks or the camera move.
      const bend = pixelNoise(Math.floor(x / 23), Math.floor(y / 19)) - 8;
      const band = y + Math.floor(x * 0.21) + bend;
      const row = Math.floor(band / 7), offset = pixelNoise(row, 51);
      const shard = Math.floor((x + offset + Math.floor(band / 3)) / 13);
      const mineral = pixelNoise(shard, row);
      const coarse = pixelNoise(Math.floor((x + y * 0.35) / 27), Math.floor(y / 21));
      const region = world.width > 256 ? Math.min(5, Math.floor(x / 256)) : 0;
      const tint = ROCK_TINTS[region];
      r = tint[0]; g = tint[1]; b = tint[2];
      shade += (mineral - 8) * 1.35 + (coarse - 8) * 0.9;
      const seam = ((band % 7) + 7) % 7;
      const fracture = ((x + offset + Math.floor(band / 3)) % 13 + 13) % 13;
      if (seam === 0 && mineral < 12) shade -= 15;
      else if (seam === 1 && mineral < 12) shade += 8;
      if (fracture === 0 && seam < 5 && mineral > 4) shade -= 12;
      // Sparse quartz-colored flakes are distinct from collectible yellow ore.
      if (coarse > 12 && grain < 4) { r += 10; g += 9; b += 7; }
      if (m === Material.HardRock) { r -= 21; g -= 21; b -= 19; shade *= 0.65; }
      if (topEdge) { r += 29; g += 22; b += 12; shade += noise % 4; }
      else if (!MATERIALS[world.get(x, y - 2)].solid) { r += 12; g += 8; b += 2; }
      if (bottomEdge && !topEdge) shade -= 23;
      if (!MATERIALS[left].solid) shade += 9;
      if (!MATERIALS[right].solid && !topEdge) shade -= 13;
    } else if (m === Material.Wood) {
      const grainLine = (x + Math.floor(y / 9) + (pixelNoise(Math.floor(y / 7), 3) > 9 ? 1 : 0)) % 5;
      r = 116; g = 75; b = 48;
      shade += grainLine === 0 ? -25 : grainLine === 1 ? 16 : grain % 6;
      if ((y + Math.floor(x / 3) * 3) % 13 === 0) shade -= 16;
      if (above !== m) { r += 44; g += 33; b += 16; }
      if (below !== m) shade -= 14;
      if (left !== m) shade += 13;
      if (right !== m) shade -= 17;
    } else if (m === Material.Sand) {
      r = 183; g = 142; b = 83;
      shade += grain > 10 ? 18 : grain < 5 ? -13 : 0;
      if (noise > 13) { r += 28; g += 23; b += 12; }
      if (above !== m) { r += 27; g += 24; b += 16; }
      if (below !== m) shade -= 12;
    } else if (m === Material.Gold) {
      const facet = (x + y * 2 + Math.floor(y / 3)) % 7;
      r = 185; g = 117; b = 35;
      shade += grain < 5 ? -31 : facet < 3 ? 29 : -7;
      if (facet === 1 || topEdge) { r += 39; g += 50; b += 38; }
      if (noise === 16) { r = 255; g = 232; b = 155; shade = 0; }
    } else if (m >= Material.Water && m <= Material.Lava) {
      const surface = above !== m;
      const shallow = !surface && world.get(x, y - 2) !== m;
      const ripple = (x + Math.floor(y / 3) * 5) % 13;
      if (m === Material.Water) {
        r = 26; g = 92; b = 133;
        if (surface) { r = 111; g = 194; b = 202; shade += ripple < 4 ? 21 : -4; }
        else if (shallow) { r = 44; g = 133; b = 166; }
        else { shade += grain > 11 ? 7 : -3; if (ripple === 0) { g += 11; b += 10; } }
      } else if (m === Material.Oil) {
        r = surface ? 171 : 89; g = surface ? 142 : 76; b = surface ? 82 : 51;
        if (grain > 12) { r += 13; b += 18; }
      } else if (m === Material.Toxic) {
        r = surface ? 165 : 70; g = surface ? 210 : 119; b = surface ? 94 : 61;
        if (noise > 12) { r += 10; g += 16; }
      } else {
        const crust = grain < 5 && !surface;
        r = crust ? 158 : 244; g = crust ? 53 : 93 + grain * 4; b = crust ? 39 : 31;
        if (surface || noise > 14) { r = 255; g = 192; b = 76; }
      }
      if (MATERIALS[left].solid || MATERIALS[right].solid) shade -= 8;
    } else if (m === Material.Fire) { r = 255; g = 157 + noise * 5; b = 55 + noise * 3; }
    this.pixels[pixel] = r + shade; this.pixels[pixel + 1] = g + shade; this.pixels[pixel + 2] = b + shade;
    this.pixels[pixel + 3] = m === Material.Smoke ? 115 + grain * 3 : m === Material.Steam ? 145 + grain * 2 : 255;
  }
}

// Muted lithologies keep every region recognizable without changing resources.
const ROCK_TINTS: readonly (readonly [number, number, number])[] = [
  [76, 65, 67], [67, 73, 62], [106, 84, 66], [59, 76, 88], [71, 65, 84], [91, 59, 62],
];
