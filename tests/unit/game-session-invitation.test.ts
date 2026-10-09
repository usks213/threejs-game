import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {CampaignRoomSession,type RoomSessionHooks} from '../../src/prototype/network/game-session';
import type {CampaignCoopCallbacks,CampaignCoopOptions} from '../../src/prototype/network/coop-client';
import type {CoreSimulation} from '../../src/prototype/core/simulation';
import {defaultSettings} from '../../src/prototype/campaign-session';
import {roomResumeStorageKey} from '../../src/prototype/network/room-invitation';

const clients=vi.hoisted(()=>[] as {options:CampaignCoopOptions;callbacks:CampaignCoopCallbacks;connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]);
vi.mock('../../src/prototype/network/coop-client',()=>({CampaignCoopClient:class {
 connect=vi.fn();disconnect=vi.fn();online=false;
 constructor(public options:CampaignCoopOptions,public callbacks:CampaignCoopCallbacks){clients.push(this);}
}}));
const room='1'.repeat(64),resumeKey='2'.repeat(64),fragment='#campaign-room='+room;
function setup(guestPreview=false){
 const sim={worldReady:true,streamedWorld:true,westernContent:true,enableCompanion:vi.fn(),disableCompanion:vi.fn(),setCompanionConnected:vi.fn()} as unknown as CoreSimulation;
 const hooks={settings:()=>defaultSettings(),save:vi.fn(()=>true),mode:vi.fn(),notice:vi.fn(),guestPreview} satisfies RoomSessionHooks;
 const session=new CampaignRoomSession(sim,hooks,'https://example.test');(session as unknown as {available:boolean}).available=true;return {sim,hooks,session};
}
let sessionValues:Map<string,string>,sessionStorageMock:{getItem:ReturnType<typeof vi.fn>;setItem:ReturnType<typeof vi.fn>},reload:ReturnType<typeof vi.fn>,replaceState:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 clients.length=0;sessionValues=new Map();sessionStorageMock={getItem:vi.fn((key:string)=>sessionValues.get(key)??null),setItem:vi.fn((key:string,value:string)=>{sessionValues.set(key,value);})};reload=vi.fn();replaceState=vi.fn();
 vi.stubGlobal('sessionStorage',sessionStorageMock);vi.stubGlobal('location',{hash:fragment,href:'https://example.test/play/?test=1&streaming=1&expedition=west'+fragment,origin:'https://example.test',reload});vi.stubGlobal('history',{replaceState});
});
afterEach(()=>{vi.unstubAllGlobals();});

describe('guest invitation session boundary',()=>{
 it('does not save, read identities, or connect just by preparing the invitation preview',()=>{
  const {hooks,session}=setup(true);expect(session.role).toBeNull();expect(session.snapshot()).toMatchObject({guestPreview:true,canJoin:true,role:null});expect(clients).toHaveLength(0);expect(hooks.save).not.toHaveBeenCalled();expect(sessionStorageMock.getItem).not.toHaveBeenCalled();
 });
 it('cannot create a new persistent room from the temporary preview',async()=>{
  const {hooks,session}=setup(true);await session.command('create');expect(clients).toHaveLength(0);expect(hooks.save).not.toHaveBeenCalled();expect(hooks.mode).not.toHaveBeenCalled();expect(sessionStorageMock.setItem).not.toHaveBeenCalled();expect(hooks.notice).toHaveBeenCalled();
 });
 it('joins explicitly without invoking the solo save hook, even if it would fail',async()=>{
  const {hooks,session}=setup(true);hooks.save.mockReturnValue(false);await session.command('join');expect(clients).toHaveLength(1);expect(clients[0].options.mode).toBe('join');expect(clients[0].connect).toHaveBeenCalledOnce();expect(hooks.save).not.toHaveBeenCalled();expect(hooks.mode).toHaveBeenCalledWith('guest');expect(session.role).toBe('guest');
 });
 it('cannot promote a preview to host if an identity appears after startup',async()=>{
  sessionValues.set(roomResumeStorageKey(room,'host'),resumeKey);const {hooks,session}=setup(true);await session.command('join');expect(clients[0].options.mode).toBe('join');expect(hooks.mode).toHaveBeenCalledWith('guest');expect(sessionStorageMock.getItem).toHaveBeenCalledExactlyOnceWith(roomResumeStorageKey(room,'guest'));
 });
 it('rejects an unexpected host assignment before starting a companion or host simulation',async()=>{
  const {sim,hooks,session}=setup(true);await session.command('join');expect(()=>clients[0].callbacks.onRole('host')).toThrow();expect(clients[0].disconnect).toHaveBeenCalledOnce();expect(sim.enableCompanion).not.toHaveBeenCalled();expect(session.role).toBe('guest');expect(hooks.save).not.toHaveBeenCalled();expect(hooks.notice).toHaveBeenCalled();
 });
 it.each([false,true])('returns directly to solo with no invitation/backend flags (joined=%s)',async joined=>{
  const {hooks,session}=setup(true);if(joined)await session.command('join');session.leave();expect(replaceState).toHaveBeenCalledExactlyOnceWith(null,'','https://example.test/play/?test=1');expect(reload).toHaveBeenCalledOnce();expect(hooks.save).not.toHaveBeenCalled();expect(session.role).toBeNull();
 });
});

describe('persistent room creation and validated host resume',()=>{
 it('preserves the save-before-connect boundary for a normal new host',async()=>{
  const {hooks,session}=setup();await session.command('create');expect(hooks.save).toHaveBeenCalledOnce();expect(clients[0].options.mode).toBe('create');expect(hooks.save.mock.invocationCallOrder[0]).toBeLessThan(clients[0].connect.mock.invocationCallOrder[0]);expect(hooks.mode).toHaveBeenCalledWith('host');
 });
 it('does not open a room when the host preparation save fails',async()=>{
  const {hooks,session}=setup();hooks.save.mockReturnValue(false);await session.command('create');expect(clients).toHaveLength(0);expect(hooks.mode).not.toHaveBeenCalled();expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
 });
 it('uses a valid exact-room identity for host resume after saving normally',async()=>{
  sessionValues.set(roomResumeStorageKey(room,'host'),resumeKey);const {hooks,session}=setup();await session.command('join');expect(hooks.save).toHaveBeenCalledOnce();expect(clients[0].options.mode).toBe('create');expect(clients[0].options.resumeKey===resumeKey).toBe(true);expect(session.role).toBe('host');
 });
 it('never treats an invalid nonempty host key as host authority',async()=>{
  const key=roomResumeStorageKey(room,'host');sessionValues.set(key,'invalid');const {hooks,session}=setup();await session.command('join');expect(clients[0].options.mode).toBe('join');expect(hooks.mode).toHaveBeenCalledWith('guest');expect(sessionValues.get(key)).toBe('invalid');expect(session.role).toBe('guest');
 });
 it('preserves the normal save boundary for a non-preview guest joining from solo',async()=>{
  const {hooks,session}=setup();hooks.save.mockReturnValue(false);await session.command('join');expect(clients).toHaveLength(0);expect(hooks.save).toHaveBeenCalledOnce();
 });
});
