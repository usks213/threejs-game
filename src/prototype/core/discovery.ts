/** Discovery is informational only: inventory writes stay authoritative. Keeping the
 * observer on the shared records also covers awards consumed before the next tick. */
export function acquisitionInventory<K extends string|number>(initial:Record<K,number>,acquired:(id:string)=>void):Record<K,number> {
 return new Proxy(initial,{
  set(target,key,value:unknown){
   const previous=Reflect.get(target,key),written=Reflect.set(target,key,value);
   if(written&&typeof key==='string'&&typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value>(typeof previous==='number'?previous:0))acquired(key);
   return written;
  },
 });
}

/** A bounded metadata extension of existing saves. Future well-formed IDs can be
 * discarded without granting items, recipes, regions, rewards or map information. */
export const MAX_DISCOVERY_IDS=256;
export function validDiscoveryIds(value:unknown):value is string[]|undefined {
 return value===undefined||Array.isArray(value)&&value.length<=MAX_DISCOVERY_IDS&&new Set(value).size===value.length&&Array.from(value).every(id=>typeof id==='string'&&/^(material:[1-9][0-9]{0,3}|item:[a-z][a-z0-9-]{0,63})$/.test(id));
}
export const materialDiscoveryId=(id:number)=>`material:${id}`;
export const itemDiscoveryId=(id:string)=>`item:${id}`;
