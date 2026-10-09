import {test,type Page} from '@playwright/test';

/** Passive brackets, not pose injection. A screenshot whose two poses differ is
 * supporting visual evidence, not an exact matched-pose lighting comparison. */
export async function captureDungeonLighting(page:Page,name:string,capture:()=>Promise<unknown>){
 const pose=()=>page.evaluate(()=>{
  const snapshot=window.__dungeonProbe?.(),actor=snapshot?.actors.find(value=>value.id===snapshot.you);
  if(!snapshot||!actor)return null;
  return {source:'authoritative snapshots bracketing capture',phase:snapshot.phase,raid:snapshot.raid,tick:snapshot.tick,elapsed:snapshot.elapsed,
   viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
   actor:{position:actor.position,yaw:actor.yaw,pitch:actor.pitch,phase:actor.phase,time:actor.time,guard:actor.guard,weapon:actor.weapon,hp:actor.hp,status:actor.status},
   enemies:snapshot.enemies.filter(enemy=>enemy.status==='alive').map(enemy=>({id:enemy.id,position:enemy.position,range:Math.hypot(enemy.position.x-actor.position.x,enemy.position.z-actor.position.z)})),
   world:window.__dungeonRenderProbe?.()??null};
 });
 const before=await pose();await capture();const after=await pose();
 if(before?.phase==='raid'||after?.phase==='raid')await test.info().attach(`${name}-lighting-pose`,{body:JSON.stringify({before,after},null,2),contentType:'application/json'});
}
