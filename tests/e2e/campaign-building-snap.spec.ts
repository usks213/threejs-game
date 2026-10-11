import {test,expect} from '@playwright/test';
import {PlayerControls,choosePerformance} from './helpers/campaign-controls';
test('H05 building shows and toggles grid/free placement through real controls',async({page,isMobile})=>{
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);const controls=new PlayerControls(page,isMobile);await controls.activate('#start');await controls.initialize();
 try{await expect(page.locator('#build-snap')).toBeHidden();await controls.action('#build','KeyB');await expect(page.locator('#build-snap')).toBeVisible();await expect(page.locator('#build-snap')).toHaveAttribute('aria-pressed','false');await controls.action('#build-snap','KeyN');await expect(page.locator('#build-snap')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#build-snap')).toContainText('1.5m');await controls.action('#build-snap','KeyN');await expect(page.locator('#build-snap')).toHaveAttribute('aria-pressed','false');await controls.action('#cast','KeyG');await expect(page.locator('#build-snap')).toBeHidden();}finally{await controls.dispose();}
});
