/** The simulation is independent of rendering, the DOM, and wall-clock time. */
export enum Material {
  Air = 0, Rock, HardRock, Wood, Sand, Water, Oil, Toxic, Lava, Fire, Smoke, Steam, Gold,
}

export interface MaterialInfo {
  readonly name: string;
  readonly color: readonly [number, number, number];
  readonly solid: boolean;
  readonly density: number;
}

export const MATERIALS: readonly MaterialInfo[] = [
  { name: '空気', color: [13, 17, 30], solid: false, density: 0 },
  { name: '岩', color: [73, 75, 98], solid: true, density: 10 },
  { name: '硬岩', color: [36, 40, 61], solid: true, density: 20 },
  { name: '木', color: [134, 83, 55], solid: true, density: 6 },
  { name: '砂', color: [208, 171, 100], solid: true, density: 5 },
  { name: '水', color: [52, 146, 225], solid: false, density: 3 },
  { name: '油', color: [150, 117, 53], solid: false, density: 2 },
  { name: '毒液', color: [113, 191, 77], solid: false, density: 3.2 },
  { name: '溶岩', color: [252, 95, 43], solid: false, density: 4 },
  { name: '炎', color: [255, 180, 64], solid: false, density: -0.2 },
  { name: '煙', color: [111, 102, 120], solid: false, density: -0.1 },
  { name: '蒸気', color: [165, 204, 221], solid: false, density: -0.15 },
  { name: '金鉱', color: [241, 197, 73], solid: true, density: 8 },
];

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
const CHUNK_SIZE = 16;
const isLiquid = (m: Material): boolean => m >= Material.Water && m <= Material.Lava;
const isGas = (m: Material): boolean => m >= Material.Fire && m <= Material.Steam;
const lifetime = (m: Material): number => m === Material.Fire ? 90 : m === Material.Smoke ? 120 : m === Material.Steam ? 100 : 0;

/**
 * A bounded, seeded cellular world. One step is one simulation tick. Particle
 * movement swaps cells (and their lifetimes), preserving nonreactive material.
 * Consumers clear dirty after uploading the corresponding texture chunks.
 */
export class CellWorld {
  readonly cells: Uint8Array;
  readonly life: Uint8Array;
  readonly dirty = new Set<number>();
  readonly chunkColumns: number;
  tick = 0;
  rngState: number;
  private readonly updated: Uint32Array;
  private frame = 0;

