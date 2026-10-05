import type {Page} from '@playwright/test';
/** Read-only listeners installed before real input. Slow CDP acknowledgements must
 * not erase evidence of a real, completed transient transition or displayed notice. */
export async function observeAttack(page:Page){
 const handle=await page.evaluateHandle(()=>{let seen:{phase:string;seconds:number}|null=null;const timer=setInterval(()=>{const state=Reflect.get(window,'__inputProbe') as {phase:string;seconds:number}|undefined;if(!seen&&state&&['windup','strike','recover'].includes(state.phase))seen={phase:state.phase,seconds:state.seconds};},10);return {read:()=>seen,stop:()=>clearInterval(timer)};});
 return {read:()=>handle.evaluate(value=>value.read()),async dispose(){await handle.evaluate(value=>value.stop()).catch(()=>{});await handle.dispose().catch(()=>{});}};
}
export async function observeNotice(page:Page,selector:string,needle:string){
 const handle=await page.locator(selector).evaluateHandle((element,needle)=>{let seen:string|null=null;const sample=()=>{const text=element.textContent??'';if(text.includes(needle))seen=text;};const observer=new MutationObserver(sample);observer.observe(element,{childList:true,subtree:true,characterData:true});sample();return {read:()=>seen,stop:()=>observer.disconnect()};},needle);
 return {read:()=>handle.evaluate(value=>value.read()),async dispose(){await handle.evaluate(value=>value.stop()).catch(()=>{});await handle.dispose().catch(()=>{});}};
}
