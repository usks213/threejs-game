export const GAMEPAD_ACTIONS=['jump','dodge','interact','element-next','recipe-next','cast','block','attack','special','sprint','tool','heavy','heal','dismantle','build'] as const;
export type GamepadAction=typeof GAMEPAD_ACTIONS[number];
export interface GamepadSettings {buttons:Record<GamepadAction,number>;deadzone:number;invertY:boolean;swapSticks:boolean}
export const GAMEPAD_LABELS:Record<GamepadAction,string>={jump:'ジャンプ/滑空',dodge:'回避',interact:'操作','element-next':'属性切替','recipe-next':'建築切替',cast:'属性術',block:'盾を構える',attack:'斬撃',special:'集中技/建築を戻す',sprint:'走る',tool:'剣/道具切替',heavy:'強撃',heal:'回復',dismantle:'建築を解体',build:'設置'};
export const GAMEPAD_BUTTONS=[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15] as const;
export const gamepadButtonLabel=(button:number)=>['A / ×','B / ○','X / □','Y / △','LB / L1','RB / R1','LT / L2','RT / R2','Back / Share','Start / Options','左スティック押込','右スティック押込','十字キー上','十字キー下','十字キー左','十字キー右'][button]??String(button);
export function defaultGamepadSettings():GamepadSettings{return {buttons:Object.fromEntries(GAMEPAD_ACTIONS.map((action,index)=>[action,GAMEPAD_BUTTONS[index]])) as Record<GamepadAction,number>,deadzone:.18,invertY:false,swapSticks:false};}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function validGamepadSettings(value:unknown):value is GamepadSettings {
 if(!record(value)||Object.keys(value).length!==4||!['buttons','deadzone','invertY','swapSticks'].every(key=>Object.hasOwn(value,key))||!record(value.buttons)||Object.keys(value.buttons).length!==GAMEPAD_ACTIONS.length||typeof value.deadzone!=='number'||!Number.isFinite(value.deadzone)||value.deadzone<.05||value.deadzone>.4||typeof value.invertY!=='boolean'||typeof value.swapSticks!=='boolean')return false;
 const used=new Set<number>();for(const action of GAMEPAD_ACTIONS){if(!Object.hasOwn(value.buttons,action))return false;const n=value.buttons[action];if(typeof n!=='number'||!GAMEPAD_BUTTONS.some(button=>button===n)||used.has(n))return false;used.add(n);}return true;
}
export function copyGamepadSettings(value:GamepadSettings):GamepadSettings{return {...value,buttons:{...value.buttons}};}
/** Swap both assignments atomically so no action disappears and no press doubles. */
export function remapGamepadButton(value:GamepadSettings,action:GamepadAction,button:number):GamepadSettings|null {
 if(!validGamepadSettings(value)||!GAMEPAD_ACTIONS.includes(action)||!GAMEPAD_BUTTONS.some(n=>n===button))return null;
 const next=copyGamepadSettings(value),other=GAMEPAD_ACTIONS.find(a=>next.buttons[a]===button)!;next.buttons[other]=next.buttons[action];next.buttons[action]=button;return next;
}
