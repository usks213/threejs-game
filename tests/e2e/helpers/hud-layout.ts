import {expect,type Page} from '@playwright/test';

/** Measure real rendered feedback, including the target card. The earlier
 * notice-only check missed a card painted over cost and combat resources. */
export async function expectClearTouchBuildFeedback(page:Page){
 for(const selector of ['#message','#recipe-cost','#combat-status','#target','#material-status','#prompt']){
  await expect(page.locator(selector),selector+' must remain available').toBeVisible();
  await expect(page.locator(selector),selector+' must retain its feedback').not.toBeEmpty();
 }
 await expect(page.locator('#campaign-status')).toBeVisible();
 const layout=await page.evaluate(()=>{
  const bounds=(el:Element)=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  const visible=(el:Element)=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
  const describe=(el:Element)=>({name:el.id||el.getAttribute('data-action')||el.className,box:bounds(el)});
  const feedback=[...document.querySelectorAll('#message,#recipe-cost,#combat-status,.focus')].map(describe);
  const peers=[...document.querySelectorAll('#campaign-status,#objective,#menu-toggle,#campaign-toggle,.vitals,.survival-actions button,#move-pad,.touch-actions button,.equipment button')].filter(visible).map(describe);
  const controls=[...document.querySelectorAll('#menu-toggle,#campaign-toggle,.survival-actions button,#move-pad,.touch-actions button,.equipment button')].filter(visible).map(describe);
  const text=[...document.querySelectorAll('#message,#recipe-cost,#combat-status,#target,#material-status,#prompt')].map(el=>({name:el.id,font:parseFloat(getComputedStyle(el).fontSize),fits:el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth}));
  return {feedback,peers,controls,text,width:innerWidth,height:innerHeight};
 });
 for(const {name,font,fits} of layout.text){
  expect(font,name+' must remain readable').toBeGreaterThanOrEqual(12);
  expect(fits,name+' must fit without clipping').toBe(true);
 }
 for(const [index,{name,box:a}] of layout.feedback.entries()){
  expect(a.x,name+' left edge').toBeGreaterThanOrEqual(0);
  expect(a.y,name+' top edge').toBeGreaterThanOrEqual(0);
  expect(a.x+a.w,name+' right edge').toBeLessThanOrEqual(layout.width);
  expect(a.y+a.h,name+' bottom edge').toBeLessThanOrEqual(layout.height);
  for(const peer of [...layout.peers,...layout.feedback.slice(index+1)]){
   const b=peer.box;
   expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,`${name} overlaps ${peer.name}`).toBe(false);
  }
 }
 for(const [index,{name,box:a}] of layout.controls.entries()){
  expect(a.w,name+' touch width').toBeGreaterThanOrEqual(48);
  expect(a.h,name+' touch height').toBeGreaterThanOrEqual(48);
  expect(a.x,name+' left edge').toBeGreaterThanOrEqual(0);
  expect(a.y,name+' top edge').toBeGreaterThanOrEqual(0);
  expect(a.x+a.w,name+' right edge').toBeLessThanOrEqual(layout.width);
  expect(a.y+a.h,name+' bottom edge').toBeLessThanOrEqual(layout.height);
  for(const peer of layout.controls.slice(index+1)){
   const b=peer.box;
   expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,`${name} overlaps ${peer.name}`).toBe(false);
  }
 }
}
