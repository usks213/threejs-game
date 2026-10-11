import {expect,test,type Page,type TestInfo} from '@playwright/test';
import type {WorkerHealth} from '../../src/simulation/local-protocol';

// Art evidence has its own fixed pixel budget. The functional journey tests use
// a smaller DPR and must not silently become the source of high-resolution art.
test.use({deviceScaleFactor:1});

type Streaming={epoch:number;elapsedMs:number;receivedMeshes:number;submittedMeshes:number;queue:number;draws:number;readyPending:boolean;fencePending:boolean;nearReadyMs:number};
type Diagnostics={worker:WorkerHealth|null;workerAgeMs:number|null;error:string|null};
type Evidence={
 observedAtMs:number;observedAtUTC:string;commit:string|null;state:string|null;rendererMode:string|null;resolution:string|null;tick:number|null;
 viewport:{width:number;height:number;dpr:number};
 canvas:{width:number;height:number;cssWidth:number;cssHeight:number;drawingBufferWidth:number|null;drawingBufferHeight:number|null;contextLost:boolean|null;version:string|null}|null;
 graphics:({renderScale?:number;features?:string[]}&Record<string,unknown>)|null;
 streaming:Streaming|null;diagnostics:Diagnostics|null;performance:Record<string,unknown>|null;
 camera:{yaw:string|null;pitch:string|null};metricsText:string|null;errorText:string|null;workerError:string|null;
};
type NativeMenuEvent={target:string;type:string;trusted:boolean};
type InputWindow=typeof window&{openingMenuEvents:NativeMenuEvent[]};

async function readEvidence(page:Page):Promise<Evidence>{
 return page.evaluate(()=>{
  const app=document.querySelector<HTMLElement>('#app'),canvas=document.querySelector<HTMLCanvasElement>('#game');
  const parse=<T,>(value:string|undefined):T|null=>value?JSON.parse(value) as T:null;
  // Retrieve the game's existing context, without replacing renderer APIs,
  // forcing a frame, modifying its attributes or enabling preserveDrawingBuffer.
  const gl=app?.dataset.terrainMode&&canvas?canvas.getContext('webgl2'):null;
  const error=document.querySelector<HTMLElement>('#error');
  const diagnostics=parse<Diagnostics>(app?.dataset.diagnostics);
  return {
   observedAtMs:performance.now(),observedAtUTC:new Date().toISOString(),commit:document.querySelector<HTMLElement>('#build-version')?.dataset.commit??null,state:app?.dataset.state??null,
   rendererMode:app?.dataset.terrainMode??null,resolution:document.querySelector<HTMLSelectElement>('#render-resolution')?.value??null,
   tick:app?.dataset.tick?Number(app.dataset.tick):null,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
   canvas:canvas?{width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight,drawingBufferWidth:gl?.drawingBufferWidth??null,drawingBufferHeight:gl?.drawingBufferHeight??null,contextLost:gl?.isContextLost()??null,version:gl?String(gl.getParameter(gl.VERSION)):null}:null,
   graphics:parse<Evidence['graphics']>(app?.dataset.graphics),streaming:parse<Streaming>(app?.dataset.streaming),
   diagnostics,performance:parse<Record<string,unknown>>(app?.dataset.performance),
   camera:{yaw:app?.dataset.cameraYaw??null,pitch:app?.dataset.cameraPitch??null},metricsText:document.querySelector('#metrics')?.textContent??null,
   errorText:error&&!error.hidden?error.textContent:null,workerError:diagnostics?.worker?.error??null,
  };
 });
}

async function firstObservedDraw(page:Page):Promise<Evidence>{
 let sample!:Evidence;
 await expect.poll(async()=>{
  sample=await readEvidence(page);
  if(sample.state==='error'||sample.workerError)throw Error(sample.workerError??sample.errorText??'Opening failed');
  return sample.state==='running'&&(sample.streaming?.draws??0)>0;
 },{timeout:60000,intervals:[100],message:'Observe a controllable opening with a published nonzero draw count'}).toBe(true);
 return sample;
}

