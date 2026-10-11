import {createCampaignStore} from '../prototype/campaign-session';
import {roomFromFragment,validResumeKey} from '../prototype/network/protocol';
import type {HostResumeIdentity} from '../prototype/network/room-invitation';
import {selectCampaignStore,type CampaignStoreSelection} from './campaign-store-selection';
import type {SaveStorage} from './checkpoint';

export {readHostResumeIdentity,soloCampaignURL} from '../prototype/network/room-invitation';

export interface CampaignStartupPlan {
 trial:boolean;
 room:string|null;
 guestPreview:boolean;
 resumingHost:boolean;
 streamed:boolean;
 western:boolean;
}

/** Pure URL/identity decision, before any persistent campaign storage is opened.
 * Backend query flags are hints for the invited world, never guest migration
 * permission. Host reloads use their existing persistent format selector. */
export function planCampaignStartup(search:string,fragment:string,hostIdentity:HostResumeIdentity|null=null):CampaignStartupPlan {
 const params=new URLSearchParams(search),trial=params.has('trial'),room=trial?null:roomFromFragment(fragment);
 const resumingHost=!!room&&hostIdentity?.room===room&&typeof hostIdentity.resumeKey==='string'&&validResumeKey(hostIdentity.resumeKey);
 const guestPreview=!!room&&!resumingHost;
 const western=!trial&&!resumingHost&&params.get('expedition')==='west';
 const streamed=!trial&&!resumingHost&&(western||params.get('streaming')==='1');
 return {trial,room,guestPreview,resumingHost,streamed,western};
}

/** No persistent-storage method is called for invitation previews or trials.
 * Every startup gets a fresh memory backend, with no selector or migration. The
 * app still disables save/reset/recovery UI so this placeholder is never shown
 * as a saved solo world. */
export function selectCampaignStartupStore(plan:CampaignStartupPlan,persistentStorage:SaveStorage):CampaignStoreSelection {
 if(!plan.guestPreview&&!plan.trial)return selectCampaignStore(persistentStorage,plan.streamed,plan.western);
 const values=new Map<string,string>();
 const memory:SaveStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
 const store=createCampaignStore(plan.streamed,memory,plan.western);
 return {streamed:plan.streamed,western:plan.western,store,loaded:{status:'empty'},blocked:false,migrated:false};
}
