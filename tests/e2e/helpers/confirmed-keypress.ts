import type {Page} from '@playwright/test';

export interface KeypressObservation {keydowns:number;notSent:boolean}

/** Observe only a new notice written synchronously by this trusted keypress.
 * Existing text and delayed acknowledgements cannot authorize another action.
 * This listener neither changes the game nor dispatches synthetic input. */
export function installKeypressObservation(element:Element,key:string){
 let keydowns=0,notSent=false,dispatching=false;
 const sample=(records:MutationRecord[])=>{if(dispatching&&records.length&&element.textContent==='同期が完了するまで操作を待っています')notSent=true;};
 const observer=new MutationObserver(sample);
 observer.observe(element,{childList:true,subtree:true,characterData:true});
 const matches=(event:KeyboardEvent)=>event.isTrusted&&!event.repeat&&event.code===key;
 const before=(event:KeyboardEvent)=>{if(matches(event)){observer.takeRecords();keydowns++;dispatching=true;}};
 const after=(event:KeyboardEvent)=>{
  if(matches(event)){sample(observer.takeRecords());dispatching=false;}
 };
 // The game's document keydown handler already exists. Capture clears old
 // mutations; the later bubble listener reads its immediate, pre-send refusal.
 document.addEventListener('keydown',before,true);
 document.addEventListener('keydown',after);
 return {read:():KeypressObservation=>({keydowns,notSent}),stop:()=>{observer.disconnect();document.removeEventListener('keydown',before,true);document.removeEventListener('keydown',after);}};
}

/** At most one new attempt, and only after proof the prior key was never sent.
 * Accepted or uncertain outcomes go to the caller's unchanged state assertion.
 * An input/observation error is never a reason to repeat a state-changing key. */
export async function pressWithUnsentRecovery(ready:()=>Promise<void>,press:()=>Promise<KeypressObservation>){
 for(let attempt=0;attempt<2;attempt++){
  await ready();
  const observation=await press();
  if(observation.keydowns!==1)throw new Error('Expected exactly one trusted guest keypress; refusing to repeat uncertain input');
  if(!observation.notSent)return;
 }
 throw new Error('Guest input was explicitly rejected before sending twice; synchronization did not recover');
}

export async function observeGuestKeypress(page:Page,key:string){
 const handle=await page.locator('#message').evaluateHandle(installKeypressObservation,key);
 return {read:()=>handle.evaluate(value=>value.read()),async dispose(){await handle.evaluate(value=>value.stop()).catch(()=>{});await handle.dispose().catch(()=>{});}};
}
