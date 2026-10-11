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
    const noise = pixelNoise(x, y), exposed = y > 0 && !MATERIALS[world.cells[index - world.width]].solid;
    let shade = noise % 7 - 3, r = color[0], g = color[1], b = color[2];
    if (m === Material.Rock) {
      const strata = ((Math.floor(x / 9) + Math.floor((y + x * 0.19) / 7)) % 5) - 2;
      r = 73 + strata * 3; g = 79 + strata * 3; b = 93 + strata * 4;
      if ((x + Math.floor(y / 9) * 7) % 23 < 2 && y % 9 < 6) shade -= 10;
      if (exposed) shade += 20;
    } else if (m === Material.HardRock) { r = 42; g = 50; b = 68; shade += y % 7 === 0 ? 6 : 0; if (exposed) shade += 12; }
    else if (m === Material.Wood) { shade += x % 6 === 0 ? -23 : y % 4 === 0 ? 11 : 0; if (exposed) shade += 20; }
    else if (m === Material.Sand) { shade += noise > 13 ? 19 : -3; if (exposed) shade += 12; }
    else if (m === Material.Gold) { r = 220; g = 164; b = 57; shade += noise > 9 ? 33 : -16; }
    else if (m === Material.Water) { r = 39; g = 127; b = 185; shade += world.get(x, y - 1) !== m ? 51 : (x + y * 3) % 11 === 0 ? 18 : 0; }
    else if (m === Material.Oil) { r = 108; g = 89; b = 52; shade += world.get(x, y - 1) !== m ? 37 : 0; }
    else if (m === Material.Toxic) { r = 111; g = 168; b = 71; shade += world.get(x, y - 1) !== m ? 40 : 0; }
    else if (m === Material.Lava) { r = 248; g = 90 + noise * 4; b = 39; }
    else if (m === Material.Fire) { r = 255; g = 157 + noise * 5; b = 55 + noise * 3; }
    const pixel = ((y - this.y) * this.width + x - this.x) * 4;
    this.pixels[pixel] = r + shade; this.pixels[pixel + 1] = g + shade; this.pixels[pixel + 2] = b + shade;
    this.pixels[pixel + 3] = m === Material.Air ? 0 : m === Material.Smoke ? 155 : m === Material.Steam ? 185 : 255;
  }
}