  constructor(readonly width: number, readonly height: number, seed = 1) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3 || width > 256 || height > 384) {
      throw new RangeError('CellWorld dimensions must be integers in 3…256 × 3…384.');
    }
    this.cells = new Uint8Array(width * height);
    this.life = new Uint8Array(width * height);
    this.updated = new Uint32Array(width * height);
    this.chunkColumns = Math.ceil(width / CHUNK_SIZE);
    this.rngState = seed >>> 0;
    this.markAllDirty();
  }

  get(x: number, y: number): Material {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y)) return Material.HardRock;
    return this.cells[y * this.width + x];
  }

  set(x: number, y: number, material: Material): void {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inBounds(x, y) || !Number.isInteger(material) || material < 0 || material >= MATERIALS.length) return;
    const index = y * this.width + x;
    if (this.cells[index] === material) return;
    this.replace(index, material);
  }

  fillRect(x: number, y: number, width: number, height: number, material: Material): void {
    if (![x, y, width, height].every(Number.isFinite)) return;
    const right = Math.min(this.width, Math.ceil(x + width));
    const bottom = Math.min(this.height, Math.ceil(y + height));
    for (let yy = Math.max(0, Math.floor(y)); yy < bottom; yy++) {
      for (let xx = Math.max(0, Math.floor(x)); xx < right; xx++) this.set(xx, yy, material);
    }
  }

  /** Removes breakable solid terrain and returns the removed cell count. */
  carveCircle(x: number, y: number, radius: number, power: number): number {
    if (![x, y, radius, power].every(Number.isFinite) || radius < 0 || power <= 0) return 0;
    let removed = 0;
    const right = Math.min(this.width - 2, Math.ceil(x + radius));
    const bottom = Math.min(this.height - 2, Math.ceil(y + radius));
    for (let yy = Math.max(1, Math.floor(y - radius)); yy <= bottom; yy++) {
      for (let xx = Math.max(1, Math.floor(x - radius)); xx <= right; xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 > radius * radius) continue;
        const material = this.get(xx, yy);
        const hardness = material === Material.Rock ? 4 : material === Material.Gold ? 3 :
          material === Material.Wood || material === Material.Sand ? 1 : Infinity;
        if (power >= hardness) { this.set(xx, yy, Material.Air); removed++; }
      }
    }
    return removed;
  }

  markAllDirty(): void {
    const count = this.chunkColumns * Math.ceil(this.height / CHUNK_SIZE);
    for (let i = 0; i < count; i++) this.dirty.add(i);
  }

  step(): void {
    this.tick++;
    this.frame = (this.frame + 1) >>> 0;
    if (this.frame === 0) { this.updated.fill(0); this.frame = 1; }
    // Alternating scan direction removes a persistent left/right flow bias.
    const direction = this.tick % 2 === 0 ? 1 : -1;
    for (let y = this.height - 1; y >= 0; y--) {
      for (let n = 0; n < this.width; n++) {
        const x = direction === 1 ? n : this.width - 1 - n;
        const index = y * this.width + x;
        const material = this.cells[index] as Material;
        if (material === Material.Air || material === Material.HardRock || material === Material.Rock || material === Material.Gold || this.updated[index] === this.frame) continue;
        if (this.react(index, x, y, material)) continue;
        if (material === Material.Wood) continue;
        if (isGas(material)) {
          this.updated[index] = this.frame;
          if (this.life[index] > 0) this.life[index]--;
          if (this.life[index] === 0) {
            this.replace(index, material === Material.Steam ? Material.Water : material === Material.Fire ? Material.Smoke : Material.Air);
            continue;
          }
          const side = this.random() < 0.5 ? -1 : 1;
          if (this.move(index, x, y - 1, material) || this.move(index, x + side, y - 1, material) || this.move(index, x - side, y - 1, material)) continue;
          if (this.random() < 0.25) this.move(index, x + side, y, material);
        } else if (material === Material.Sand || isLiquid(material)) {
          const side = this.random() < 0.5 ? -1 : 1;
          if (this.move(index, x, y + 1, material) || this.move(index, x + side, y + 1, material) || this.move(index, x - side, y + 1, material)) continue;
          if (isLiquid(material)) {
            // Horizontal flow never swaps two liquids: density only acts downwards.
            if (!this.move(index, x + side, y, material, true)) this.move(index, x - side, y, material, true);
          }
        }
      }
    }
  }

  private inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private random(): number {
    // A 32-bit LCG permits zero seeds and exposes a compact, saveable state.
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 0x100000000;
  }

  private touch(index: number): void {
    const y = Math.floor(index / this.width);
    const x = index - y * this.width;
    this.dirty.add(Math.floor(y / CHUNK_SIZE) * this.chunkColumns + Math.floor(x / CHUNK_SIZE));
  }

  private replace(index: number, material: Material): void {
    this.cells[index] = material;
    this.life[index] = lifetime(material);
    this.updated[index] = this.frame;
    this.touch(index);
  }

  private move(index: number, x: number, y: number, material: Material, horizontal = false): boolean {
    if (!this.inBounds(x, y)) return false;
    const target = y * this.width + x;
    const other = this.cells[target] as Material;
    if (other !== Material.Air && this.updated[target] === this.frame) return false;
    const displaces = !horizontal && !isGas(material) && (isGas(other) || (isLiquid(other) && MATERIALS[material].density > MATERIALS[other].density));
    if (other !== Material.Air && !displaces) return false;
    this.cells[target] = material;
    this.cells[index] = other;
    const remainingLife = this.life[target];
    this.life[target] = this.life[index];
    this.life[index] = remainingLife;
    this.updated[index] = this.frame;
    this.updated[target] = this.frame;
    this.touch(index); this.touch(target);
    return true;
  }

  private react(index: number, x: number, y: number, material: Material): boolean {
    if (material !== Material.Fire && material !== Material.Lava && material !== Material.Water && material !== Material.Toxic) return false;
    const start = (this.tick + x + y) & 3;
    for (let n = 0; n < 4; n++) {
      const direction = (start + n) & 3;
      const nx = x + DX[direction]; const ny = y + DY[direction];
      if (!this.inBounds(nx, ny)) continue;
      const target = ny * this.width + nx;
      const other = this.cells[target] as Material;
      if ((material === Material.Lava && (other === Material.Water || other === Material.Toxic)) ||
          ((material === Material.Water || material === Material.Toxic) && other === Material.Lava)) {
        this.replace(index, material === Material.Lava ? Material.Rock : Material.Steam);
        this.replace(target, other === Material.Lava ? Material.Rock : Material.Steam);
        return true;
      }
      if ((material === Material.Water && other === Material.Toxic) || (material === Material.Toxic && other === Material.Water)) {
        // Clean water neutralizes the neighboring toxic cell, without consuming water.
        this.replace(material === Material.Toxic ? index : target, Material.Water);
        if (material === Material.Toxic) return true;
      }
      if ((material === Material.Fire && other === Material.Water) || (material === Material.Water && other === Material.Fire)) {
        this.replace(index, material === Material.Fire ? Material.Smoke : Material.Steam);
        this.replace(target, other === Material.Fire ? Material.Smoke : Material.Steam);
        return true;
      }
      if ((material === Material.Fire || material === Material.Lava) && (other === Material.Oil || other === Material.Wood)) {
        this.replace(target, Material.Fire);
      }
    }
    return false;
  }
}
