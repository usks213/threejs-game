import {afterEach,expect,it,vi} from 'vitest';
import {readCommittedRevisionSample,isNewCommittedRevision,type CommittedRevisionSample} from '../helpers/save-revision';
afterEach(()=>vi.unstubAllGlobals());
const old='11111111-1111-4111-8111-111111111111',next='22222222-2222-4222-8222-222222222222',later='33333333-3333-4333-8333-333333333333';
const pair=(shown:string|null,stored:unknown):CommittedRevisionSample=>({at:1,shown,stored,scope:'local',storageVersion:3});
it('requires a new contemporaneous valid local committed revision',()=>{
 expect(isNewCommittedRevision(pair(next,next),old)).toBe(true);
 expect(isNewCommittedRevision(pair(next,next),null)).toBe(true);
 expect(isNewCommittedRevision(pair(old,old),old)).toBe(false);
 for(const change of [{scope:'room'},{storageVersion:2},{shown:null},{shown:'invalid',stored:'invalid'},{stored:undefined}])expect(isNewCommittedRevision({...pair(next,next),...change},old)).toBe(false);
});
it('never accepts a permanently wrong display as autosave generations advance',()=>{
 const observations=[pair(old,next),pair(old,later),pair(next,later)];
 expect(observations.some(sample=>isNewCommittedRevision(sample,old))).toBe(false);
 expect(isNewCommittedRevision(pair(later,later),old)).toBe(true);
});
it('closes and rejects a malformed database instead of leaving the observation pending',async()=>{
 const error=Error('worlds store missing'),close=vi.fn();
 const request={result:{close,transaction:()=>{throw error;}},onsuccess:null as (()=>void)|null};
 vi.stubGlobal('indexedDB',{open:()=>request});
 const result=readCommittedRevisionSample();request.onsuccess!();
 await expect(result).rejects.toBe(error);expect(close).toHaveBeenCalledOnce();
});
