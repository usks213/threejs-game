/** Original encounter rules. The exposed core follows the shared authority clock. */
export const STORMCORE={exposedSeconds:2,armoredDamage:.45,exposedDamage:1.65,frostDamage:1.25};
export function stormcoreMultiplier(seconds:number,exposedUntil:number|undefined,element:string):number{return (exposedUntil??0)>seconds?STORMCORE.exposedDamage:element==='frost'?STORMCORE.frostDamage:STORMCORE.armoredDamage;}
