import {clonePlayerEnvironmentState} from './core/player-environment';
import {captureCampaign,restoreCampaignInto,defaultSettings,type CampaignSettings,type CampaignSave} from './campaign-session';
import type {CoreSimulation} from './core/simulation';
/** Network snapshots use the same strict session validators as disk checkpoints.
 * Local key bindings, volume and private map pins are not transmitted.
 * Neither function reads/writes localStorage; the guest's personal save stays untouched. */
export function captureSharedCampaign(sim:CoreSimulation,_settings:CampaignSettings):CampaignSave {
 if(!sim.campaignMode||!sim.worldReady)throw new Error('Shared campaign world is not ready');
 return captureCampaign(sim,defaultSettings(),{reuseTerrain:true,includeCompanion:false});
}
/** Terrain reuse is proven inside the session transaction using exact detached JSON,
 * a prior successful validation, and the current field identity/revision. Host identity
 * never bypasses validation; local mining/building invalidates the optimization. */
export type SharedCampaignApplyResult={ok:false}|{ok:true;hostPlayer:CampaignSave['player']};
export function applySharedCampaign(sim:CoreSimulation,data:unknown):SharedCampaignApplyResult {
 // The party ledger/world is authoritative, but actor prediction and local controls
 // belong to this client. The separate high-rate actor channel reconciles those.
 const player={...sim.player},environment=clonePlayerEnvironmentState(sim.environment),cold=sim.cold,selected=sim.survival.selected,rotation=sim.survival.rotation;
 const result=restoreCampaignInto(sim,data,{reuseTerrain:true,includeCompanion:false});if(!result)return {ok:false};
 const p=sim.player,hostPlayer:CampaignSave['player']={position:{...p.position},yaw:p.yaw,pitch:p.pitch,hp:p.hp,stamina:p.stamina,flasks:p.flasks,tool:p.tool};
 Object.assign(sim.player,player);sim.cold=cold;sim.environment=environment;sim.survival.selected=selected;sim.survival.rotation=rotation;
 return {ok:true,hostPlayer};
}
