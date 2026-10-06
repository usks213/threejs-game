import {expect,type Page} from '@playwright/test';

/** Measure the real rendered notice as well as controls. Checking only button
 * pairs missed the build instruction being painted underneath the toolbar. */
export async function expectClearTouchBuildFeedback(page:Page){
 await expect(page.locator('#message')).toBeVisible();
 await expect(page.locator('#message')).not.toBeEmpty();
 await expect(page.locator('#campaign-status')).toBeVisible();
 await expect(page.locator('#recipe-cost')).toBeVisible();
 const layout=await page.evaluate(()=>{
  const notice=document.querySelector<HTMLElement>('#message')!;
  const bounds=(el:Element)=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  const peers=[...document.querySelectorAll('#campaign-status,#recipe-cost,#objective,#menu-toggle,#campaign-toggle,.vitals,.survival-actions button,#move-pad,.touch-actions button,.equipment button')]
   .filter(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden')
   .map(el=>({name:el.id||el.getAttribute('data-action')||el.className,box:bounds(el)}));
  return {text:notice.textContent,notice:bounds(notice),font:parseFloat(getComputedStyle(notice).fontSize),fits:notice.scrollHeight<=notice.clientHeight&&notice.scrollWidth<=notice.clientWidth,peers,width:innerWidth,height:innerHeight};
 });
 expect(layout.font,'Build feedback must remain readable').toBeGreaterThanOrEqual(12);
 expect(layout.fits,'The full build feedback must fit without clipping').toBe(true);
 expect(layout.notice.x).toBeGreaterThanOrEqual(0);
 expect(layout.notice.y).toBeGreaterThanOrEqual(0);
 expect(layout.notice.x+layout.notice.w).toBeLessThanOrEqual(layout.width);
 expect(layout.notice.y+layout.notice.h).toBeLessThanOrEqual(layout.height);
 for(const {name,box:b} of layout.peers){
  const a=layout.notice;
  expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,`${layout.text} overlaps ${name}`).toBe(false);
 }
}
