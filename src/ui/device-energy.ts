import type {SkyboundSnapshot} from '../game/skybound/types';
export function deviceEnergy(s:SkyboundSnapshot|undefined,p:{x:number;y:number;z:number}):string{
 if(!s)return '';const ridden=s.parts.find(part=>part.id===s.riding?.seat),distance=(part:SkyboundSnapshot['parts'][number])=>Math.hypot(part.position.x-p.x,part.position.y-p.y,part.position.z-p.z);
 const candidates=ridden?[ridden]:s.parts.filter(part=>distance(part)<=4).sort((a,b)=>distance(a)-distance(b));
 const byId=new Map(s.parts.map(part=>[part.id,part])),seen=new Set<number>();
 for(const root of candidates){if(seen.has(root.id))continue;const queue=[root.id];let energy=0,batteries=0;
  while(queue.length){const id=queue.pop()!;if(seen.has(id))continue;seen.add(id);const part=byId.get(id);if(!part)continue;if(part.kind==='battery'){batteries++;energy+=Math.max(0,part.energy??0);}queue.push(...part.links.filter(link=>!seen.has(link)));}
  if(batteries)return `装置エネルギー ${Math.ceil(energy)}${energy<=0?' · 充電が必要':''}`;
 }
 return '';
}
