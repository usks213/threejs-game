import {test,expect} from '@playwright/test';
import {surfaceAt} from '../../src/emberfall/open-world';
interface State {x:number;y:number;deaths:number;cameraX:number;cameraY:number;width:number;height:number;resources:Record<string,number>;structures:unknown[];worldWidth?:number;worldHeight?:number;region?:string}
test('connected-world journey preserves mined cells across distant travel and resume',async({page,context},info)=>{
  test.setTimeout(120000);const mobile=info.project.name==='android-chromium';
  await page.setViewportSize(mobile?{width:393,height:851}:{width:1280,height:720});await page.goto('/?seed=3397');
  const activate=async(name:string)=>{const b=page.getByRole('button',{name,exact:true});if(mobile)await b.tap();else await b.click();};
  await activate('新しい世界を作る');const cave=page.locator('#cave'),cdp=mobile?await context.newCDPSession(page):null;
  const read=async()=>JSON.parse((await cave.getAttribute('data-survival'))!) as State;
  await expect.poll(async()=>Number(await cave.getAttribute('data-tick'))).toBeGreaterThan(10);
  const aim=async(x:number,y:number)=>{const s=await read(),b=(await cave.boundingBox())!,p={x:b.x+(x-s.cameraX)/s.width*b.width,y:b.y+(y-s.cameraY)/s.height*b.height,id:7};
    if(cdp){const u=(await page.locator('#use-button').boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p,{x:u.x+u.width/2,y:u.y+u.height/2,id:8}]});}else{await page.mouse.move(p.x,p.y);await page.mouse.down();}await page.waitForTimeout(700);if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();await page.waitForTimeout(250);};
  // Make a real edit before leaving the original 256-cell-wide area.
  await aim(55,24);const mined=await read();expect(mined.resources.wood).toBeGreaterThan(0);
  const menu=async()=>{if(mobile)await page.locator('#menu-button').tap();else await page.locator('#menu-button').click();};
  const snapshot=async()=>{await menu();const raw=await page.evaluate(()=>localStorage.getItem('emberfall-survival-save-v1'));expect(raw).toBeTruthy();await activate('世界に戻る');return raw!;};
  const material=(raw:string,x:number,y:number)=>{const world=JSON.parse(JSON.parse(raw).data.run).data.world as {width:number;cells:number[]};let offset=0;const index=y*world.width+x;for(let n=0;n<world.cells.length;n+=2){offset+=world.cells[n+1];if(index<offset)return world.cells[n];}throw Error('Invalid saved world');};
  const initial=await snapshot(),edit=material(initial,52,24);expect(edit).toBe(0);
  let touching=false;
  const travel=async(goal:number,flyAcross=false)=>{let last=(await read()).x,stuck=0;const started=Date.now();let key='',charging=false;
    while(Date.now()-started<35000){const s=await read();if(Math.abs(s.x-goal)<10)break;const right=s.x<goal;stuck=Math.abs(s.x-last)<1?stuck+1:0;last=s.x;const obstacles=[55,120,147,...Array.from({length:13},(_,i)=>340+i*96),...Array.from({length:6},(_,i)=>300+i*236)];const fuel=Number(await cave.getAttribute('data-fuel'));const aboveShaft=Array.from({length:6},(_,i)=>300+i*236).some(x=>Math.abs(x-s.x)<16);if(!flyAcross&&fuel<28&&!aboveShaft)charging=true;if(fuel>=90)charging=false;const fly=flyAcross||!charging&&(stuck>3||obstacles.some(x=>Math.abs(x-s.x)<28)||s.y>surfaceAt(s.x)+8);
      if(cdp){const m=(await page.locator('.move-pad').boundingBox())!,f=(await page.locator('.fly-button').boundingBox())!;const points=[...(!charging?[{x:m.x+m.width*(right?.8:.2),y:m.y+m.height/2,id:1}]:[]),...(fly?[{x:f.x+f.width/2,y:f.y+f.height/2,id:2}]:[])];if(touching)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=points.length>0;if(points.length)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});}
      else{const next=charging?'':right?'KeyD':'KeyA';if(key&&key!==next)await page.keyboard.up(key);if(next)await page.keyboard.down(next);key=next;if(fly)await page.keyboard.down('Space');else await page.keyboard.up('Space');}
      await page.waitForTimeout(100);
    }if(cdp){if(touching)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touching=false;}else{if(key)await page.keyboard.up(key);await page.keyboard.up('Space');}await page.waitForTimeout(300);expect(Math.abs((await read()).x-goal)).toBeLessThan(18);};
  await travel(550);const distant=await read();expect(distant.x).toBeGreaterThan(512);expect(distant.resources.wood).toBe(mined.resources.wood);expect(distant.deaths).toBe(0);
  await page.screenshot({path:info.outputPath(mobile?'open-world-distant-portrait.png':'open-world-distant-desktop.png')});
  await menu();await activate('保存してタイトルへ');await page.reload();await activate('この世界を続ける');expect((await read()).x).toBeGreaterThan(512);
  // Land and refill before the broad home tree canopy, then approach it from
  // above rather than flying into its underside. This is ordinary touch input.
  await travel(180);await page.waitForTimeout(2400);
  if(cdp){const f=(await page.locator('.fly-button').boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:f.x+f.width/2,y:f.y+f.height/2,id:2}]});touching=true;}else await page.keyboard.down('Space');await page.waitForTimeout(400);
  await travel(80,true);await page.waitForTimeout(2400);
  // Rise before crossing the entrance tree canopy, using ordinary flight.
  if(cdp){const f=(await page.locator('.fly-button').boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:f.x+f.width/2,y:f.y+f.height/2,id:2}]});touching=true;}else await page.keyboard.down('Space');await page.waitForTimeout(750);
  await travel(45,true);const returned=await snapshot();expect(material(returned,52,24)).toBe(edit);expect((await read()).resources.wood).toBe(mined.resources.wood);expect((await read()).deaths).toBe(0);
  await page.screenshot({path:info.outputPath('open-world-returned-edit.png')});
  await info.attach('open-world-receipt.json',{body:JSON.stringify({mined,distant,returned:await read(),material:edit}),contentType:'application/json'});
});
