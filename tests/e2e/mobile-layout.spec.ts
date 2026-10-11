import {readFileSync} from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {meadowPanel} from '../../src/ui/meadows';
import {itemIcon} from '../../src/ui/icons/item';
import {BEACONS} from '../../src/content/adventure-world';
import {journeyGoal} from '../../src/game/journey';
import {expectJourneyTextFits,expectOpeningJourneyFits} from '../helpers/journey-layout';

// Geometry-only acceptance loads production HTML/CSS and real panel renderers without
// WebGL, so every responsive mode can be inspected quickly and deterministically.
const html=readFileSync('index.html','utf8').replace(/<script[^>]*src="\/src\/main.ts"[^>]*><\/script>/,'');
const css=readFileSync('src/ui/style.css','utf8');
const widths=[{width:750,height:342},{width:568,height:320},{width:320,height:568},{width:667,height:375},{width:844,height:390},{width:390,height:844}];
const modes=['game','interact','hammer','build','sandbox','bag','craft','build-menu','world','trade','chest','system','system-expanded','session'] as const;
type Mode=typeof modes[number];
type Insets={top:number;right:number;bottom:number;left:number};
async function viewport(page:Page,size:{width:number;height:number}){
 await page.setViewportSize(size);
 await page.locator('#app').evaluate((app:HTMLElement,size)=>{
  app.dataset.rotated=String(size.height>size.width);app.style.setProperty('--game-width',Math.max(size.width,size.height)+'px');app.style.setProperty('--game-height',Math.min(size.width,size.height)+'px');
 },size);
}
async function setup(page:Page,size:{width:number;height:number},mode:Mode,insets?:Insets){
 await page.setViewportSize(size);await page.setContent(html);
 // Substitute physical device env values, letting production CSS rotate the safe
 // areas. Overriding logical --safe-* values would miss rotation regressions.
 const deviceCss=insets?css.replace(/env\(safe-area-inset-(top|right|bottom|left)(?:,0px)?\)/g,(_,side:keyof Insets)=>`${insets[side]}px`):css;
 await page.addStyleTag({content:deviceCss});await viewport(page,size);
 const sim=new GameSimulation(),s=sim.adventure.state;
 s.inventory={wood:30,stone:20,axe:1,hammer:1,berry:3,shield:1,ragTunic:1,club:1};
 if(mode==='chest')s.buildings=[{id:900,definition:'chest',x:sim.player.x,y:sim.player.y,z:sim.player.z,rotation:0,support:4,contents:{wood:50,stone:30,berry:5}}];
 const tab=mode==='build-menu'?'build':mode==='trade'?'magic':mode==='chest'?'bag':mode;
 const content=['bag','craft','build-menu','world','trade','chest'].includes(mode)?meadowPanel(sim.adventure.snapshot(),sim.player,tab,0,false,80,mode==='chest'?900:undefined):'';
 const hotbar=Object.keys(s.inventory).map((id,i)=>`<button data-quick="${i}"><kbd>${i+1}</kbd>${itemIcon(id)}<small>1</small></button>`).join('');
 await page.evaluate(({mode,content,hotbar})=>{
  const app=document.querySelector<HTMLElement>('#app')!;app.dataset.state='running';
  document.querySelector('#hotbar')!.innerHTML=hotbar;
  document.querySelector('#journey')!.innerHTML='<span class=goal-kicker>JOURNEY</span><strong>落ち枝と石を拾おう</strong><small>木材5・石4 → 石斧。近づいて採集</small>';
  document.querySelector('#adventure-hud')!.innerHTML='<div class=region-line>はじまりの草原 · DAY12 18:45 雷雨</div><div class=vitals><div class="vital health"><span>HP125</span></div><div class="vital stamina"><span>スタミナ120</span></div></div><small>棍棒 · ガード · 食事 · 休息 · 雨除け · 暖かい · 濡れ · 雷鹿の加護</small><div class=food-hud><span>焼き肉</span><span>キノコ</span><span>木の実</span></div>';
  app.dataset.building=String(mode==='build');app.dataset.sandbox=String(mode==='sandbox');
  document.querySelector<HTMLElement>('#build-controls')!.hidden=mode!=='build'&&mode!=='sandbox';
  document.querySelector<HTMLElement>('#interact')!.hidden=mode!=='interact'&&mode!=='hammer';
  document.querySelector<HTMLElement>('#dismantle')!.hidden=mode!=='hammer';
  if(content){document.querySelector<HTMLElement>('#adventure-panel')!.hidden=false;document.querySelector('#adventure-content')!.innerHTML=content;}
  if(mode==='system'||mode==='system-expanded'||mode==='session')document.querySelector<HTMLElement>('#'+(mode==='system-expanded'?'system':mode)+'-panel')!.hidden=false;
  if(mode==='system-expanded')document.querySelector<HTMLDetailsElement>('#performance')!.open=true;
  if(mode==='trade')document.querySelector<HTMLElement>('[data-tab=magic]')!.hidden=false;
 },{mode,content,hotbar});
}
async function problems(page:Page){return page.evaluate(()=>{
 const app=document.querySelector<HTMLElement>('#app')!,rotated=app.dataset.rotated==='true',width=Math.max(innerWidth,innerHeight),height=Math.min(innerWidth,innerHeight);
 const appStyle=getComputedStyle(app),safe=(side:string)=>parseFloat(appStyle.getPropertyValue('--safe-'+side))||0;
 const logical=(r:DOMRect)=>rotated?{left:r.top,right:r.bottom,top:innerWidth-r.right,bottom:innerWidth-r.left,width:r.height,height:r.width}:r;
 const failures:string[]=[],rects:{name:string;x:number;y:number;right:number;bottom:number}[]=[];
 const targets=new Set([...document.querySelectorAll<HTMLElement>('button,input,summary,#stick')].map(el=>el instanceof HTMLInputElement&&el.type==='checkbox'?el.closest('label')??el:el));
 for(const el of targets){
  const box=logical(el.getBoundingClientRect()),style=getComputedStyle(el);if(!box.width||!box.height||style.visibility==='hidden'||style.display==='none')continue;
  const panel=el.closest<HTMLElement>('[role=dialog]'),clip=panel?logical(panel.getBoundingClientRect()):undefined;
  if(clip&&(box.bottom<=clip.top||box.top>=clip.bottom))continue;
  const name=el.id||el.getAttribute('data-tab')||el.getAttribute('data-slot')||el.textContent?.trim().slice(0,20)||el.tagName;
  if(box.width<47.9||box.height<47.9)failures.push(`${name}: target ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
  if(box.left<safe('left')-.5||box.right>width-safe('right')+.5||(!panel&&(box.top<safe('top')-.5||box.bottom>height-safe('bottom')+.5)))failures.push(`${name}: outside safe viewport`);
  if(el.id==='sprint'||el.id==='sneak'){
   const combat=logical(document.querySelector('#combat-controls')!.getBoundingClientRect());
   if(box.left<width/2||box.left<width-safe('right')-152)failures.push(`${name}: outside right-thumb reach`);
   if(box.bottom>combat.top-.5||box.left<combat.left-.5||box.right>combat.right+.5)failures.push(`${name}: outside shared right control block`);
  }
  const cx=(box.left+box.right)/2,cy=(Math.max(box.top,clip?.top??0)+Math.min(box.bottom,clip?.bottom??height))/2,px=rotated?innerWidth-cy:cx,py=rotated?cx:cy;
  const visibleHeight=Math.min(box.bottom,clip?.bottom??height)-Math.max(box.top,clip?.top??0);const hit=document.elementFromPoint(px,py);if(visibleHeight>=24&&hit&&hit!==el&&!el.contains(hit))failures.push(`${name}: touch intercepted by ${hit.id||hit.tagName}`);
  rects.push({name,x:box.left,y:Math.max(box.top,clip?.top??0),right:box.right,bottom:Math.min(box.bottom,clip?.bottom??height)});
 }
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
  const a=rects[i],b=rects[j];if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5)failures.push(`${a.name} overlaps ${b.name}`);
 }
 return failures;
});}
test('core landscape mobile control regions never overlap in all gameplay and menu modes',async({page},info)=>{
 test.skip(info.project.name!=='android-chromium','Touch layout matrix');test.setTimeout(90000);
 for(const size of widths)for(const mode of modes){
  await setup(page,size,mode);expect(await problems(page),`${size.width}×${size.height} ${mode}`).toEqual([]);
  for(const id of ['sprint','sneak']){
   const button=page.locator('#'+id);await expect(button).toHaveAttribute('aria-pressed','false');
   if(['game','interact','hammer','build','sandbox'].includes(mode))await expect(button).toBeVisible();else await expect(button).toBeHidden();
  }
  await expect(page.locator('#sneak')).toHaveText('しゃがむ');await expect(page.locator('#sneak')).toHaveAttribute('aria-label','しゃがむ切替');
  if(['game','interact','hammer','build','sandbox'].includes(mode))await expect(page.locator('#sneak')).toHaveAccessibleName('しゃがむ切替');
  if(['bag','craft','build-menu','world','trade','chest','system','system-expanded','session'].includes(mode)){
   await page.locator('[role=dialog]:not([hidden])').evaluate(el=>{el.scrollTop=el.scrollHeight;});
   expect(await problems(page),`${size.width}×${size.height} ${mode} scrolled`).toEqual([]);
  }
  if(size.width===568&&['game','hammer','build','bag'].includes(mode))await page.screenshot({path:info.outputPath(`mobile-${mode}-568.png`)});
 }
});
test('core landscape mobile right controls respect physical safe areas in every mode',async({page},info)=>{
 test.skip(info.project.name!=='android-chromium','Touch safe-area matrix');test.setTimeout(90000);
 const devices=[
  {name:'small-landscape',size:{width:568,height:320},insets:{top:4,right:16,bottom:4,left:24}},
  {name:'small-rotated',size:{width:320,height:568},insets:{top:24,right:4,bottom:16,left:4}},
  {name:'wide-notched',size:{width:750,height:342},insets:{top:0,right:44,bottom:21,left:44}},
  {name:'home-indicator',size:{width:568,height:320},insets:{top:0,right:44,bottom:21,left:44}},
 ];
 for(const device of devices)for(const mode of modes){
  await setup(page,device.size,mode,device.insets);expect(await problems(page),`${device.name} ${mode}`).toEqual([]);
  if(['game','build'].includes(mode))await page.screenshot({path:info.outputPath(`mobile-${device.name}-${mode}.png`)});
 }
});
test('core landscape mobile movement controls keep their place across pressed states, menus and rotation',async({page},info)=>{
 test.skip(info.project.name!=='android-chromium','Touch state transitions');
 await setup(page,{width:568,height:320},'game');
 for(const size of [{width:568,height:320},{width:320,height:568},{width:844,height:390},{width:390,height:844},{width:568,height:320}]){
  await viewport(page,size);
  const before=await page.locator('.movement-modes').boundingBox();
  for(const id of ['sprint','sneak']){
   await page.locator('#'+id).evaluate(el=>{el.setAttribute('aria-pressed','true');el.classList.add('held');});
   expect(await problems(page),`${size.width}×${size.height} ${id} pressed`).toEqual([]);
   await page.locator('#'+id).evaluate(el=>{el.setAttribute('aria-pressed','false');el.classList.remove('held');});
  }
  for(const id of ['adventure-panel','system-panel','session-panel']){
   await page.locator('#'+id).evaluate((el:HTMLElement)=>el.hidden=false);
   await expect(page.locator('#sprint')).toBeHidden();await expect(page.locator('#sneak')).toBeHidden();await expect(page.locator('#journey')).toBeHidden();
   await page.locator('#'+id).evaluate((el:HTMLElement)=>el.hidden=true);
   await expect(page.locator('#sprint')).toBeVisible();await expect(page.locator('#sneak')).toBeVisible();await expect(page.locator('#journey')).toBeVisible();
   expect(await page.locator('.movement-modes').boundingBox()).toEqual(before);
  }
  expect(await problems(page),`${size.width}×${size.height} restored`).toEqual([]);
 }
});
test('survival adventure mobile journey keeps its fresh objective complete and long text inside its card across rotation',async({page},info)=>{
 test.skip(info.project.name!=='android-chromium','Touch journey layout');
 const fresh=new GameSimulation(),goal=journeyGoal(fresh.adventure.snapshot(),fresh.player);
 // Include the actual iPhone portrait screenshot dimensions as well as compact phones.
 for(const size of [...widths,{width:342,height:750},{width:664,height:390},{width:390,height:664}]){
  await setup(page,size,'game');
  await page.locator('#journey').evaluate((card,goal)=>{
   card.querySelector('strong')!.textContent=goal.title;
   card.querySelector('small')!.textContent=goal.detail;
  },goal);
  await expectOpeningJourneyFits(page);
  expect(await problems(page),`${size.width}×${size.height} full fresh objective`).toEqual([]);
  for(const long of [false,true]){
   const title=long?BEACONS.map(beacon=>beacon.name).join('・'):BEACONS[0].name;
   const detail=long?BEACONS.map(beacon=>beacon.hint).join('。'):BEACONS[0].hint;
   await page.locator('#journey').evaluate((card,{title,detail})=>{
    card.querySelector('.goal-kicker')!.textContent='JOURNEY · 12345m';
    card.querySelector('strong')!.textContent=title;
    card.querySelector('small')!.textContent=detail;
   },{title,detail});
   await expectJourneyTextFits(page);
   // Ellipsis is presentation only: retain the complete mission text in the DOM.
   await expect(page.locator('#journey strong')).toHaveText(title);
   await expect(page.locator('#journey small')).toHaveText(detail);
   expect(await problems(page),`${size.width}×${size.height} ${long?'long':'original'} objective`).toEqual([]);
  }
 }
});

// Use the real layout at the viewport that previously put a second row over the
// avatar. All eight buttons remain present and at least 48px wide/high.
test('voxel adventure quick slots leave one row of action space on a 750px phone',async({page},info)=>{
 test.skip(info.project.name!=='android-chromium','Touch layout');
 await setup(page,{width:750,height:342},'game');
 const slots=await page.locator('#hotbar button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {top:b.top,width:b.width,height:b.height};}));
 expect(slots).toHaveLength(8);expect(new Set(slots.map(s=>s.top)).size).toBe(1);
 expect(slots.every(s=>s.width>=48&&s.height>=48)).toBe(true);
 expect(await problems(page)).toEqual([]);
 await expect(page.locator('#compass')).toBeVisible();
 await expect(page.locator('#journey small')).toBeVisible();
 await page.screenshot({path:info.outputPath('playability-layout-750.png')});
});
