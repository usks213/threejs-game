import {test,expect,type Locator,type Page} from '@playwright/test';
import {own,read} from './helpers/dungeon-raid-controls';
import type {Snapshot} from '../../src/dungeon/types';

async function activate(locator:Locator,mobile:boolean){await locator.scrollIntoViewIfNeeded();if(mobile)await locator.tap();else await locator.click();}
async function state(page:Page){const value=await read(page);if(!value)throw Error('No authoritative dungeon snapshot');return value;}
async function until(page:Page,predicate:(snapshot:Snapshot)=>boolean,message:string,timeout=15000){await expect.poll(async()=>{const next=await read(page);return !!next&&predicate(next);},{message,timeout}).toBe(true);return state(page);}
/** Ordinary fixed-yaw movement for the safe western route, with real CDP touches on Android. */
async function walk(page:Page,mobile:boolean,x:number,z:number){
 const session=mobile?await page.context().newCDPSession(page):null;
 try{for(let step=0;step<70;step++){
  const actor=own(await state(page));expect(actor.status).toBe('alive');expect(Math.abs(actor.yaw)).toBeLessThan(.01);
  const dx=x-actor.position.x,dz=z-actor.position.z;if(Math.hypot(dx,dz)<.35)return;
  const horizontal=Math.abs(dx)>Math.abs(dz),positive=horizontal?dx>0:dz<0;
  const ms=Math.max(70,Math.min(200,(horizontal?Math.abs(dx):Math.abs(dz))/3*650));
  if(session){const bounds=await page.locator('[data-dungeon-pad=move]').boundingBox();if(!bounds)throw Error('Move pad missing');const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:cx,y:cy,radiusX:4,radiusY:4,force:1}]});
   await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:cx+(horizontal?(positive?42:-42):0),y:cy+(!horizontal?(positive?-42:42):0),radiusX:4,radiusY:4,force:1}]});
   await page.waitForTimeout(ms);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{const key=horizontal?(positive?'KeyD':'KeyA'):(positive?'KeyW':'KeyS');await page.keyboard.press(key,{delay:ms});}
  await page.waitForTimeout(160);
 }throw Error(`Resupply route did not reach ${x},${z}: ${JSON.stringify(own(await state(page)).position)}`);
 }finally{if(session){await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}).catch(()=>{});await session.detach();}}
}
async function inventory(page:Page,mobile:boolean,open:boolean){const panel=page.getByTestId('dungeon-inventory');if(await panel.isVisible()===open)return;await activate(open?page.getByRole('button',{name:'鞄を開く · I',exact:true}):page.getByRole('button',{name:'閉じる · I / Esc',exact:true}),mobile);await expect(panel)[open?'toBeVisible':'toBeHidden']();}
async function extract(page:Page,mobile:boolean){await walk(page,mobile,-12,12);await until(page,s=>s.elapsed>45,'west exit opens',60000);await activate(page.locator('[data-target=exit-west]'),mobile);await until(page,s=>own(s).status==='extracted','ordinary extraction completes');}

