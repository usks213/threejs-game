import {test,expect,type Page} from '@playwright/test';
import {GameSimulation} from '../../src/simulation/game-simulation';
test.use({deviceScaleFactor:.5,viewport:{width:844,height:390}});
const sky=async(page:Page)=>JSON.parse(await page.locator('#app').getAttribute('data-skybound')??'null') as {parts:{id:number;position:{x:number;y:number;z:number};lease?:unknown}[];blueprints:unknown[]}|null;
test('voxel adventure exposes original journey, usable room entry, abilities and persistent accessibility settings',async({page},info)=>{
 test.setTimeout(120000);page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 await expect(page).toHaveTitle(/空と灯の大地/);await expect(page.locator('#journey')).toContainText('風原');await expect(page.locator('#session-menu')).toBeVisible();await expect(page.locator('#powers-menu')).toBeVisible();
 await page.locator('#powers-menu').click();await expect(page.getByRole('dialog',{name:'創作能力',exact:true})).toBeVisible();await expect(page.locator('#power-kind option')).toHaveCount(13);await expect(page.locator('#power-kind option[value=storage]')).toHaveCount(1);await expect(page.locator('#power-kind option[value=bed]')).toHaveCount(1);await page.locator('#powers-close').click();
 await page.locator('#system-menu').click();await page.locator('#reduced-motion').check();await page.locator('#invert-camera').check();await page.locator('#system-close').click();
 await expect(page.locator('#app')).toHaveAttribute('data-motion','reduced');await page.screenshot({path:info.outputPath('original-adventure.png'),scale:'css'});
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});await page.locator('#system-menu').click();await expect(page.locator('#reduced-motion')).toBeChecked();await expect(page.locator('#invert-camera')).toBeChecked();expect(errors).toEqual([]);
});
test('voxel adventure creates, holds, moves, records and releases a visible authoritative part through controls',async({page},info)=>{
 test.setTimeout(150000);page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader|THREE/.test(m.text()))errors.push(m.text());});
 await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 // A saved-world fixture supplies crafting materials; actions still use the real UI and simulation.
 const sim=new GameSimulation();sim.fluid.restore([]);sim.adventure.state.resources=[];sim.adventure.state.enemies=[];sim.adventure.state.inventory={ragTunic:1,glider:1,club:1,wood:20,stone:12,resin:4};
 await page.locator('#system-menu').click();await page.locator('#import-file').setInputFiles({name:'ability-world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sim.save()))});await page.locator('#system-close').click();await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 await page.locator('#powers-menu').click();await page.getByRole('button',{name:'照準の先に作る',exact:true}).click();await expect.poll(async()=>(await sky(page))?.parts.length).toBe(1);
 await page.getByRole('button',{name:'選んだ部品を掴む',exact:true}).click();await expect.poll(async()=>!!(await sky(page))?.parts[0].lease).toBe(true);const y=(await sky(page))!.parts[0].position.y;
 await page.getByRole('button',{name:'持ち上げる',exact:true}).click();await expect.poll(async()=>(await sky(page))!.parts[0].position.y).toBeGreaterThan(y+.3);
 await page.getByRole('button',{name:'設計帳に記録',exact:true}).click();await expect.poll(async()=>(await sky(page))?.blueprints.length).toBe(1);
 await page.getByRole('button',{name:'手を放す',exact:true}).click();await expect.poll(async()=>!!(await sky(page))?.parts[0].lease).toBe(false);await page.locator('#powers-close').click();
 await page.screenshot({path:info.outputPath('constructed-voxel-part.png'),scale:'css'});expect(errors).toEqual([]);
});
test('voxel adventure protects a corrupted local save until an explicit recovery choice',async({page})=>{
 test.setTimeout(120000);await page.goto('/',{waitUntil:'domcontentloaded'});await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});
 await page.locator('#system-menu').click();await page.locator('#save').click();await expect(page.locator('#save-status')).toContainText('保存済み',{timeout:15000});
 // Fault injection only changes the saved manifest; no gameplay state or network is mocked.
 await page.evaluate(async()=>{await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('voxel-coop-adventure-v1',3);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').put({storageVersion:999},'single-player');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});});
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByRole('dialog',{name:'保存データの復旧'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#recovery-panel')).toBeVisible();
 await page.getByRole('button',{name:'元データを保護して新しく始める'}).click();await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});await expect(page.locator('#recovery-panel')).toBeHidden();
});
