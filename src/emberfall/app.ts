import { Run, PERKS } from './simulation';
import type { Perk } from './simulation';
import { BIOMES } from './generation';
import { Controls } from './input';
import { Renderer } from './render';
import { SPELLS } from './wands';
import type { SpellId } from './wands';
import { saveRun, loadRun } from './save';
import './style.css';
export function startEmberfall(root: HTMLElement) {
  root.innerHTML = `<main class="emberfall"><canvas id="cave" data-control="aim" aria-label="燐の底 2Dゲーム画面"></canvas>
    <header class="hud"><div class="vitals"><span class="eyebrow">EMBERFALL / 燐の底</span><div class="meter health"><span>体力</span><i></i><b></b></div><div class="meter mana"><span>魔力</span><i></i><b></b></div><div class="meter fuel"><span>浮遊</span><i></i><b></b></div></div><div class="location"><span id="biome"></span><small id="depth"></small></div><button id="menu-button" aria-label="一時停止と装備">装備 / II</button></header>
    <div class="notice" role="status"></div><div class="wandbar"><button data-wand="0"></button><button data-wand="1"></button><span id="gold"></span></div>
    <div class="controls"><div class="move-pad" data-control="move" aria-label="左右に移動"><span>◀</span><span>▶</span><small>移動</small></div><div class="aim-pad" data-control="aim" aria-label="照準と射撃">✧<small>狙う / 撃つ</small></div><button class="fly-button" data-control="fly">↑<small>浮遊</small></button><button class="spray-button" data-control="spray">≈<small>水瓶 F</small></button><button id="interact" class="interact-button">門に入る E</button></div>
    <div class="desktop-help">A / D 移動 · W / Space 浮遊 · マウス 射撃 · 1 / 2 杖 · F 水瓶 · E 門 · Tab 装備</div>
    <div id="overlay" class="overlay"></div><span id="save-status" aria-live="polite"></span></main>`;
  const element = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = element<HTMLCanvasElement>('#cave');
  let run = new Run(newSeed()), started = false, paused = true, frame = 0, last = 0, accumulator = 0, saveClock = 0, hudClock = 0, disposed = false, drawRequested = true;
  let renderer: Renderer;
  try { renderer = new Renderer(canvas); } catch (error) { root.textContent = String(error); return () => {}; }
  const overlay = element('#overlay');
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'ゲームメニュー');
  overlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),[tabindex="0"]')];
    const first = items[0], last = items[items.length - 1]; if (!first) return;
    if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  const controls = new Controls(root, (x, y) => { const point = renderer.point(x, y); return { x: point.x - run.player.x, y: point.y - run.player.y }; }, command => {
    if (command === 'KeyE') interact();
    else if (command === 'Digit1') run.selected = 0;
    else if (command === 'Digit2') run.selected = 1;
    else if (command === 'KeyQ') run.selected = 1 - run.selected;
    else if (command === 'hidden') { if (started && !paused) openMenu(); }
    else if (command === 'Tab' || command === 'Escape') { if (paused && run.phase === 'playing') resume(); else openMenu(); }
  });
  const persist = () => {
    try { const result = saveRun(run, localStorage); element('#save-status').textContent = result.message; return result.ok; }
    catch { element('#save-status').textContent = '保存できません。ブラウザのストレージ設定を確認してください。'; return false; }
  };
  function start(seed = requestedSeed()) { drawRequested = true; run = new Run(seed); started = true; paused = false; overlay.hidden = true; element('.emberfall').classList.remove('in-menu'); controls.enabled = true; controls.clear(); saveClock = 0; persist(); updateHud(); }
  function resume() { drawRequested = true; if (!started || run.phase !== 'playing') return; paused = false; overlay.hidden = true; element('.emberfall').classList.remove('in-menu'); controls.clear(); controls.enabled = true; updateHud(); }
  function freeze() { drawRequested = true; element('.emberfall').classList.add('in-menu'); paused = true; controls.enabled = false; controls.clear(); overlay.hidden = false; }
  function button(text: string, handler: () => void, parent: HTMLElement, className = '') {
    const node = document.createElement('button'); node.textContent = text; node.className = className; node.addEventListener('click', handler); parent.append(node); if (parent.classList.contains('panel') && !parent.querySelector('button[data-initial-focus]')) { node.dataset.initialFocus = 'true'; queueMicrotask(() => { if (node.isConnected && !overlay.hidden) node.focus(); }); } return node;
  }
  function panel(title: string, subtitle: string) { freeze(); overlay.innerHTML = ''; const p = document.createElement('section'); p.className = 'panel'; const label = document.createElement('span'); label.className = 'eyebrow'; label.textContent = subtitle; const h = document.createElement('h1'); h.textContent = title; p.append(label, h); overlay.append(p); return p; }
  function welcome() {
    const p = panel('燐の底', 'EMBERFALL · A FALLING-SAND ROGUELIKE');
    p.classList.add('welcome'); const intro = document.createElement('p'); intro.className = 'intro'; intro.textContent = '一粒の火が、世界を変える。'; p.append(intro);
    const desc = document.createElement('p'); desc.textContent = '崩れる砂、流れる水、燃える油。杖を組み替え、三つの地層を抜けて炉心の種を探す。死んだら新しい旅へ。'; p.append(desc);
    let loaded: ReturnType<typeof loadRun> = { run: null, message: '' }; try { loaded = loadRun(localStorage); } catch { /* storage is optional, failures displayed below */ }
    if (loaded.run && ['playing','refuge'].includes(loaded.run.phase)) button('旅を続ける', () => { run = loaded.run!; started = true; if (run.phase === 'refuge') openRefuge(); else resume(); }, p, 'primary');
    button('新しい旅を始める', () => start(), p, 'primary');
    const help = document.createElement('p'); help.className = 'muted'; help.textContent = 'スマホ: 左で移動、右の円で照準・射撃、↑で浮遊。PC: A/D + Space + マウス。油と爆発には自分も巻き込まれます。'; p.append(help);
    const status = document.createElement('small'); status.textContent = `${loaded.message} 独自コンテンツの開発版。原作全体の再現は未完成です。`; p.append(status);
  }
  function wandEditor(p: HTMLElement) {
    const heading = document.createElement('h2'); heading.textContent = '杖の編成'; p.append(heading);
    const canEdit = run.canEditWands();
    const info = document.createElement('p'); info.className = 'muted'; info.textContent = canEdit ? '左から順に唱えます。修飾 → 同時詠唱 → 弾の組み合わせを試そう。空欄は取り除かれます。' : '杖の編集は休息所で。今は構成だけ確認できます。'; p.append(info);
    run.wands.forEach((wand, wi) => {
      const card = document.createElement('div'); card.className = 'wand-card';
      const h = document.createElement('h3'); h.textContent = `${wi + 1}  ${wand.name}`; card.append(h);
      const stats = document.createElement('small'); stats.textContent = `${wand.shuffle ? 'ランダム順' : '順番固定'} / 魔力 ${Math.floor(wand.mana)}/${wand.maxMana} / 回復 ${wand.regen}/秒 / 詠唱 ${wand.castDelay}秒 / 再充填 ${wand.recharge}秒`; card.append(stats);
      const slots = document.createElement('div'); slots.className = 'spell-slots'; const selects: HTMLSelectElement[] = [];
      for (let slot = 0; slot < wand.capacity; slot++) {
        const select = document.createElement('select'); select.setAttribute('aria-label', `${wand.name} の枠 ${slot + 1}`); select.disabled = !canEdit;
        const empty = new Option('空欄', ''); select.add(empty);
        const known = [...new Set([...run.spells, ...wand.spells])]; for (const id of known) select.add(new Option(SPELLS[id].name, id));
        select.value = wand.spells[slot] || ''; selects.push(select); slots.append(select);
      }
      card.append(slots);
      if (canEdit) button('この構成を適用', () => { const ids = selects.map(s => s.value).filter(Boolean) as SpellId[]; if (run.editRunWand(wi, ids)) { persist(); run.notice = `${wand.name}の構成を変更した。`; openMenu(); } }, card);
      p.append(card);
    });
    const catalog = document.createElement('div'); catalog.className = 'spell-guide';
    for (const id of [...new Set(run.spells)]) { const row = document.createElement('p'); row.textContent = `${SPELLS[id].name}: ${SPELLS[id].description}`; catalog.append(row); } p.append(catalog);
  }
  function openMenu() {
    if (!started) return welcome(); if (run.phase === 'refuge') return openRefuge(); if (run.phase !== 'playing') return terminal();
    persist(); const p = panel('旅の装備', `PAUSED / SEED ${run.seed}`);
    button('洞窟に戻る', resume, p, 'primary'); wandEditor(p);
    const note = document.createElement('p'); note.textContent = `体力 ${Math.ceil(run.player.hp)} / 金貨 ${run.gold} / 撃破 ${run.kills} / 水瓶 ${Math.floor(run.flask)}/180`; p.append(note);
    const explanation = document.createElement('p'); explanation.className = 'muted'; explanation.textContent = '休息所では全回復・弾数補充。中断保存は現在地点を復元します。死亡で旅は終わり、再開しても復活しません。'; p.append(explanation);
    button('保存してタイトルへ', () => { if (persist()) { started = false; welcome(); } }, p);
  }
  function openRefuge() {
    persist(); const p = panel('静かな熔灯室', `REFUGE / ${run.level + 1}層を突破`);
    const intro = document.createElement('p'); intro.textContent = `全回復・弾数を補充しました。金貨 ${run.gold}。特性を一つ選び、杖を組んで次へ。`; p.append(intro);
    const perks = document.createElement('div'); perks.className = 'perk-list';
    for (const perk of run.perkOffers) { const data = PERKS[perk]; const b = button(`${data.name}\n${data.description}`, () => { run.choosePerk(perk as Perk); openRefuge(); }, perks); b.disabled = run.perkChosen; if (run.perks.includes(perk)) b.classList.add('chosen'); } p.append(perks);
    const shop = document.createElement('div'); shop.className = 'shop';
    for (const [id, price] of [['lance',35],['bomb',30],['force',25],['haste',25],['twin',40],['echo',50]] as [SpellId,number][]) {
      const owned = run.spells.includes(id); const b = button(`${SPELLS[id].name} · ${owned ? '習得済み' : price + ' G'}`, () => { run.buySpell(id, price); openRefuge(); }, shop); b.disabled = owned || run.gold < price;
    } p.append(shop); wandEditor(p);
    const next = button('次の地層へ', () => { if (run.descend()) { persist(); resume(); } }, p, 'primary'); next.disabled = !run.perkChosen && run.perkOffers.length > 0;
  }
  function terminal() {
    persist(); const won = run.phase === 'won'; const p = panel(won ? '種を持ち帰った' : '火は、また灯る', won ? 'EXPEDITION COMPLETE' : 'EXPEDITION ENDED');
    const detail = document.createElement('p'); detail.textContent = `${won ? '三層の底で炉守を倒した。' : run.cause + 'で倒れた。'} ${run.level + 1}層 / ${run.kills}体撃破 / 金貨${run.gold} / ${Math.floor(run.time)}秒 / 種${run.seed}`; p.append(detail);
    button('新しい種で旅立つ', () => start(), p, 'primary'); button('同じ種でやり直す', () => start(run.seed), p);
  }
  function interact() { controls.state.interact = true; }
  element('#menu-button').addEventListener('click', openMenu);
  element('#interact').addEventListener('click', interact);
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-wand]')) b.addEventListener('click', () => { run.selected = Number(b.dataset.wand); controls.clear(); });
  const updateHud = () => {
    const p = run.player, wand = run.wands[run.selected];
    for (const [name, value, max] of [['health',p.hp,p.maxHp],['mana',wand.mana,wand.maxMana],['fuel',p.fuel,p.maxFuel]] as [string,number,number][]) { element(`.${name} i`).style.width = `${Math.max(0, Math.min(100, value / max * 100))}%`; element(`.${name} b`).textContent = `${Math.ceil(value)}`; }
    element('#biome').textContent = BIOMES[run.level].name; element('#depth').textContent = `${run.level + 1} / 3層 · 深度 ${Math.max(0, Math.floor(p.y - 27))}m`;
    element('#gold').textContent = `◆ ${run.gold} G`;
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-wand]')) { const i = Number(b.dataset.wand), w = run.wands[i]; b.textContent = `${i + 1} ${w.name}`; b.classList.toggle('selected', i === run.selected); }
    element('#interact').hidden = Math.hypot(p.x - run.portal.x, p.y - run.portal.y) >= 19 || paused;
    element('.notice').textContent = run.notice;
    element('.emberfall').classList.toggle('in-menu', paused);
    element('.spray-button small').textContent = `水 ${Math.floor(run.flask)}`;
    canvas.dataset.observation = JSON.stringify({ seed: run.seed, phase: run.phase, level: run.level, x: p.x, y: p.y, hp: p.hp, kills: run.kills, gold: run.gold, cameraX: renderer.cameraX, cameraY: renderer.cameraY, width: renderer.width, height: renderer.height, enemies: run.enemies.filter(e => run.lineOfSight(p.x, p.y - 1, e.x, e.y)).map(e => ({ x: e.x, y: e.y })) });
    canvas.dataset.inputMove = String(controls.state.move); canvas.dataset.inputClear = controls.lastClearReason; canvas.dataset.phase = run.phase; canvas.dataset.playerX = p.x.toFixed(2); canvas.dataset.playerY = p.y.toFixed(2); canvas.dataset.fuel = p.fuel.toFixed(2); canvas.dataset.projectiles = String(run.projectiles.length); canvas.dataset.tick = String(run.world.tick);
  };
  const resize = () => { renderer.resize(); drawRequested = true; }; window.addEventListener('resize', resize); renderer.resize(); welcome();
  const loop = (now: number) => {
    if (disposed) return; const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (!paused && started) {
      accumulator += dt; let steps = 0;
      while (accumulator >= 1 / 60 && steps++ < 5) { run.step(1 / 60, controls.state); controls.state.interact = false; accumulator -= 1 / 60; }
      if (steps > 5) accumulator = 0;
      saveClock += dt; if (saveClock > 8) { saveClock = 0; persist(); updateHud(); }
      if (run.phase !== 'playing') { if (run.phase === 'refuge') openRefuge(); else terminal(); }
    } else accumulator = 0;
    if (!paused || drawRequested) { renderer.draw(run, controls.state); drawRequested = false; } hudClock += dt; if (hudClock > 0.1) { updateHud(); hudClock = 0; }
    frame = requestAnimationFrame(loop);
  };
  const unload = () => { if (started) persist(); };
  window.addEventListener('pagehide', unload); frame = requestAnimationFrame(loop); updateHud();
  return () => { disposed = true; cancelAnimationFrame(frame); controls.dispose(); window.removeEventListener('resize', resize); window.removeEventListener('pagehide', unload); root.innerHTML = ''; };
}
function newSeed() { return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0; }

function requestedSeed() { const value = new URLSearchParams(location.search).get('seed'); return value && /^[0-9]{1,10}$/.test(value) && Number(value) <= 0xffffffff ? Number(value) >>> 0 : newSeed(); }
