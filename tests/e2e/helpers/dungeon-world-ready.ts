import {expect,test,type Page} from '@playwright/test';
const recorded=new WeakMap<Page,string>();

/** Wait before pressing/holding real inputs. Geometry readiness is separate from
 * WebGL initialization and phase=raid. This reads evidence; it never drives state. */
export async function waitForDungeonWorld(page:Page){
 await expect(page.locator('.dungeon-canvas')).toHaveAttribute('data-world-ready','true',{timeout:45000});
 await expect(page.getByTestId('dungeon-world-loading')).toBeHidden();
 if(new URL(page.url()).searchParams.get('test')!=='1')return;
 const evidence=await page.evaluate(()=>({coverage:window.__dungeonRenderProbe?.()??null,raid:window.__dungeonProbe?.()?.raid,authoritativeElapsed:window.__dungeonProbe?.()?.elapsed}));
 const coverage=evidence.coverage;
 expect(coverage?.firstFrame,'The first revealed frame records actual complete geometry coverage').not.toBeNull();
 const first=coverage!.firstFrame!;
 expect(first.requiredChunks).toBeGreaterThan(0);expect(first.evaluatedChunks).toBe(first.requiredChunks);
 expect(first.meshChunks).toBe(first.requiredChunks);expect(first.latestDoors).toBe(true);
 expect(coverage!.preparationMs).toBeGreaterThanOrEqual(0);expect(first.afterMs).toBeGreaterThanOrEqual(coverage!.preparationMs!);
 const key=JSON.stringify(first);if(recorded.get(page)!==key){recorded.set(page,key);await test.info().attach('dungeon-first-complete-frame',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});}
}
