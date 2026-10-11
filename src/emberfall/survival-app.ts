import { SurvivalRun, RECIPES } from './survival';
import type { SurvivalTool } from './survival';
import { saveSurvival, loadSurvival } from './survival-save';
import { Controls } from './input';
import { Renderer } from './render';
import { SPELLS } from './wands';
import type { SpellId } from './wands';
import './style.css';
import './survival.css';
const TOOLS: Record<SurvivalTool, string> = { pick:'つるはし', wood:'木の壁', stone:'石の壁', sand:'砂', torch:'たいまつ', workbench:'作業台', camp:'焚き火の拠点', wand:'魔法の杖' };
const RESOURCES = { wood:'木材', stone:'石材', sand:'砂', ore:'鉱石', torch:'たいまつ', workbench:'作業台', camp:'焚き火の拠点' };
export function startSurvival(root: HTMLElement) {
  root.innerHTML = `<main class="emberfall survival"><canvas id="cave" data-control="aim" aria-label="物質が流れる2Dサバイバル世界"></canvas>
  <header class="hud"><div class="vitals"><span class="eyebrow">EMBERFALL / 燐の底</span><div class="meter health"><span>体力</span><i></i><b></b></div><div class="meter mana"><span>魔力</span><i></i><b></b></div><div class="meter fuel"><span>浮遊</span><i></i><b></b></div></div><div class="location"><span>灯りをつなぐ世界</span><small id="depth"></small></div><button id="menu-button">工作 / II</button></header>
  <div class="notice" role="status"></div><div class="resource-strip" aria-label="所持素材"></div>
  <div class="toolbelt"><select id="tool" aria-label="使う道具"></select><button id="wand-select">杖 1</button></div>
  <div class="controls"><div class="move-pad" data-control="move" aria-label="左右に移動"><span>◀</span><span>▶</span><small>移動</small></div><div class="aim-pad" data-control="aim" aria-label="照準と道具使用">✧<small>狙う / 使う</small></div><button class="fly-button" data-control="fly">↑<small>浮遊</small></button><button class="spray-button" data-control="spray">≈<small>水瓶</small></button><button id="pickup" class="pickup-button">杖を調べる E</button></div>
  <div class="desktop-help">A / D 移動 · Space 浮遊 · マウス 道具 · 1 / 2 杖 · F 水瓶 · E 調べる · Tab 工作</div><div id="overlay" class="overlay"></div><span id="save-status" aria-live="polite"></span></main>`;
  const element = <T extends HTMLElement>(s:string) => root.querySelector<T>(s)!;
  const canvas = element<HTMLCanvasElement>('#cave'), overlay = element('#overlay');
  let run = new SurvivalRun(seed()), started = false, paused = true, disposed = false, frame = 0, last = 0, accumulator = 0, saveClock = 0, hudClock = 0, drawRequested = true;
  let renderer: Renderer;
  try { renderer = new Renderer(canvas); } catch (e) { root.textContent = String(e); return () => {}; }
  overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label','世界と工作');
  const controls = new Controls(root, (x,y) => { const p = renderer.point(x,y); return { x:p.x-run.player.x, y:p.y-(run.player.y-1) }; }, key => {
    if (key === 'Digit1' || key === 'Digit2') { run.selected = key === 'Digit1' ? 0 : 1; run.tool = 'wand'; updateHud(); }
    else if (key === 'KeyQ') { run.selected = 1-run.selected; updateHud(); }
    else if (key === 'KeyE') { if (run.nearbyWand()) pickup(); else menu(); }
    else if (key === 'hidden') { if (started && !paused) menu(); }
    else if (key === 'Tab' || key === 'Escape') { if (started && paused) resume(); else if (started) menu(); }
  });
  const tool = element<HTMLSelectElement>('#tool');
  for (const [id,name] of Object.entries(TOOLS)) tool.add(new Option(name,id));
  tool.addEventListener('change', () => { run.tool = tool.value as SurvivalTool; controls.clear(); tool.blur(); updateHud(); });
  element('#wand-select').addEventListener('click', () => { run.selected = 1-run.selected; run.tool = 'wand'; controls.clear(); updateHud(); });
  element('#menu-button').addEventListener('click', menu); element('#pickup').addEventListener('click', pickup);
  overlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)')]; const first = items[0], end = items.at(-1); if (!first || !end) return;
    if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  });
  function persist() { try { const result = saveSurvival(run,localStorage); element('#save-status').textContent = result.message; return result.ok; } catch { element('#save-status').textContent = '世界を保存できません。現在のプレイは続けられます。'; return false; } }
  function button(text:string, action:()=>void, parent:HTMLElement, cls='') { const b = document.createElement('button'); b.textContent = text; b.className = cls; b.addEventListener('click',action); parent.append(b); return b; }
  function panel(title:string, eyebrow:string) {
    paused = true; controls.enabled = false; controls.clear(); overlay.hidden = false; drawRequested = true; element('.emberfall').classList.add('in-menu'); overlay.innerHTML = '';
    const p = document.createElement('section'); p.className = 'panel'; const small = document.createElement('span'); small.className = 'eyebrow'; small.textContent = eyebrow; const h = document.createElement('h1'); h.textContent = title; p.append(small,h); overlay.append(p); return p;
  }
  function paragraph(parent:HTMLElement,text:string,cls='') { const p=document.createElement('p');p.textContent=text;p.className=cls;parent.append(p);return p; }
  function resume() { if (!started) return; paused = false; overlay.hidden = true; controls.clear(); controls.enabled = true; drawRequested = true; element('.emberfall').classList.remove('in-menu'); updateHud(); }
  function start() { run = new SurvivalRun(seed()); started = true; saveClock = 0; persist(); resume(); }
  function welcome() {
    const p = panel('燐の底','EMBERFALL · SURVIVAL / CRAFT'); p.classList.add('welcome');
    paragraph(p,'灯りをともして、ここで暮らす。','intro');
    paragraph(p,'岩を掘り、木を集め、作業台と拠点を作る。砂は崩れ、水は流れ、木は燃える。石の壁で水や火から暮らしを守ろう。');
    let saved:ReturnType<typeof loadSurvival> = { run:null, message:'' }; try { saved=loadSurvival(localStorage); } catch { /* optional storage */ }
    if (saved.run) button('この世界を続ける',()=>{run=saved.run!;run.notice=saved.message;started=true;resume();},p,'primary');
    button('新しい世界を作る',()=>{
      if (!saved.run) return start();
      const confirm=panel('新しい世界へ','現在の世界は予備保存へ'); paragraph(confirm,'現在の世界の続きは、先に「戻る」から再開できます。新しい世界を開始しますか？'); button('新しい世界を開始',start,confirm,'primary');button('戻る',welcome,confirm);
    },p,'primary');
    paragraph(p,'つるはしで近くの木や岩を狙う → 工作 → 道具を選んで設置。倒れても地形・素材・建物は残り、拠点から再開します。','muted');
    paragraph(p,`${saved.message} 有限の洞窟世界を使った開発版です。旧「旅」の保存は別に保持しています。`,'muted');
    button('旧・旅の保存を開く',()=>{location.search='?mode=expedition';},p,'legacy-link');
  }
  function editor(parent:HTMLElement) {
    const h=document.createElement('h2');h.textContent='杖のカード';parent.append(h);
    paragraph(parent,run.canEditWands()?'作業台のそばで編集できます。外したカードは手持ちへ戻ります。鉱山の実の弾数は全杖共通。':'杖の編集には設置した作業台のそばへ。カードは使い捨てではありませんが、持つ枚数は有限です。');
    run.wands.forEach((wand,wi)=>{
      const card=document.createElement('div');card.className='wand-card';const title=document.createElement('h3');title.textContent=`${wi+1} ${wand.name} · ${wand.shuffle?'ランダム順':'順番固定'}`;card.append(title);
      const available=[...run.spells,...wand.spells], slots=document.createElement('div');slots.className='spell-slots';const selects:HTMLSelectElement[]=[];
      for(let n=0;n<wand.capacity;n++){const select=document.createElement('select');select.setAttribute('aria-label',`${wand.name} の枠 ${n+1}`);select.add(new Option('空欄',''));for(const id of [...new Set(available)])select.add(new Option(`${SPELLS[id].name} ×${available.filter(v=>v===id).length}`,id));select.value=wand.spells[n]??'';select.disabled=!run.canEditWands();slots.append(select);selects.push(select);}
      card.append(slots);const feedback=paragraph(card,'','edit-feedback');feedback.setAttribute('role','status');
      if(run.canEditWands())button('この構成を適用',()=>{if(run.editRunWand(wi,selects.map(s=>s.value).filter(Boolean) as SpellId[])){persist();menu();}else feedback.textContent='カードが足りません。枚数以内で組んでください。';},card);
      parent.append(card);
    });
  }
  function menu() {
    if(!started)return;
    persist();const p=panel('灯りの工房',`WORLD ${run.seed} · 復帰 ${run.deaths}回`);button('世界に戻る',resume,p,'primary');
    paragraph(p,Object.entries(run.resources).map(([id,n])=>`${RESOURCES[id as keyof typeof RESOURCES]} ${n}`).join(' / '),'inventory-summary');
    const recipes=document.createElement('div');recipes.className='recipes';
    for(const [id,data] of Object.entries(RECIPES)){
      const recipe=document.createElement('div');recipe.className='recipe';const name=document.createElement('h3');name.textContent=data.name;recipe.append(name);paragraph(recipe,data.description);
      paragraph(recipe,`${Object.entries(data.cost).map(([key,n])=>`${RESOURCES[key as keyof typeof RESOURCES]} ${n}`).join(' + ')}${data.workbench?' · 作業台が必要':''}`,'recipe-cost');
      const b=button(`${data.name}を作る`,()=>{if(run.craft(id as keyof typeof RECIPES)){persist();menu();}},recipe);b.disabled=!run.canCraft(id as keyof typeof RECIPES);b.dataset.recipe=id;recipes.append(recipe);
    }p.append(recipes);
    paragraph(p,'木の壁は燃えます。石の壁は水をせき止め、防火にも使えます。置いたブロックはつるはしで回収できます。たいまつと設備は床の上に置きます。','muted');
    editor(p);button('保存してタイトルへ',()=>{if(persist()){started=false;welcome();}},p);
  }
  function pickup() {
    const found=run.nearbyWand();if(!found||paused)return;
    const p=panel('拾った杖','交換 / 古い杖はその場へ');paragraph(p,`${found.wand.name} · ${found.wand.spells.map(id=>SPELLS[id].name).join(' → ')}`);
    run.wands.forEach((w,i)=>button(`${i+1} ${w.name} と交換`,()=>{if(run.exchangeWand(found.id,i)){persist();resume();}},p,'primary'));button('交換せず戻る',resume,p);
  }
  function updateHud(){
    const p=run.player,w=run.wands[run.selected];for(const [name,value,max] of [['health',p.hp,p.maxHp],['mana',w.mana,w.maxMana],['fuel',p.fuel,p.maxFuel]] as [string,number,number][]){element(`.${name} i`).style.width=`${Math.max(0,Math.min(100,value/max*100))}%`;element(`.${name} b`).textContent=String(Math.ceil(value));}
    element('#depth').textContent=`深度 ${Math.max(0,Math.floor(p.y-27))}m · ${run.camp?'拠点あり':'入口へ復帰'}`;element('.notice').textContent=run.notice;
    element('.resource-strip').textContent=`木 ${run.resources.wood}　石 ${run.resources.stone}　砂 ${run.resources.sand}　鉱石 ${run.resources.ore}`;
    tool.value=run.tool;element('#wand-select').textContent=`杖 ${run.selected+1} / ${run.ammo.bomb}発`;
    element('#pickup').hidden=paused||!run.nearbyWand();element('.spray-button small').textContent=`水 ${Math.floor(run.flask)}`;
    canvas.dataset.survival=JSON.stringify({seed:run.seed,x:p.x,y:p.y,hp:p.hp,tool:run.tool,resources:run.resources,structures:run.structures,camp:run.camp,spawn:run.spawn,deaths:run.deaths,pickaxeLevel:run.pickaxeLevel,canEdit:run.canEditWands(),cameraX:renderer.cameraX,cameraY:renderer.cameraY,width:renderer.width,height:renderer.height,target:run.targetFromAim(controls.state.aimX,controls.state.aimY),time:run.time});
    canvas.dataset.tick=String(run.world.tick);canvas.dataset.playerX=p.x.toFixed(2);canvas.dataset.playerY=p.y.toFixed(2);canvas.dataset.fuel=p.fuel.toFixed(2);canvas.dataset.inputMove=String(controls.state.move);canvas.dataset.phase=run.phase;
  }
  const resize=()=>{renderer.resize();drawRequested=true;};window.addEventListener('resize',resize);renderer.resize();welcome();
  const loop=(now:number)=>{if(disposed)return;const dt=Math.min(.1,(now-(last||now))/1000);last=now;
    if(started&&!paused){accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps++<5){run.step(1/60,controls.state);controls.state.interact=false;accumulator-=1/60;}if(steps>5)accumulator=0;saveClock+=dt;if(saveClock>5){saveClock=0;persist();}}
    else accumulator=0;if(!paused||drawRequested){renderer.draw(run,controls.state);drawRequested=false;}hudClock+=dt;if(hudClock>.1){updateHud();hudClock=0;}frame=requestAnimationFrame(loop);};
  const unload=()=>{if(started)persist();};window.addEventListener('pagehide',unload);frame=requestAnimationFrame(loop);updateHud();
  return()=>{disposed=true;cancelAnimationFrame(frame);controls.dispose();window.removeEventListener('resize',resize);window.removeEventListener('pagehide',unload);root.innerHTML='';};
}
function seed(){const value=new URLSearchParams(location.search).get('seed');return value&&/^\d{1,10}$/.test(value)&&Number(value)<=0xffffffff?Number(value)>>>0:(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;}
