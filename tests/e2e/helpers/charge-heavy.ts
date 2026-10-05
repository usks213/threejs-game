import {expect,type Page} from '@playwright/test';
/** A real held key/touch; readiness follows simulation time, including slow mode. */
export async function chargeHeavy(page:Page,mobile:boolean){
 if(!mobile){await page.keyboard.down('KeyR');try{await expect.poll(()=>page.locator('#combat-status').textContent()).toContain('強撃準備完了');}finally{await page.keyboard.up('KeyR');}return;}
 const button=page.locator('[data-action=heavy]');await expect(button).toBeVisible();const point=await button.evaluate(element=>{const r=element.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,visible:element.contains(document.elementFromPoint(x,y))};});expect(point.visible).toBe(true);
 const session=await page.context().newCDPSession(page);try{await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:9,x:point.x,y:point.y}]});await expect.poll(()=>page.locator('#combat-status').textContent()).toContain('強撃準備完了');}finally{await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
}
