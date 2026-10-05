import {test,expect,type Page,type Locator} from '@playwright/test';
const activate=(locator:Locator,mobile:boolean)=>mobile?locator.tap():locator.click();
const read=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe'));
const surface=(page:Page)=>page.locator('#campaign-map-surface');
async function openMap(page:Page,mobile:boolean){await activate(page.locator('#restart'),mobile);await activate(page.locator('[data-tab=map]'),mobile);await expect(surface(page)).toBeVisible();}
async function pointOnMap(page:Page,world:{x:number;z:number}){
 const map=surface(page),bounds=await map.evaluate(el=>({minX:Number(el.dataset.minX),maxX:Number(el.dataset.maxX),minZ:Number(el.dataset.minZ),maxZ:Number(el.dataset.maxZ)})),box=(await map.boundingBox())!,svg=(await map.locator('svg').boundingBox())!;
 const scale=Math.min(932/(bounds.maxX-bounds.minX),492/(bounds.maxZ-bounds.minZ)),left=(1000-(bounds.maxX-bounds.minX)*scale)/2,top=(560-(bounds.maxZ-bounds.minZ)*scale)/2;
 return {x:svg.x-box.x+(left+(world.x-bounds.minX)*scale)/1000*svg.width,y:svg.y-box.y+(top+(world.z-bounds.minZ)*scale)/560*svg.height};
}

test('E05/E06 real map has a legend, exact touch pins, keyboard placement, and saved pin deletion',async({page,isMobile})=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await openMap(page,isMobile);
 await expect(page.locator('#campaign-map-help')).toContainText('空白は未調査');
 await expect(page.getByLabel('地図の凡例')).toContainText('番号');await expect(page.locator('.campaign-map-footprint')).toBeVisible();await expect(page.locator('.campaign-map-marker.player')).toBeVisible();
 await expect(page.locator('[data-map-region]')).toHaveCount(0);await expect(page.locator('[data-item=rg-lake-cache]')).toHaveCount(0);await expect(page.locator('[data-item=west-mine-cache]')).toHaveCount(0);
 await expect(surface(page)).toHaveAttribute('aria-describedby','campaign-map-help campaign-map-controls');await expect(page.locator('[data-item=hearth]')).toContainText('⌂2');await expect(page.locator('[data-item=rescue] [data-command=gear]')).toBeVisible();
 const target={x:-10,z:5},position=await pointOnMap(page,target);if(isMobile)await surface(page).tap({position});else await surface(page).click({position});
 await expect.poll(async()=>(await read(page)).settings.pins.length).toBe(1);let pins=(await read(page)).settings.pins;expect(Math.abs(pins[0].x-target.x)).toBeLessThan(.25);expect(Math.abs(pins[0].z-target.z)).toBeLessThan(.25);
 // Updating the live snapshot must preserve both keyboard selection and focus.
 await surface(page).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowUp');await page.keyboard.press('Enter');
 await expect.poll(async()=>(await read(page)).settings.pins.length).toBe(2);pins=(await read(page)).settings.pins;expect(pins[1].x).toBeCloseTo(pins[0].x+1,8);expect(pins[1].z).toBeCloseTo(pins[0].z-5,8);await expect(surface(page)).toBeFocused();
 await page.keyboard.press('Space');await expect.poll(async()=>(await read(page)).settings.pins.length).toBe(3);pins=(await read(page)).settings.pins;expect(pins[2].id).not.toBe(pins[1].id);expect(pins[2].x).toBe(pins[1].x);expect(pins[2].z).toBe(pins[1].z);
 // Moving keeps the same saved identity, and cancellation leaves all pins intact.
 const originalPins=structuredClone(pins),pinId=pins[0].id;
 await activate(page.locator(`[data-item="${pinId}"] [data-command=move-pin-start]`),isMobile);await surface(page).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');expect((await read(page)).settings.pins).toEqual(originalPins);await activate(page.getByRole('button',{name:'移動をやめる',exact:true}),isMobile);expect((await read(page)).settings.pins).toEqual(originalPins);
 await activate(page.locator(`[data-item="${pinId}"] [data-command=move-pin-start]`),isMobile);const moved={x:-12,z:7},destination=await pointOnMap(page,moved);if(isMobile)await surface(page).tap({position:destination});else await surface(page).click({position:destination});expect((await read(page)).settings.pins).toEqual(originalPins);await activate(page.getByRole('button',{name:'この位置へ移動',exact:true}),isMobile);pins=(await read(page)).settings.pins;expect(pins).toHaveLength(3);expect(pins[0].id).toBe(pinId);expect(Math.abs(pins[0].x-moved.x)).toBeLessThan(.25);expect(Math.abs(pins[0].z-moved.z)).toBeLessThan(.25);expect(pins.slice(1)).toEqual(originalPins.slice(1));
 for(const control of await page.locator('[data-command=remove-pin]').all()){const box=await control.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(48);expect(box!.width).toBeGreaterThanOrEqual(48);}
 const mapBox=await surface(page).boundingBox();expect(mapBox!.width).toBeGreaterThan(200);expect(mapBox!.height).toBeGreaterThan(100);expect(await page.locator('.campaign-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await activate(page.locator('[data-tab=settings]'),isMobile);await expect.poll(async()=>(await read(page)).worldReady,{timeout:120000}).toBe(true);await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),isMobile);await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');
 await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).settings.pins).toEqual(pins);await openMap(page,isMobile);
 await activate(page.locator('[data-command=remove-pin]').first(),isMobile);await expect.poll(async()=>(await read(page)).settings.pins.length).toBe(2);expect((await read(page)).settings.pins.map((p:{id:string})=>p.id)).toEqual(pins.slice(1).map((p:{id:string})=>p.id));
 await activate(page.getByRole('button',{name:'旅の記録を閉じる',exact:true}),isMobile);await expect(page.locator('#campaign-panel')).toBeHidden();expect(errors).toEqual([]);
});

test('E06 map edge keyboard input remains bounded after repeated placement and tab reopening',async({page,isMobile})=>{
 test.setTimeout(180000);await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await openMap(page,isMobile);await surface(page).focus();
 for(let i=0;i<28;i++)await page.keyboard.press('Shift+ArrowLeft');for(let i=0;i<28;i++)await page.keyboard.press('Shift+ArrowDown');
 await page.keyboard.press('Enter');await expect.poll(async()=>(await read(page)).settings.pins.length).toBe(1);const pin=(await read(page)).settings.pins[0];expect(pin.x).toBe(Number(await surface(page).getAttribute('data-min-x')));expect(pin.z).toBe(Number(await surface(page).getAttribute('data-max-z')));expect(pin.x).toBeGreaterThanOrEqual(-80);expect(pin.z).toBeLessThanOrEqual(30);
 await activate(page.locator('[data-tab=inventory]'),isMobile);await activate(page.locator('[data-tab=map]'),isMobile);await surface(page).focus();await page.keyboard.press('Enter');await expect.poll(async()=>(await read(page)).settings.pins.length).toBe(2);const next=(await read(page)).settings.pins[1];expect(next.x).toBe(pin.x);expect(next.z).toBe(pin.z);
 for(let i=0;i<12;i++){await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');}await expect.poll(async()=>(await read(page)).settings.pins.length).toBe(12);const all=(await read(page)).settings.pins;expect(new Set(all.map((p:{id:string})=>p.id)).size).toBe(12);expect(all.every((p:{x:number;z:number})=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=-80&&p.x<=80&&p.z>=-100&&p.z<=30)).toBe(true);
});
