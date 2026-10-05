import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {CampaignRoomSession,type RoomSessionHooks} from '../../src/prototype/network/game-session';
import {CAMPAIGN_PROTOCOL} from '../../src/prototype/network/protocol';
import type {CoreSimulation} from '../../src/prototype/core/simulation';
import {defaultSettings} from '../../src/prototype/campaign-session';

const health={service:'pr4-campaign-room',protocol:CAMPAIGN_PROTOCOL,enabled:true};
const sessions:CampaignRoomSession[]=[];
const fetchMock=vi.fn<typeof fetch>();
const storage={getItem:vi.fn(),setItem:vi.fn(),removeItem:vi.fn(),clear:vi.fn()};
const socket=vi.fn();
function response(body:unknown=health,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
function setup(guestPreview=true){
 const sim={worldReady:true,streamedWorld:true,westernContent:true} as CoreSimulation;
 const hooks={settings:vi.fn(()=>defaultSettings()),save:vi.fn(()=>true),mode:vi.fn(),notice:vi.fn(),guestPreview} satisfies RoomSessionHooks;
 const session=new CampaignRoomSession(sim,hooks,'https://example.test');sessions.push(session);return {sim,hooks,session};
}
function untilAborted(_input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 return new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
}
beforeEach(()=>{
 vi.useFakeTimers();fetchMock.mockReset();socket.mockReset();Object.values(storage).forEach(mock=>mock.mockReset());
 vi.stubGlobal('fetch',fetchMock);vi.stubGlobal('location',{origin:'https://example.test',hash:'#campaign-room='+'1'.repeat(64)});
 vi.stubGlobal('sessionStorage',storage);vi.stubGlobal('localStorage',storage);vi.stubGlobal('WebSocket',socket);
});
afterEach(()=>{sessions.splice(0).forEach(session=>session.dispose());vi.useRealTimers();vi.unstubAllGlobals();});

describe('room health probe lifecycle',()=>{
 it('requires compatible public health and a ready world, then stops polling',async()=>{
  const {sim,session}=setup();sim.worldReady=false;fetchMock.mockResolvedValue(response());await session.probe();
  expect(session.snapshot().enabled).toBe(false);sim.worldReady=true;expect(session.snapshot().enabled).toBe(true);
  expect(fetchMock.mock.calls[0][0].toString()).toBe('https://example.test/campaign-room/health');expect(fetchMock.mock.calls[0][1]?.cache).toBe('no-store');
  await vi.advanceTimersByTimeAsync(60_000);expect(fetchMock).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
 });
 it.each([
  {...health,enabled:false},
  {...health,protocol:CAMPAIGN_PROTOCOL+1},
  {...health,service:'another-room'},
  {...health,enabled:'true'},
  null,
 ])('does not enable or repeatedly poll an explicit unsupported/disabled response: %j',async body=>{
  const {session}=setup();fetchMock.mockResolvedValue(response(body));await session.probe();expect(session.snapshot().enabled).toBe(false);
  if(body?.protocol===CAMPAIGN_PROTOCOL+1)expect(session.snapshot().status).toContain('再読み込み');
  await vi.advanceTimersByTimeAsync(60_000);expect(fetchMock).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
 });
 it('recovers from an initial network error without requiring a page reload',async()=>{
  const {session}=setup();fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValue(response());await session.probe();
  expect(session.snapshot()).toMatchObject({enabled:false,role:null});expect(session.snapshot().status).toContain('再試行');
  await vi.advanceTimersByTimeAsync(999);expect(fetchMock).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);expect(session.snapshot().enabled).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it.each(['headers','body'])('times out a stalled response %s and recovers with a fresh request',async phase=>{
  const {session}=setup();fetchMock.mockImplementationOnce(phase==='headers'?untilAborted:async(_input,init)=>({ok:true,json:()=>untilAborted(_input,init)}) as Response).mockResolvedValue(response());
  const pending=session.probe(),firstSignal=fetchMock.mock.calls[0][1]!.signal!;
  await vi.advanceTimersByTimeAsync(4999);expect(firstSignal.aborted).toBe(false);expect(fetchMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);await pending;expect(firstSignal.aborted).toBe(true);expect(session.snapshot().enabled).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);expect(fetchMock).toHaveBeenCalledTimes(2);expect(fetchMock.mock.calls[1][1]!.signal).not.toBe(firstSignal);expect(session.snapshot().enabled).toBe(true);
 });
 it.each(['http','json'])('retries a transient %s failure instead of latching unavailable',async kind=>{
  const {session}=setup();fetchMock.mockResolvedValueOnce(kind==='http'?response({error:'Temporarily unavailable'},503):new Response('not json',{status:200})).mockResolvedValue(response());
  await session.probe();expect(session.snapshot().enabled).toBe(false);await vi.advanceTimersByTimeAsync(1000);expect(session.snapshot().enabled).toBe(true);
 });
 it('shares one pending request across repeated calls and replaces a scheduled retry',async()=>{
  const {session}=setup();let resolve!:(value:Response)=>void;fetchMock.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const first=session.probe();expect(session.probe()).toBe(first);expect(session.probe()).toBe(first);expect(fetchMock).toHaveBeenCalledOnce();resolve(response({},503));await first;
  fetchMock.mockResolvedValue(response());await session.probe();expect(fetchMock).toHaveBeenCalledTimes(2);expect(session.snapshot().enabled).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);expect(fetchMock).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
 });
 it('backs off repeated failures with a capped delay and never overlaps requests',async()=>{
  const {session}=setup();fetchMock.mockRejectedValue(new TypeError('Network unavailable'));await session.probe();
  for(const delay of [1000,2000,4000,8000,15000,15000]){const count=fetchMock.mock.calls.length;await vi.advanceTimersByTimeAsync(delay-1);expect(fetchMock).toHaveBeenCalledTimes(count);await vi.advanceTimersByTimeAsync(1);expect(fetchMock).toHaveBeenCalledTimes(count+1);}
  fetchMock.mockImplementation(untilAborted);await vi.advanceTimersByTimeAsync(15000);const count=fetchMock.mock.calls.length;
  void session.probe();void session.probe();await vi.advanceTimersByTimeAsync(4999);expect(fetchMock).toHaveBeenCalledTimes(count);
 });
 it('aborts an in-flight request on disposal and does not schedule another',async()=>{
  const {session}=setup();fetchMock.mockImplementation(untilAborted);const pending=session.probe(),signal=fetchMock.mock.calls[0][1]!.signal!;
  session.dispose();await pending;expect(signal.aborted).toBe(true);await vi.advanceTimersByTimeAsync(60_000);await session.probe();expect(fetchMock).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);expect(session.snapshot().enabled).toBe(false);
 });
 it('cancels a retry on disposal',async()=>{
  const {session}=setup();fetchMock.mockRejectedValue(new TypeError('Network unavailable'));await session.probe();expect(vi.getTimerCount()).toBe(1);
  session.dispose();await vi.advanceTimersByTimeAsync(60_000);await session.probe();expect(fetchMock).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
 });
 it('does not accept a successful response that arrives after its request timed out',async()=>{
  const {session}=setup();let resolve!:(value:Response)=>void;fetchMock.mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValue(response());const pending=session.probe();
  await vi.advanceTimersByTimeAsync(5000);resolve(response());await pending;expect(session.snapshot().enabled).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);expect(session.snapshot().enabled).toBe(true);expect(fetchMock).toHaveBeenCalledTimes(2);
 });
 it('does not overwrite a room connection status with a late health result or probe an active room',async()=>{
  const {session}=setup();let resolve!:(value:Response)=>void;fetchMock.mockImplementation(()=>new Promise(done=>{resolve=done;}));const pending=session.probe();
  Object.assign(session,{client:{online:true,disconnect:vi.fn()},roleValue:'guest',message:'共有ルームに接続中'});
  resolve(response());await pending;await session.probe();expect(session.snapshot()).toMatchObject({status:'共有ルームに接続中',role:'guest'});expect(fetchMock).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
 });
 it('ignores a late response after disposal even when a transport ignores abort',async()=>{
  const {session}=setup();let resolve!:(value:Response)=>void;fetchMock.mockImplementation(()=>new Promise(done=>{resolve=done;}));const pending=session.probe(),before=session.snapshot();
  session.dispose();resolve(response());await pending;expect(session.snapshot()).toEqual(before);await vi.advanceTimersByTimeAsync(60_000);expect(fetchMock).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
 });
 it.each([true,false])('never joins, creates a room, or touches storage/save hooks while checking and recovering (preview=%s)',async guestPreview=>{
  const {session,hooks}=setup(guestPreview);fetchMock.mockRejectedValueOnce(new TypeError('Startup timeout')).mockResolvedValue(response());await session.probe();await vi.advanceTimersByTimeAsync(1000);
  expect(session.snapshot()).toMatchObject({enabled:true,canJoin:true,role:null,invite:null,guestPreview});expect(socket).not.toHaveBeenCalled();
  for(const hook of [hooks.settings,hooks.save,hooks.mode,hooks.notice,...Object.values(storage)])expect(hook).not.toHaveBeenCalled();
  for(const [url] of fetchMock.mock.calls)expect(url.toString()).toBe('https://example.test/campaign-room/health');
 });
});