async function capture(page:Page,info:TestInfo,name:string,firstObservation:Evidence){
 const before=await readEvidence(page),path=info.outputPath(name+'.png');
 // Full-resolution software-GPU captures can take longer than UI actions.
 // This is an artifact timeout only, not a relaxed game/readiness/FPS check.
 await page.screenshot({path,scale:'css',timeout:60000});
 const after=await readEvidence(page);
 await info.attach(name,{path,contentType:'image/png'});
 await info.attach(name+'-evidence',{body:JSON.stringify({
  capture:'Ordinary viewport screenshot; frames can advance between the observations bracketing this image.',
  firstObservation,before,after,
  observationToScreenshotRequestMs:before.observedAtMs-firstObservation.observedAtMs,
  screenshotWindowMs:after.observedAtMs-before.observedAtMs,
 },null,2),contentType:'application/json'});
 return {before,after};
}

function observedIdle(sample:Evidence):boolean{
 const stream=sample.streaming,worker=sample.diagnostics?.worker;
 return sample.state==='running'&&!!stream&&!!worker&&stream.epoch===worker.epoch&&worker.nearReady&&
  sample.diagnostics!.workerAgeMs!==null&&sample.diagnostics!.workerAgeMs!<=2500&&
  worker.pending===0&&worker.terrain?.activeJob===null&&stream.queue===0&&!stream.readyPending&&!stream.fencePending;
}

async function laterObservation(page:Page,first:Evidence){
 const started=Date.now(),samples:Evidence[]=[];
 let candidate:Evidence|null=null;
 while(Date.now()-started<30000){
  const sample=await readEvidence(page);samples.push(sample);
  if(sample.state==='error'||sample.workerError)throw Error(sample.workerError??sample.errorText??'Opening failed while observing streaming');
  if(observedIdle(sample)){
   const stable=candidate?.streaming?.epoch===sample.streaming!.epoch&&
    candidate?.streaming?.receivedMeshes===sample.streaming!.receivedMeshes&&
    candidate?.streaming?.submittedMeshes===sample.streaming!.submittedMeshes;
   if(!stable)candidate=sample;
   // Require two fresh worker reports, another real draw, and a sustained idle
   // window. An empty upload queue alone says nothing about outstanding work.
   if(candidate&&sample.observedAtMs-first.observedAtMs>=5000&&sample.observedAtMs-candidate.observedAtMs>=1500&&
    sample.diagnostics!.worker!.tick>candidate.diagnostics!.worker!.tick&&sample.streaming!.draws>first.streaming!.draws){
    return {state:'observed-streaming-idle' as const,sample,samples};
   }
  }else candidate=null;
  await page.waitForTimeout(500);
 }
 const sample=samples.at(-1)!,stream=sample.streaming,worker=sample.diagnostics?.worker;
 const busy=(stream?.queue??0)>0||stream?.readyPending||stream?.fencePending||(worker?.pending??0)>0||!!worker?.terrain?.activeJob;
 return {state:busy?'continued-streaming' as const:'readiness-unconfirmed' as const,sample,samples};
}

function expectHighResolution(sample:Evidence,viewport:{width:number;height:number}){
 expect(sample.state).toBe('running');expect(sample.rendererMode).toBe('direct-field');
 expect(sample.resolution).toBe('high');expect(sample.graphics?.renderScale).toBe(1);
 expect(sample.graphics?.features).toContain('direct-field');
 expect(sample.viewport).toEqual({...viewport,dpr:1});
 expect(sample.canvas?.drawingBufferWidth).toBe(viewport.width);expect(sample.canvas?.drawingBufferHeight).toBe(viewport.height);
 expect(sample.canvas?.cssWidth).toBe(viewport.width);expect(sample.canvas?.cssHeight).toBe(viewport.height);
 expect(sample.canvas?.contextLost).toBe(false);expect(sample.errorText).toBeNull();expect(sample.workerError).toBeNull();
}

