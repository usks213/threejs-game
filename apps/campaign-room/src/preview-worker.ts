import {CAMPAIGN_PROTOCOL} from '../../../src/prototype/network/protocol';
import relay,{CampaignRoom} from './index';
export {CampaignRoom};
type RelayEnvironment=Parameters<typeof relay.fetch>[1];
interface PreviewEnvironment extends RelayEnvironment {ASSETS:{fetch(request:Request):Promise<Response>};CAMPAIGN_RELAY_ENABLED?:string}
/** One existing Preview origin: game assets and isolated PR4 room transport. */
export default {async fetch(request:Request,env:PreviewEnvironment){const path=new URL(request.url).pathname;if(path==='/campaign-room/health'){if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});return Response.json({service:'pr4-campaign-room',protocol:CAMPAIGN_PROTOCOL,enabled:env.CAMPAIGN_RELAY_ENABLED==='true',authority:'browser-host',maxPlayers:2},{headers:{'Cache-Control':'no-store'}});}if(path.startsWith('/campaign-room/')){if(env.CAMPAIGN_RELAY_ENABLED!=='true')return new Response('Campaign co-op preview is not enabled',{status:503,headers:{'Cache-Control':'no-store'}});return relay.fetch(request,env);}return env.ASSETS.fetch(request);}};
