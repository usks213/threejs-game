import type {SkyContactEvent} from './types';
/** Each presentation consumer owns its cursor; repeated snapshots never replay an authority event. */
export class SkyContactCursor {
 private readonly seen=new Set<string>();private lastTick=-1;
 take(events:readonly SkyContactEvent[]|undefined,tick:number):SkyContactEvent[]{
  if(tick<this.lastTick)this.seen.clear();this.lastTick=tick;const fresh:SkyContactEvent[]=[];
  for(const event of events??[])if(event.tick<=tick&&event.tick>=tick-30&&!this.seen.has(event.id)){this.seen.add(event.id);fresh.push(event);}
  while(this.seen.size>256)this.seen.delete(this.seen.values().next().value!);return fresh;
 }
}
