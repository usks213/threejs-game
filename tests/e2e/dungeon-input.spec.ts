import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript';
import type {createDungeonInput} from '../../src/dungeon/input';

declare global {interface Window {__dungeonInputHarness:{input:ReturnType<typeof createDungeonInput>;actions:string[];lockRequests:number;startPump():void;stopPump():void;sent:Array<ReturnType<ReturnType<typeof createDungeonInput>['sample']>>}}}
const controller=transpileModule(readFileSync(new URL('../../src/dungeon/input.ts',import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.ESNext,target:ScriptTarget.ES2022}}).outputText;

const pump=transpileModule(readFileSync(new URL('../../src/dungeon/input-pump.ts',import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.ESNext,target:ScriptTarget.ES2022}}).outputText;

test.beforeEach(async({page})=>{
 await page.route('**/__dungeon-input-pump.js',route=>route.fulfill({contentType:'text/javascript',body:pump}));
 await page.route('**/__dungeon-input-module.js',route=>route.fulfill({contentType:'text/javascript',body:controller}));
 await page.route('**/__dungeon-input-harness',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0;touch-action:none}canvas{display:block;width:400px;height:250px;background:#222}#move,#look,button{position:absolute;top:270px;width:100px;height:100px;touch-action:none}#move{left:0}#look{left:120px}button{left:240px}</style><canvas></canvas><div id="move"></div><div id="look"></div><button id="block">Guard</button><script type="module">
  import {createDungeonInput} from '/__dungeon-input-module.js';
  import {startDungeonInputPump} from '/__dungeon-input-pump.js';
  const canvas=document.querySelector('canvas');const actions=[];let lockRequests=0;
  canvas.requestPointerLock=()=>{lockRequests++;return Promise.reject(new Error('Pointer lock unavailable'));};
  const input=createDungeonInput({canvas,movePad:document.querySelector('#move'),lookPad:document.querySelector('#look'),actionButtons:new Map([['block',document.querySelector('#block')]])},{action:action=>actions.push(action)});
  input.setActive(true);const sent=[];let stop=()=>{};window.__dungeonInputHarness={input,actions,sent,startPump(){stop=startDungeonInputPump({sample:dt=>input.sample(dt),send:value=>sent.push(value),enabled:()=>true});},stopPump(){stop();},get lockRequests(){return lockRequests}};
 </script>`}));
 await page.goto('/__dungeon-input-harness');
 await page.waitForFunction(()=>!!window.__dungeonInputHarness);
});

test('dungeon rejected pointer lock still permits mouse drag, attack, guard and release',async({page})=>{
 await page.mouse.click(80,80);
 expect(await page.evaluate(()=>window.__dungeonInputHarness.actions)).toEqual([]);
 await page.mouse.move(80,80);await page.mouse.down();await page.mouse.move(160,110,{steps:5});await page.mouse.up();
 const look=await page.evaluate(()=>window.__dungeonInputHarness.input.sample());
 expect(look.yaw).toBeCloseTo(-.24);expect(look.pitch).toBeCloseTo(-.09);
 expect(await page.evaluate(()=>window.__dungeonInputHarness.actions)).toEqual([]);
 await page.mouse.click(160,110);
 expect(await page.evaluate(()=>window.__dungeonInputHarness.actions)).toEqual(['attack']);
 await page.mouse.down({button:'right'});
 expect(await page.evaluate(()=>window.__dungeonInputHarness.input.sample().block)).toBe(true);
 await page.mouse.move(450,380);await page.mouse.up({button:'right'});
 expect(await page.evaluate(()=>window.__dungeonInputHarness.input.sample().block)).toBe(false);
 expect(await page.evaluate(()=>window.__dungeonInputHarness.lockRequests)).toBe(1);
 // A release handled by the look pad also bubbles to window, but attacks only once.
 await page.locator('#look').click();
 expect(await page.evaluate(()=>window.__dungeonInputHarness.actions)).toEqual(['attack','attack']);
});

test('dungeon one canceled touch leaves the other controls held',async({page})=>{
 await page.locator('#move').dispatchEvent('pointerdown',{pointerId:11,pointerType:'touch',clientX:50,clientY:278});
 await page.locator('#look').dispatchEvent('pointerdown',{pointerId:12,pointerType:'touch',clientX:170,clientY:320});
 await page.locator('#block').dispatchEvent('pointerdown',{pointerId:13,pointerType:'touch',clientX:290,clientY:320});
 expect(await page.evaluate(()=>window.__dungeonInputHarness.input.sample())).toMatchObject({z:1,block:true});
 await page.locator('#look').dispatchEvent('pointercancel',{pointerId:12,pointerType:'touch'});
 expect(await page.evaluate(()=>window.__dungeonInputHarness.input.sample())).toMatchObject({z:1,block:true});
 await page.locator('#move').dispatchEvent('pointerup',{pointerId:11,pointerType:'touch'});
 expect(await page.evaluate(()=>window.__dungeonInputHarness.input.sample())).toMatchObject({z:0,block:true});
 await page.locator('#block').dispatchEvent('pointercancel',{pointerId:13,pointerType:'touch'});
 expect(await page.evaluate(()=>window.__dungeonInputHarness.input.sample().block)).toBe(false);
});


test('dungeon guard and keyboard aiming keep a bounded heartbeat without render frames',async({page})=>{
 await page.keyboard.down('KeyZ');await page.keyboard.down('KeyW');await page.keyboard.down('Home');
 await page.evaluate(()=>window.__dungeonInputHarness.startPump());
 await expect.poll(()=>page.evaluate(()=>window.__dungeonInputHarness.sent.length)).toBeGreaterThanOrEqual(8);
 const held=await page.evaluate(()=>window.__dungeonInputHarness.sent);
 expect(held.every(value=>value.block&&value.z===1)).toBe(true);
 expect(held.at(-1)!.yaw).toBeGreaterThan(.4);
 await page.keyboard.up('KeyZ');await page.keyboard.up('KeyW');await page.keyboard.up('Home');
 await expect.poll(()=>page.evaluate(()=>window.__dungeonInputHarness.sent.at(-1))).toMatchObject({block:false,z:0});
 await page.evaluate(()=>window.__dungeonInputHarness.stopPump());
 const count=await page.evaluate(()=>window.__dungeonInputHarness.sent.length);
 await page.waitForTimeout(120);
 expect(await page.evaluate(()=>window.__dungeonInputHarness.sent.length)).toBe(count);
});
