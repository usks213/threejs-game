import {beforeAll,describe,it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,defaultSettings,isCampaignSave,restoreCampaignInto,type CampaignSave} from '../../src/prototype/campaign-session';
import {defaultGamepadSettings,remapGamepadButton} from '../../src/prototype/gamepad-settings';
let sim:CoreSimulation,source:CampaignSave;
beforeAll(()=>{sim=new CoreSimulation(true);source=captureCampaign(sim,defaultSettings());},20000);
const copy=()=>JSON.parse(JSON.stringify(source)) as CampaignSave;
describe('gamepad save compatibility',()=>{
 it('restores an old save without gamepad settings using the unchanged defaults',()=>{const old=copy();delete old.settings.gamepad;const before=JSON.stringify(old);expect(isCampaignSave(old)).toBe(true);const restored=restoreCampaignInto(sim,old);expect(restored?.settings.gamepad).toEqual(defaultGamepadSettings());expect(JSON.stringify(old)).toBe(before);});
 it('round-trips custom controls without mutating the stored map',()=>{const data=copy();data.settings.gamepad={...remapGamepadButton(defaultGamepadSettings(),'attack',0)!,deadzone:.3,invertY:true,swapSticks:true};expect(isCampaignSave(data)).toBe(true);const restored=restoreCampaignInto(sim,data)!;expect(restored.settings.gamepad).toEqual(data.settings.gamepad);restored.settings.gamepad!.buttons.attack=7;expect(data.settings.gamepad.buttons.attack).toBe(0);});
 it('rejects malformed settings atomically before any player or resource changes',()=>{const data=copy();data.player.hp=1;data.settings.gamepad!.buttons.attack=9;const before=JSON.stringify(captureCampaign(sim,defaultSettings()));expect(isCampaignSave(data)).toBe(false);expect(restoreCampaignInto(sim,data)).toBeNull();expect(JSON.stringify(captureCampaign(sim,defaultSettings()))).toBe(before);});
});
