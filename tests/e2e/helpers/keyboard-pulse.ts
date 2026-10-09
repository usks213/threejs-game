export type LookKey='Home'|'End'|'PageUp'|'PageDown';
export type PulseKey=LookKey|'KeyW'|'KeyS'|'KeyA'|'KeyD';
interface KeyEvent {type:'rawKeyDown'|'keyUp';key:string;code:string;windowsVirtualKeyCode:number;modifiers:number;location?:number}
export interface KeyTransport {send(method:'Input.dispatchKeyEvent',event:KeyEvent):Promise<unknown>}
const codes:Record<PulseKey,number>={Home:36,End:35,PageUp:33,PageDown:34,KeyW:87,KeyS:83,KeyA:65,KeyD:68};

/** Real CDP key input. Send release on a Node timer, without waiting for a
 * blocked renderer's key-down acknowledgement to extend the physical hold. */
export async function pulseKeyboardInput(transport:KeyTransport,key:PulseKey,fine:boolean,milliseconds:number){
 const pending:Promise<unknown>[]=[],modifiers=fine?8:0,eventKey=key.startsWith('Key')?key.slice(3).toLowerCase():key;
 const send=(event:KeyEvent)=>{const promise=transport.send('Input.dispatchKeyEvent',event);promise.catch(()=>{});pending.push(promise);};
 const shift=(type:KeyEvent['type'])=>send({type,key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:type==='rawKeyDown'?8:0,location:1});
 if(fine)shift('rawKeyDown');
 send({type:'rawKeyDown',key:eventKey,code:key,windowsVirtualKeyCode:codes[key],modifiers});
 try{await new Promise<void>(resolve=>setTimeout(resolve,milliseconds));}
 finally{send({type:'keyUp',key:eventKey,code:key,windowsVirtualKeyCode:codes[key],modifiers});if(fine)shift('keyUp');}
 await Promise.all(pending);
}
