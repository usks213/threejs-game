import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {expect,type Page,type JSHandle} from '@playwright/test';

const execFileAsync=promisify(execFile);
export const nativeInputEnabled=(mobile=false)=>!mobile&&process.env.E2E_NATIVE_MOUSE==='1';
export const desktopInputLabel=()=>nativeInputEnabled()?'Desktop X11 XTEST relative mouse and keyboard/button input; CI emulation, not a physical device':'Desktop production keyboard-look and Playwright keyboard input; no native relative-mouse claim';
export type NativeCommand=(args:string[],timeout?:number)=>Promise<void>;
export const nativeCommand:NativeCommand=async(args,timeout=5000)=>{
 if(process.platform!=='linux'||!process.env.DISPLAY)throw Error('Native input requires headed Linux Chromium on an isolated X11 display');
 await execFileAsync('xdotool',args,{timeout,maxBuffer:16384});
};
const namedKeys:Record<string,string>={ShiftLeft:'Shift_L',ControlLeft:'Control_L',AltLeft:'Alt_L',Space:'space',Escape:'Escape',Tab:'Tab',Enter:'Return',Delete:'Delete',Home:'Home',End:'End',PageUp:'Prior',PageDown:'Next',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',F3:'F3',F4:'F4'};
export function nativeKeyName(code:string){
 if(/^Key[A-Z]$/.test(code))return code.slice(3).toLowerCase();
 if(/^Digit[0-9]$/.test(code))return code.slice(5);
 if(namedKeys[code])return namedKeys[code];
 throw Error('Unsupported native key code: '+code);
}
/** Arguments go straight to the official xdotool binary, never through a shell. */
export function createNativeKeyboard(run:NativeCommand=nativeCommand){
 return {
  down:async(code:string,timeout?:number)=>run(['keydown',nativeKeyName(code)],timeout),
  up:async(code:string)=>run(['keyup',nativeKeyName(code)]),
  async pulse(code:string,milliseconds:number){
   if(!Number.isFinite(milliseconds)||milliseconds<0||milliseconds>1200)throw Error('Native key pulse exceeds the existing input-duration bound');
   const key=nativeKeyName(code);
   // Hold/release are scheduled by X11, independently of renderer/CDP replies.
   try{await run(['keydown',key,'sleep',String(milliseconds/1000),'keyup',key],milliseconds+5000);}
   catch(error){await run(['keyup',key]).catch(()=>{});throw error;}
  },
 };
}
export const nativeKeyboard=createNativeKeyboard();
export const desktopKeyDown=(page:Page,code:string)=>nativeInputEnabled()?nativeKeyboard.down(code):page.keyboard.down(code);
export const desktopKeyUp=(page:Page,code:string)=>nativeInputEnabled()?nativeKeyboard.up(code):page.keyboard.up(code);
export const desktopKeyPress=(page:Page,code:string)=>nativeInputEnabled()?nativeKeyboard.pulse(code,40):page.keyboard.press(code);
export const nativeRelativeMouse=(dx:number,dy:number,timeout=5000)=>{
 if(!Number.isSafeInteger(dx)||!Number.isSafeInteger(dy))throw Error('Native relative motion requires finite integer pixels');
 // Never add --sync: Pointer Lock recentering can outrun its position poll.
 return nativeCommand(['mousemove_relative','--',String(dx),String(dy)],timeout);
};
/** Keep each XTEST move well inside the centered canvas while Chromium handles
 * Pointer Lock recentering. Integer remainders belong to later real OS moves. */
export function* nativeRelativeSteps(dx:number,dy:number,size:{width:number;height:number}){
 if(!Number.isSafeInteger(dx)||!Number.isSafeInteger(dy))throw Error('Native relative motion requires finite integer pixels');
 if(!Number.isFinite(size.width)||!Number.isFinite(size.height)||size.width<8||size.height<8)throw Error('Invalid locked canvas geometry');
 const limitX=Math.min(64,Math.floor(size.width/4)),limitY=Math.min(64,Math.floor(size.height/4));
 const count=Math.max(Math.ceil(Math.abs(dx)/limitX),Math.ceil(Math.abs(dy)/limitY));
 let x=0,y=0;
 for(let i=1;i<=count;i++){const nextX=Math.round(dx*(i/count)),nextY=Math.round(dy*(i/count));yield {dx:nextX-x,dy:nextY-y};x=nextX;y=nextY;}
}
export function nativeInputTimeLeft(deadline:number){const remaining=deadline-Date.now();if(remaining<=0)throw Error('Native input exceeded its existing time budget');return remaining;}
export async function releaseNativeInput(){
 await nativeCommand(['keyup','w','s','a','d','z','r','Shift_L','Control_L','Alt_L','Home','End','Prior','Next','mouseup','1','mouseup','3']);
}
export function relativeLookPixels(error:number,sensitivity:number,phase:string,limit=320){
 if(!Number.isFinite(error)||!Number.isFinite(sensitivity)||sensitivity<=0)throw Error('Invalid observed native-look input');
 const weight=phase==='strike'?.28:phase==='windup'?.65:1;
 return Math.round(Math.max(-limit,Math.min(limit,-error/(.0022*sensitivity*weight))));
}

export interface NativeWalkTarget {x:number;z:number;dx:number;dz:number;length:number;brake:number;seconds:number}
export interface NativeWalkState {hp:number;running:boolean;seconds:number;position:{x:number;z:number}}
export function nativeWalkComplete(observation:{read():{state:NativeWalkState;pressedAt:number|null;target:NativeWalkTarget}}){
 const {state:p,pressedAt,target}=observation.read();
 if(p.hp<=0||!p.running)return true;
 if(pressedAt===null)return false;
 return ((target.x-p.position.x)*target.dx+(target.z-p.position.z)*target.dz)/target.length<target.brake||p.seconds>=pressedAt+target.seconds;
}
/** Hold across actual simulation steps, not a short wall-clock tap that can be
 * entirely queued behind one slow frame. Everything in the page is read-only. */
export async function nativeWalkPulse(page:Page,target:NativeWalkTarget,timeout:number){
 const deadline=Date.now()+timeout;
 const held=await page.evaluateHandle(target=>{
  let pressedAt:number|null=null;
  const press=(event:KeyboardEvent)=>{if(event.isTrusted&&!event.repeat&&event.code==='KeyW'&&pressedAt===null)pressedAt=(Reflect.get(window,'__inputProbe') as {seconds:number}).seconds;};
  document.addEventListener('keydown',press,true);
  return {read:()=>({pressedAt,target,state:Reflect.get(window,'__inputProbe') as NativeWalkState}),stop:()=>document.removeEventListener('keydown',press,true)};
 },target);
 let complete:JSHandle<unknown>|null=null;
 try{
  await nativeKeyboard.down('KeyW',Math.min(5000,nativeInputTimeLeft(deadline)));
  complete=await page.waitForFunction(nativeWalkComplete,held,{polling:'raf',timeout:nativeInputTimeLeft(deadline)});
  nativeInputTimeLeft(deadline);
 }finally{
  // Release before any renderer-dependent observation or listener cleanup.
  try{await nativeKeyboard.up('KeyW');}
  finally{await complete?.dispose().catch(()=>{});await held.evaluate(value=>value.stop()).catch(()=>{});await held.dispose().catch(()=>{});}
 }
 nativeInputTimeLeft(deadline);
}

interface WindowGeometry {screenX:number;screenY:number;outerWidth:number;outerHeight:number;innerWidth:number;innerHeight:number}
export function contentCenter(g:WindowGeometry){
 if(Object.values(g).some(n=>!Number.isFinite(n))||g.innerWidth<=40||g.innerHeight<=40||g.outerWidth<g.innerWidth||g.outerHeight<g.innerHeight)throw Error('Invalid browser content geometry');
 return {x:Math.round(g.screenX+(g.outerWidth-g.innerWidth)/2+g.innerWidth/2),y:Math.round(g.screenY+g.outerHeight-g.innerHeight+g.innerHeight/2)};
}
/** Pointer Lock release may restore the OS cursor outside the viewport. Put it
 * into the measured content area, then move again so a real event is guaranteed. */
export async function moveNativePointerIntoPage(page:Page){
 expect(await page.evaluate(()=>document.pointerLockElement)).toBeNull();
 const point=contentCenter(await page.evaluate(()=>({screenX,screenY,outerWidth,outerHeight,innerWidth,innerHeight})));
 await nativeCommand(['mousemove','--',String(point.x-20),String(point.y-10)]);
 await nativeCommand(['mousemove','--',String(point.x),String(point.y)]);
}

async function observePointer(page:Page){
 return page.evaluateHandle(()=>{
  let sequence=0,epoch=0,frame=0,raf=0;
  const tick=()=>{frame++;raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);
  const events:{sequence:number;frame:number;dx:number;dy:number;locked:boolean;trusted:boolean}[]=[];
  const record=(e:MouseEvent)=>{events.push({sequence:++sequence,frame,dx:e.movementX,dy:e.movementY,locked:document.pointerLockElement?.id==='game',trusted:e.isTrusted});if(events.length>128)events.shift();};
  const lock=()=>{epoch++;};
  document.addEventListener('mousemove',record,true);document.addEventListener('pointerlockchange',lock);
  return {read:()=>{const bounds=document.pointerLockElement?.getBoundingClientRect();return {sequence,epoch,frame,locked:document.pointerLockElement?.id==='game',size:{width:bounds?.width??0,height:bounds?.height??0},events};},stop:()=>{cancelAnimationFrame(raf);document.removeEventListener('mousemove',record,true);document.removeEventListener('pointerlockchange',lock);}};
 });
}
export function nativeMotionSettled({observer,sequence,epoch,dx,dy,prime=false}:{observer:{read():{epoch:number;frame:number;locked:boolean;events:{sequence:number;frame:number;dx:number;dy:number;locked:boolean;trusted:boolean}[]}};sequence:number;epoch:number;dx:number;dy:number;prime?:boolean}){
 const after=observer.read();
 if(!after.locked||after.epoch!==epoch)throw Error('Pointer Lock changed during native relative motion');
 // A zero-delta recenter event cannot acknowledge an OS move. Two actual
 // browser frames after delivery give the native recenter a chance to finish.
 return after.events.some(e=>e.sequence>sequence&&e.trusted&&e.locked&&(e.dx!==0||e.dy!==0)&&(prime||(!dx||e.dx*dx>0)&&(!dy||e.dy*dy>0))&&after.frame>=e.frame+2);
}
/** Reads delivery only. This adapter never dispatches DOM events or writes game state. */
export class NativePointer {
 private preparedEpoch=-1;
 private constructor(private page:Page,private observer:Awaited<ReturnType<typeof observePointer>>,private moveRelative:typeof nativeRelativeMouse){}
 static async create(page:Page,moveRelative=nativeRelativeMouse){return new NativePointer(page,await observePointer(page),moveRelative);}
 read(){return this.observer.evaluate(value=>value.read());}
 private async deliver(dx:number,dy:number,deadline:number,prime=false){
  const before=await this.read();nativeInputTimeLeft(deadline);
  if(!before.locked||(!prime&&before.epoch!==this.preparedEpoch))throw Error('Pointer Lock changed before native relative motion');
  await this.moveRelative(dx,dy,Math.min(5000,nativeInputTimeLeft(deadline)));
  let settled:JSHandle<unknown>|null=null;
  try{
   settled=await this.page.waitForFunction(nativeMotionSettled,{observer:this.observer,sequence:before.sequence,epoch:before.epoch,dx,dy,prime},{polling:'raf',timeout:nativeInputTimeLeft(deadline)});
   nativeInputTimeLeft(deadline);
  }finally{await settled?.dispose().catch(()=>{});}
  nativeInputTimeLeft(deadline);return before.epoch;
 }
 async prepare(deadline=Date.now()+60000){
  await expect.poll(async()=>(await this.read()).locked,{message:'Native campaign input requires the real canvas Pointer Lock',timeout:nativeInputTimeLeft(deadline)}).toBe(true);
  const before=await this.read();nativeInputTimeLeft(deadline);if(this.preparedEpoch===before.epoch)return;
  // Consume production's ignored first mouse move with a genuine OS event.
  this.preparedEpoch=await this.deliver(1,1,deadline,true);
 }
 async move(dx:number,dy:number,deadline=Date.now()+60000){
  if(!Number.isSafeInteger(dx)||!Number.isSafeInteger(dy))throw Error('Native relative motion requires finite integer pixels');
  await this.prepare(deadline);if(!dx&&!dy)return;
  const {size}=await this.read();nativeInputTimeLeft(deadline);
  for(const step of nativeRelativeSteps(dx,dy,size))await this.deliver(step.dx,step.dy,deadline);
  nativeInputTimeLeft(deadline);
 }
 async dispose(){await this.observer.evaluate(value=>value.stop()).catch(()=>{});await this.observer.dispose().catch(()=>{});}
}
