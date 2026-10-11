import type { AdventureSave } from '../types';

export type PreviousGrave = NonNullable<NonNullable<AdventureSave['meadows']>['graves']>[number];
export const graveHasItems = (items: Record<string,number> | undefined): boolean => Object.values(items ?? {}).some(count=>count>0);

/** An index alone changes meaning after an earlier grave is emptied. Bind the
 * target to its position and contents, without changing existing save formats. */
export function previousGraveTarget(grave: PreviousGrave, index: number): string {
 const contents = JSON.stringify([grave.x,grave.y,grave.z,Object.entries(grave.items).sort(([a],[b])=>a<b?-1:a>b?1:0),grave.gearItems]);
 let hash = 2166136261;
 for (let i = 0; i < contents.length; i++) hash = Math.imul(hash ^ contents.charCodeAt(i),16777619);
 return `grave:${index}:${(hash >>> 0).toString(16).padStart(8,'0')}`;
}

export function previousGrave(state: Pick<AdventureSave,'meadows'>, id: string): PreviousGrave | undefined {
 const match = /^grave:(0|[1-9]\d{0,9}):[0-9a-f]{8}$/.exec(id);
 if (!match) return undefined;
 const index = Number(match[1]),grave = state.meadows?.graves?.[index];
 return grave && graveHasItems(grave.items) && previousGraveTarget(grave,index) === id ? grave : undefined;
}
