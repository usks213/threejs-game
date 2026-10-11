import {describe,it,expect} from 'vitest';
import {cooperationControls,cooperationChatText} from '../../src/prototype/campaign-ui';
import type {CooperationSnapshot} from '../../src/prototype/campaign-ui';
const snapshot=(value:Partial<CooperationSnapshot>={}):CooperationSnapshot=>({enabled:true,status:'待機中',role:null,invite:null,guestBuild:false,muted:false,players:0,messages:[],canJoin:false,...value});
describe('cooperation UI permission states',()=>{
 it('shows offline without implying a live room and requires explicit available join',()=>{const s=cooperationControls(snapshot());expect(s.participants).toBe('未接続');expect(s.create).toBe(true);expect(s.join).toBe(false);expect(s.chat).toBe(false);expect(s.leave).toBe(false);expect(cooperationControls(snapshot({invite:'https://example.test/?invite=abc',canJoin:true})).join).toBe(true);});
 it('disables connection controls until the feature and world are ready',()=>{const s=cooperationControls(snapshot({enabled:false,canJoin:true,invite:'invite'}));expect(s.create).toBe(false);expect(s.join).toBe(false);expect(s.invite).toBe(false);expect(s.chat).toBe(false);expect(s.participants).toBe('未接続');});
 it('restricts editing permissions to connected hosts',()=>{const host=cooperationControls(snapshot({role:'host',players:2}));expect(host.permissions).toBe(true);expect(host.create).toBe(false);expect(host.join).toBe(false);expect(host.chat).toBe(true);expect(host.participants).toBe('参加者 2人');const guest=cooperationControls(snapshot({role:'guest',players:2}));expect(guest.permissions).toBe(false);expect(guest.leave).toBe(true);});
 it('lets an existing participant leave even while availability is lost',()=>{expect(cooperationControls(snapshot({role:'guest',enabled:false})).leave).toBe(true);});
 it('mutes chat locally and rejects whitespace or oversized outgoing payloads',()=>{expect(cooperationControls(snapshot({role:'host',muted:true})).chat).toBe(false);expect(cooperationChatText(' \n ')).toBe('');expect(cooperationChatText(' hello ')).toBe('hello');expect(cooperationChatText('x'.repeat(300))).toHaveLength(240);});
});

it('allows explicit ending of a saved suspended party without network availability',()=>{const c=cooperationControls(snapshot({savedCompanion:true,enabled:false}));expect(c.leave).toBe(true);expect(c.create).toBe(false);expect(c.join).toBe(false);expect(c.chat).toBe(false);});
