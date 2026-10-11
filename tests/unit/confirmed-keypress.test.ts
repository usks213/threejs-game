import {afterEach,describe,it,expect,vi} from 'vitest';
import {installKeypressObservation,pressWithUnsentRecovery} from '../e2e/helpers/confirmed-keypress';

const refusal='同期が完了するまで操作を待っています';
function harness(initial=''){
 const listeners:{callback:(event:KeyboardEvent)=>void;capture:boolean}[]=[],element={textContent:initial};
 let mutations:MutationRecord[]=[],callback:MutationCallback;
 const observer={observe:vi.fn(),disconnect:vi.fn(),takeRecords:()=>{const records=mutations;mutations=[];return records;}};
 vi.stubGlobal('MutationObserver',class {constructor(onMutation:MutationCallback){callback=onMutation;return observer;}});
 vi.stubGlobal('document',{
  addEventListener:(_type:string,callback:(event:KeyboardEvent)=>void,capture=false)=>listeners.push({callback,capture}),
  removeEventListener:(_type:string,callback:(event:KeyboardEvent)=>void)=>{const index=listeners.findIndex(value=>value.callback===callback);if(index>=0)listeners.splice(index,1);},
 });
 const write=(text:string)=>{element.textContent=text;mutations.push({type:'childList'} as MutationRecord);};
 const flush=()=>callback(observer.takeRecords(),observer as unknown as MutationObserver);
 const press=(action=()=>{},extra:Partial<KeyboardEvent>={})=>{
  const event={code:'KeyB',isTrusted:true,repeat:false,...extra} as KeyboardEvent;
  for(const {callback} of listeners.filter(value=>value.capture))callback(event);
  action();
  for(const {callback} of listeners.filter(value=>!value.capture))callback(event);
 };
 return {observation:installKeypressObservation(element as Element,'KeyB'),press,write,flush,observer,listeners};
}
afterEach(()=>vi.unstubAllGlobals());

describe('read-only guest keypress rejection evidence',()=>{
 it('observes a new synchronous refusal from exactly one trusted input',()=>{const h=harness();h.press(()=>h.write(refusal));expect(h.observation.read()).toEqual({keydowns:1,notSent:true});h.observation.stop();expect(h.listeners).toEqual([]);expect(h.observer.disconnect).toHaveBeenCalledOnce();});
 it('retains refusal evidence when the browser delivers mutations between event listeners',()=>{const h=harness();h.press(()=>{h.write(refusal);h.flush();});expect(h.observation.read()).toEqual({keydowns:1,notSent:true});h.observation.stop();});
 it('does not reuse an existing refusal or pending old mutation',()=>{const h=harness(refusal);h.write(refusal);h.press();expect(h.observation.read()).toEqual({keydowns:1,notSent:false});h.observation.stop();});
 it('does not count delayed refusal, permission denial or uncertain acknowledgement as proof of an unsent action',()=>{for(const message of ['この操作は周辺世界を変えるため、ホストの許可が必要です','接続が切れました。再同期して反映状況を確認してください','操作を受け付けました']){const h=harness();h.press(()=>h.write(message));h.write(refusal);h.flush();expect(h.observation.read()).toEqual({keydowns:1,notSent:false});h.observation.stop();}});
 it.each([{isTrusted:false},{repeat:true},{code:'KeyG'}])('ignores unrelated/repeated/synthetic input %j',extra=>{const h=harness();h.press(()=>h.write(refusal),extra);expect(h.observation.read()).toEqual({keydowns:0,notSent:false});h.observation.stop();});
});

describe('bounded recovery of a proven unsent keypress',()=>{
 it('waits for fresh state again and allows one new attempt after an explicit pre-send refusal',async()=>{const ready=vi.fn(async()=>{}),press=vi.fn().mockResolvedValueOnce({keydowns:1,notSent:true}).mockResolvedValueOnce({keydowns:1,notSent:false});await pressWithUnsentRecovery(ready,press);expect(ready).toHaveBeenCalledTimes(2);expect(press).toHaveBeenCalledTimes(2);});
 it('does not repeat an accepted or uncertain action merely because its result has not arrived',async()=>{const press=vi.fn(async()=>({keydowns:1,notSent:false}));await pressWithUnsentRecovery(async()=>{},press);expect(press).toHaveBeenCalledOnce();});
 it('fails after a second pre-send refusal rather than weakening synchronization or looping',async()=>{const press=vi.fn(async()=>({keydowns:1,notSent:true}));await expect(pressWithUnsentRecovery(async()=>{},press)).rejects.toThrow('twice');expect(press).toHaveBeenCalledTimes(2);});
 it.each([0,2])('never repeats ambiguous evidence with %s keydowns',async keydowns=>{const press=vi.fn(async()=>({keydowns,notSent:true}));await expect(pressWithUnsentRecovery(async()=>{},press)).rejects.toThrow('exactly one');expect(press).toHaveBeenCalledOnce();});
 it('propagates input or observation errors without trying the key again',async()=>{const press=vi.fn(async()=>{throw Error('lost acknowledgement');});await expect(pressWithUnsentRecovery(async()=>{},press)).rejects.toThrow('lost acknowledgement');expect(press).toHaveBeenCalledOnce();});
});