for(const viewport of [{width:750,height:342},{width:844,height:390}]){
 test.describe(`${viewport.width}x${viewport.height} opening art`,()=>{
  test.use({viewport});
  test('voxel adventure opening presentation records high-resolution direct first-observed and later frames',async({page,hasTouch},info)=>{
   test.setTimeout(240000);page.setDefaultTimeout(20000);
   const pageErrors:string[]=[],shaderErrors:string[]=[],graphicsWarnings:string[]=[];
   const nativeMenuEvents:NativeMenuEvent[]=[];
   page.on('pageerror',error=>pageErrors.push(error.message));
   page.on('console',message=>{
    if(!/WebGL|shader|THREE/i.test(message.text()))return;
    if(message.type()==='error')shaderErrors.push(message.text());
    else if(message.type()==='warning')graphicsWarnings.push(message.text());
   });
   try{
    // Fresh browser context, original opening, default camera and normal UI.
    // No imported save, simulated gameplay, terrain override or state injection.
    await page.goto('/',{waitUntil:'domcontentloaded'});
    const defaultFirst=await firstObservedDraw(page);
    await capture(page,info,'default-first-observed',defaultFirst);
    if(process.env.EXPECTED_COMMIT){
     expect(process.env.EXPECTED_COMMIT).toMatch(/^[a-f0-9]{40}$/);
     await expect(page.locator('#build-version')).toHaveAttribute('data-commit',process.env.EXPECTED_COMMIT);
    }
    await page.evaluate(()=>{
     (window as InputWindow).openingMenuEvents=[];
     document.addEventListener('click',event=>{
      const target=event.target instanceof Element?event.target.closest('#system-menu,#system-close'):null;
      if(target)(window as InputWindow).openingMenuEvents.push({target:target.id,type:event.type,trusted:event.isTrusted});
     },{capture:true,passive:true});
    });
    const activate=async(selector:string)=>hasTouch?page.locator(selector).tap():page.locator(selector).click();
    await activate('#system-menu');await expect(page.locator('#system-panel')).toBeVisible();
    // Use the actual settings select/change handler. selectOption is standard
    // form input, not a localStorage write or a rendering-state override.
    await page.locator('#render-resolution').selectOption('high');
    await expect(page.locator('#render-resolution')).toHaveValue('high');
    await activate('#system-close');await expect(page.locator('#system-panel')).toBeHidden();
    nativeMenuEvents.push(...await page.evaluate(()=>(window as InputWindow).openingMenuEvents));
    expect(nativeMenuEvents.some(event=>event.target==='system-menu'&&event.trusted)).toBe(true);
    expect(nativeMenuEvents.some(event=>event.target==='system-close'&&event.trusted)).toBe(true);

    // Reload exercises saved preferences, so high is active before the first
    // controllable frame rather than being selected after the art capture.
    await page.reload({waitUntil:'domcontentloaded'});
    const highFirst=await firstObservedDraw(page);
    const firstCapture=await capture(page,info,'high-first-observed',highFirst);
    expectHighResolution(highFirst,viewport);expectHighResolution(firstCapture.after,viewport);
    if(process.env.EXPECTED_COMMIT)await expect(page.locator('#build-version')).toHaveAttribute('data-commit',process.env.EXPECTED_COMMIT);
    await expect(page.locator('#journey')).toContainText('木材で最初の灯をつなごう');
    await expect(page.locator('#system-panel')).toBeHidden();

    const later=await laterObservation(page,highFirst);
    const laterCapture=await capture(page,info,'high-later-'+later.state,later.sample);
    expectHighResolution(later.sample,viewport);expectHighResolution(laterCapture.after,viewport);
    expect(laterCapture.after.streaming!.draws).toBeGreaterThan(highFirst.streaming!.draws);
    await info.attach('opening-streaming-observation',{body:JSON.stringify({
     classification:later.state,observationBudgetMs:30000,
     meaning:'Observed idle applies only to the reported worker/upload queues in this stationary observation window. It is not proof of full-world readiness.',
     samples:later.samples,
    },null,2),contentType:'application/json'});
    expect(pageErrors).toEqual([]);expect(shaderErrors).toEqual([]);
   }finally{
    const final=await readEvidence(page).catch(()=>null);
    await info.attach('opening-presentation-run',{body:JSON.stringify({
     viewport,project:info.project.name,deviceScaleFactor:1,expectedCommit:process.env.EXPECTED_COMMIT??null,
     capturePolicy:'First observed controllable draw, not an intercepted literal first frame. Published streaming/draw data refresh approximately every 200 ms; screenshot before/after evidence exposes observation delay.',
     performanceScope:'Browser/engine emulation and instrumented art evidence only. No physical-device FPS or full-world-readiness claim.',
     nativeMenuEvents,pageErrors,shaderErrors,graphicsWarnings,final,
    },null,2),contentType:'application/json'});
    expect(final?.workerError??null,'Final worker-reported error').toBeNull();
   }
  });
 });
}
