import type { Vec3 } from '../world/types';
import type { FluidCell } from './fluid';

export interface IndexedCell {
  id: string;
  cell: FluidCell;
  order: number;
  distance: number;
}
interface Bucket { x: number; z: number; entries: Map<string, IndexedCell> }
const BUCKET_SIZE = 8;
const compare = (a: IndexedCell, b: IndexedCell) => a.distance - b.distance || a.order - b.order;
const distance = (cell: Vec3, centers: readonly Vec3[]): number => {
  let nearest = Infinity;
  for (const p of centers) nearest = Math.min(nearest, (p.x - cell.x) ** 2 + (p.z - cell.z) ** 2);
  return nearest;
};

/** Partition by the same total order as the final sort, without discarding ties.
 * A bounded selection budget falls back to sorting on adversarial input. */
function selectNearest(entries:IndexedCell[],limit:number):void {
  let left=0,right=entries.length-1,budget=2*Math.ceil(Math.log2(entries.length));
  const target=limit-1;
  while(left<right){
    if(--budget<0){entries.sort(compare);return;}
    const middle=(left+right)>>1;
    if(compare(entries[left],entries[middle])>0)[entries[left],entries[middle]]=[entries[middle],entries[left]];
    if(compare(entries[left],entries[right])>0)[entries[left],entries[right]]=[entries[right],entries[left]];
    if(compare(entries[middle],entries[right])>0)[entries[middle],entries[right]]=[entries[right],entries[middle]];
    const pivot=entries[middle];let low=left,high=right;
    while(low<=high){while(compare(entries[low],pivot)<0)low++;while(compare(entries[high],pivot)>0)high--;if(low<=high){const value=entries[low];entries[low++]=entries[high];entries[high--]=value;}}
    if(target<=high)right=high;else if(target>=low)left=low;else return;
  }
}

/** A Map-compatible index: external restore/clear/set/delete calls cannot leave stale buckets. */
export class IndexedFluidCells extends Map<string, FluidCell> {
  private readonly buckets = new Map<string, Bucket>();
  private readonly columns = new Map<string, Map<string, IndexedCell>>();
  private readonly entriesById = new Map<string, IndexedCell>();
  private nextOrder = 0;
  constructor(private readonly changed: () => void) { super(); }
  override set(id: string, cell: FluidCell): this {
    const existing = this.entriesById.get(id);
    if (existing && existing.cell.x === cell.x && existing.cell.z === cell.z) existing.cell = cell;
    else {
      const order = existing?.order ?? this.nextOrder++;
      if (existing) this.removeEntry(existing);
      const entry = { id, cell, order, distance: 0 }, x = Math.floor(cell.x / BUCKET_SIZE), z = Math.floor(cell.z / BUCKET_SIZE);
      const bucketId = `${x},${z}`;
      let bucket = this.buckets.get(bucketId);
      if (!bucket) { bucket = { x: x * BUCKET_SIZE, z: z * BUCKET_SIZE, entries: new Map() }; this.buckets.set(bucketId, bucket); }
      bucket.entries.set(id, entry);
      const columnId = `${cell.x},${cell.z}`;
      let column = this.columns.get(columnId);
      if (!column) { column = new Map(); this.columns.set(columnId, column); }
      column.set(id, entry); this.entriesById.set(id, entry);
    }
    super.set(id, cell); this.changed(); return this;
  }
  private removeEntry(entry: IndexedCell): void {
    const { id, cell } = entry, bucketId = `${Math.floor(cell.x / BUCKET_SIZE)},${Math.floor(cell.z / BUCKET_SIZE)}`;
    const bucket = this.buckets.get(bucketId);
    bucket?.entries.delete(id); if (bucket?.entries.size === 0) this.buckets.delete(bucketId);
    const columnId = `${cell.x},${cell.z}`, column = this.columns.get(columnId);
    column?.delete(id); if (column?.size === 0) this.columns.delete(columnId);
    this.entriesById.delete(id);
  }
  override delete(id: string): boolean {
    const entry = this.entriesById.get(id); if (!entry) return false;
    this.removeEntry(entry); super.delete(id); this.changed(); return true;
  }
  override clear(): void {
    super.clear(); this.entriesById.clear(); this.columns.clear(); this.buckets.clear(); this.nextOrder = 0; this.changed();
  }
  column(x: number, z: number): Iterable<IndexedCell> { return this.columns.get(`${x},${z}`)?.values() ?? []; }
  first(limit: number): IndexedCell[] {
    const result: IndexedCell[] = [];
    for (const id of this.keys()) { result.push(this.entriesById.get(id)!); if (result.length === limit) break; }
    return result;
  }
  /** Exact nearest K with stable Map insertion-order ties; far water is never visited or discarded. */
  nearest(centers: readonly Vec3[], limit: number, radius = Infinity): IndexedCell[] {
    const radiusSquared = radius * radius;
    const buckets: { bucket: Bucket; distance: number }[] = [];
    for (const bucket of this.buckets.values()) {
      let lowerBound = Infinity;
      for (const p of centers) {
        const dx = Math.max(bucket.x - p.x, 0, p.x - bucket.x - BUCKET_SIZE);
        const dz = Math.max(bucket.z - p.z, 0, p.z - bucket.z - BUCKET_SIZE);
        lowerBound = Math.min(lowerBound, dx * dx + dz * dz);
      }
      if (lowerBound < radiusSquared) buckets.push({ bucket, distance: lowerBound });
    }
    // Visible queries already have a finite radius and usually return most of that region.
    // Partition crowded views first, then sort the exact visible subset once.
    if (Number.isFinite(radius)) {
      const visible: IndexedCell[] = [];
      for (const { bucket } of buckets) for (const entry of bucket.entries.values()) {
        entry.distance = distance(entry.cell, centers);
        if (entry.distance < radiusSquared) visible.push(entry);
      }
      if(Number.isSafeInteger(limit)&&limit>0&&visible.length>limit+1024){selectNearest(visible,limit);visible.length=limit;visible.sort(compare);return visible;}
      visible.sort(compare); return visible.slice(0, limit);
    }
    buckets.sort((a, b) => a.distance - b.distance);
    const heap: IndexedCell[] = [];
    for (const { bucket, distance: lowerBound } of buckets) {
      if (heap.length === limit && lowerBound > heap[0].distance) break;
      for (const entry of bucket.entries.values()) {
        const d = distance(entry.cell, centers);
        if (d >= radiusSquared) continue;
        entry.distance = d; const candidate = entry;
        if (heap.length < limit) {
          let i = heap.length; heap.push(candidate);
          while (i > 0) { const parent = (i - 1) >> 1; if (compare(heap[parent], candidate) >= 0) break; heap[i] = heap[parent]; i = parent; }
          heap[i] = candidate;
        } else if (compare(candidate, heap[0]) < 0) {
          let i = 0;
          while (true) {
            const left = i * 2 + 1; if (left >= heap.length) break;
            const right = left + 1, child = right < heap.length && compare(heap[right], heap[left]) > 0 ? right : left;
            if (compare(candidate, heap[child]) >= 0) break;
            heap[i] = heap[child]; i = child;
          }
          heap[i] = candidate;
        }
      }
    }
    heap.sort(compare); return heap;
  }
}