test('dungeon recovered treasure funds real resupply and a second finite-resource raid',async({page,isMobile},info)=>{
 test.skip(process.env.E2E_DUNGEON!=='1','Requires the deployed authoritative dungeon');test.setTimeout(360000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error'&&/WebGL|shader/i.test(message.text()))errors.push(message.text());});
 expect(process.env.EXPECTED_COMMIT).toBeTruthy();expect((await (await page.request.get('/deployment.json')).json()).commit).toBe(process.env.EXPECTED_COMMIT);
 await page.goto('/?mode=dungeon&test=1');await page.getByTestId('dungeon-name').fill('帰還して補給する探索者');await activate(page.getByTestId('dungeon-create'),isMobile);
 await expect.poll(async()=>(await read(page))?.actors.length).toBe(1);await expect(page.getByTestId('dungeon-loadout-preview')).toContainText('無料補給');
 await inventory(page,isMobile,true);await expect(page.getByTestId('dungeon-gold')).toHaveText('0 金貨');await expect(page.getByTestId('dungeon-buy-potion')).toBeDisabled();await inventory(page,isMobile,false);
 await activate(page.getByTestId('dungeon-ready'),isMobile);await activate(page.getByTestId('dungeon-start'),isMobile);await until(page,s=>s.phase==='raid','first raid begins');
 await walk(page,isMobile,-12,8);await activate(page.locator('[data-target=chest0]'),isMobile);await until(page,s=>!!s.containers.find(c=>c.id==='chest0')?.opened,'ordinary chest opens');
 const treasure=(await state(page)).containers.find(c=>c.id==='chest0')!.items.find(i=>i.kind==='relic')!;expect(treasure).toBeTruthy();
 await activate(page.locator('[data-target=chest0]'),isMobile);await activate(page.locator(`[data-loot-target=chest0][data-loot-item="${treasure.id}"]`),isMobile);await until(page,s=>own(s).bag.some(i=>i.id===treasure.id),'treasure picked up');await inventory(page,isMobile,false);
 await extract(page,isMobile);await until(page,s=>s.phase==='finished','solo raid is settled');await activate(page.getByRole('button',{name:'補給所へ戻る',exact:true}),isMobile);await until(page,s=>own(s).status==='lobby','returned to supplier');await inventory(page,isMobile,true);
 const returned=await state(page),weapon=returned.stash.find(i=>i.kind==='sword')!,shield=returned.stash.find(i=>i.kind==='shield')!;expect(weapon).toBeTruthy();expect(shield).toBeTruthy();
 await activate(page.locator(`[data-item="${weapon.id}"]`),isMobile);await expect(page.getByTestId('dungeon-sell-selected')).toBeDisabled();
 await activate(page.locator(`[data-item="${treasure.id}"]`),isMobile);await expect(page.getByTestId('dungeon-sell-selected')).toContainText('90');await activate(page.getByTestId('dungeon-sell-selected'),isMobile);
 await until(page,s=>s.gold===90&&!s.stash.some(i=>i.id===treasure.id),'treasure sold exactly once');await expect(page.getByTestId('dungeon-sell-selected')).toBeDisabled();
 await activate(page.getByTestId('dungeon-buy-potion'),isMobile);await until(page,s=>s.gold===78,'first supply purchase');const purchased=(await state(page)).stash.find(i=>i.kind==='potion'&&!i.found)!;expect(purchased.count).toBe(1);
 await activate(page.getByTestId('dungeon-buy-potion'),isMobile);await until(page,s=>s.gold===66,'second supply purchase');await activate(page.getByTestId('dungeon-buy-bandage'),isMobile);await until(page,s=>s.gold===60,'bandage purchase');
 const supplies=await state(page);expect(supplies.shop).toEqual({potion:4,bandage:9});expect(supplies.trades).toHaveLength(4);expect(new Set(supplies.stash.map(i=>i.id)).size).toBe(supplies.stash.length);
 await page.getByTestId('dungeon-gold').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('earned-gold-and-supplies.png')});
 const carry=async(id:string)=>{await activate(page.locator(`[data-item="${id}"]`),isMobile);await activate(page.getByRole('button',{name:'鞄へ移す',exact:true}),isMobile);await until(page,s=>own(s).bag.some(i=>i.id===id),'selected item carried');};
 await carry(purchased.id);await expect(page.getByTestId('dungeon-inventory-loadout')).toContainText('武器がありません');await inventory(page,isMobile,false);await expect(page.getByTestId('dungeon-ready')).toBeDisabled();
 await inventory(page,isMobile,true);await carry(weapon.id);await carry(shield.id);await inventory(page,isMobile,false);await expect(page.getByTestId('dungeon-loadout-preview')).toContainText('携行武器');await activate(page.getByTestId('dungeon-ready'),isMobile);
 await inventory(page,isMobile,true);await expect(page.getByTestId('dungeon-buy-potion')).toBeDisabled();await inventory(page,isMobile,false);
 const carried=own(await state(page)).bag.map(i=>i.id).sort();await activate(page.getByTestId('dungeon-start'),isMobile);await until(page,s=>s.raid===2&&s.phase==='raid','second raid begins');
 expect(own(await state(page)).bag.map(i=>i.id).sort()).toEqual(carried);expect((await state(page)).shop).toEqual({potion:6,bandage:10});expect((await state(page)).gold).toBe(60);
 // Earn damage from an actual approaching guard, retreat normally, then use only the bought dose.
 await walk(page,isMobile,-4,11);await until(page,s=>own(s).hp<own(s).maxHp,'guard inflicts ordinary combat damage');await walk(page,isMobile,-12,12);
 const beforeHeal=own(await state(page));expect(beforeHeal.status).toBe('alive');expect(beforeHeal.hp).toBeLessThan(beforeHeal.maxHp);await activate(page.getByTestId('dungeon-action-heal'),isMobile);
 await until(page,s=>!own(s).bag.some(i=>i.id===purchased.id)&&own(s).hp>beforeHeal.hp,'purchased medicine heals and is consumed');
 await extract(page,isMobile);await page.screenshot({path:info.outputPath('second-raid-resupply-extracted.png')});const final=await state(page);expect(final.gold).toBe(60);expect(final.stash.some(i=>i.id===purchased.id)).toBe(false);expect(final.stash.some(i=>i.id===treasure.id)).toBe(false);
 const saved=final.stash.map(i=>i.id).sort();await page.reload();await activate(page.getByTestId('dungeon-join'),isMobile);await until(page,s=>s.gold===60&&s.raid===2,'gold and second result reconnect');expect((await state(page)).stash.map(i=>i.id).sort()).toEqual(saved);expect((await state(page)).trades).toHaveLength(4);expect(errors).toEqual([]);
});
