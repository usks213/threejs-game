/** A duel participant may die between observation and physical key delivery.
 * Only that explicitly permitted terminal state replaces an acknowledgement. */
export function dungeonActionObserved(previous:number,current:number,status:string,acceptDeath=false){
 return current>previous||(acceptDeath&&status==='dead');
}
