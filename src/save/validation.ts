/** Strict JSON boundary helpers. Save data is untrusted, even in localStorage. */
export const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export const number=(v:unknown,min=-1e6,max=1e6):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>number(v,min,max)&&Number.isSafeInteger(v);
export const text=(v:unknown,max=160):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
export const vector=(v:unknown):v is {x:number;y:number;z:number}=>record(v)&&number(v.x)&&number(v.y)&&number(v.z);
export function checksum(value:string){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
