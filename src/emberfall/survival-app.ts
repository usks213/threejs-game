import { SurvivalRun, RECIPES } from './survival';
import type { Resource, RecipeId, SurvivalTool } from './survival';
import { saveSurvival, loadSurvival } from './survival-save';
import { SurvivalControls, readControlPreferences } from './survival-input';
import type { ControlPreferences, ThumbMode } from './survival-input';
import { allowsAssistedFire, findCombatTarget, readCombatAssist, readCombatSnapshot } from './combat-assist';
import type { CombatTarget } from './combat-assist';
import { Renderer } from './render';
import { getRegionName, OPEN_CHUNK_SIZE } from './open-world';
import { SPELLS } from './wands';
import type { SpellId } from './wands';
import './style.css';
import './survival.css';

const TOOLS: Record<SurvivalTool, string> = { pick: 'つるはし', wood: '木の壁', stone: '石の壁', sand: '砂', torch: 'たいまつ', workbench: '作業台', camp: '焚き火の拠点', wand: '魔法の杖' };
const RESOURCES: Record<Resource, string> = { wood: '木材', stone: '石材', sand: '砂', ore: '鉱石', torch: 'たいまつ', workbench: '作業台', camp: '焚き火の拠点' };
const ICONS: Record<SurvivalTool, string> = { pick: '⛏', wood: '▥', stone: '▦', sand: '⠿', torch: '♨', workbench: '▤', camp: '⌂', wand: '✧' };
const SETTINGS_KEY = 'emberfall-survival-ui-v1';
type MenuTab = 'craft' | 'inventory' | 'equipment' | 'settings';
type Quality = 'low' | 'balanced' | 'high';
interface GraphicsSettings { quality: Quality; pbr: boolean; volumetric: boolean; bloom: boolean }

export function startSurvival(root: HTMLElement) {
  root.innerHTML = `<main class="emberfall survival">
    <canvas id="cave" data-control="aim" tabindex="-1" aria-label="物質が流れる2Dサバイバル世界"></canvas>
    <header class="hud">
      <div class="world-heading"><span class="eyebrow">EMBERFALL <span>燐の底</span></span><div class="location"><strong id="region-name">灯りの入口</strong><small id="depth"></small></div></div>
      <div class="vitals" aria-label="プレイヤーの状態"><div class="meter health"><span>体力</span><i></i><b></b></div><div class="meter fuel"><span>浮遊</span><i></i><b></b></div><div class="meter mana"><span>魔力</span><i></i><b></b></div></div>
      <button id="menu-button" aria-label="工作と持ち物を開く"><span aria-hidden="true">▤</span> 工作</button>
    </header>
    <div class="resource-strip" aria-label="所持素材"></div>
    <span id="save-status" role="status" aria-live="polite"></span>
    <div class="notice" role="status"></div>
    <div class="toolbelt" role="group" aria-label="道具のホットバー">
      <button data-tool="pick" aria-label="つるはしを選ぶ"><span aria-hidden="true">⛏</span><small>採掘</small></button>
      <button data-tool="stone" aria-label="石の壁を選ぶ"><span aria-hidden="true">▦</span><small>石の壁</small><b data-count="stone"></b></button>
      <button data-tool="torch" aria-label="たいまつを選ぶ"><span aria-hidden="true">♨</span><small>灯り</small><b data-count="torch"></b></button>
      <button id="wand-select" aria-label="魔法の杖を選ぶ・切り替え"><span aria-hidden="true">✧</span><small>杖 1</small></button>
      <label class="tool-picker"><span>道具一覧</span><select id="tool" aria-label="使う道具"></select></label>
    </div>
    <div id="tool-status" class="tool-status" aria-live="off"></div>
    <div id="combat-target" hidden aria-hidden="true"><span>照準補助</span></div>
    <div class="controls">
      <div class="thumb-weapons" role="group" aria-label="親指の武器切替。押すと装備、引くと狙って撃つ">
        <button data-control="weapon" data-wand-slot="0" aria-label="杖1を装備。ここから引いて手動射撃"><span>✧ 1</span><small>移動射撃</small></button>
        <button data-control="weapon" data-wand-slot="1" aria-label="杖2を装備。ここから引いて手動射撃"><span>✹ 2</span><small>手動・爆破</small></button>
        <button data-quick-tool="pick" aria-label="つるはしへ持ち替える"><span>⛏</span><small>採掘</small></button>
      </div>
      <div id="thumb-pad" class="thumb-pad" data-control="thumb" data-phase="idle" role="group" aria-label="片手パッド。触れた位置から引いて移動、上へ引いて浮遊">
        <span class="thumb-anchor" aria-hidden="true"></span><span class="thumb-tether" aria-hidden="true"></span><span class="thumb-knob" aria-hidden="true"></span>
        <span class="thumb-symbol" aria-hidden="true">↑</span><small id="thumb-help">引いて移動 · 上へ浮遊</small>
      </div>
      <div class="thumb-actions" role="group" aria-label="親指の操作モード">
        <button data-thumb-mode="travel" aria-pressed="true"><span aria-hidden="true">↔</span><small>移動</small></button>
        <button data-thumb-mode="work" aria-pressed="false"><span id="thumb-tool-icon" aria-hidden="true">⛏</span><small id="thumb-work-label">掘る</small></button>
        <button id="combat-toggle" hidden aria-pressed="false" aria-label="通常弾の移動射撃を切り替える"><span aria-hidden="true">◎</span><small>射撃補助 OFF</small></button>
        <button id="thumb-menu" aria-label="工作と持ち物を開く"><span aria-hidden="true">▤</span><small>工作</small></button>
        <button class="thumb-water" data-control="spray" aria-label="水瓶を使う"><span aria-hidden="true">≈</span><small>水</small></button>
      </div>
      <div class="move-pad" data-control="move" role="group" aria-label="左右に移動。上へスライドすると浮遊"><span aria-hidden="true">◀</span><span aria-hidden="true">▶</span><small>移動 · 上へ浮遊</small><i aria-hidden="true">↑</i></div>
      <div class="aim-pad" data-control="aim" role="group" aria-label="照準だけを動かす"><span aria-hidden="true">✧</span><small>狙うだけ</small></div>
      <button id="use-button" class="use-button" data-control="use" aria-label="選んだ道具を使う"><span aria-hidden="true">⛏</span><small>使う</small></button>
      <button class="fly-button" data-control="fly" aria-label="押している間、浮遊"><span aria-hidden="true">↑</span><small>浮遊</small></button>
      <button class="spray-button" data-control="spray" aria-label="水瓶を使う"><span aria-hidden="true">≈</span><small>水 100</small></button>
      <button id="pickup" class="pickup-button">杖を調べる E</button>
    </div>
    <div class="desktop-help">A / D 移動 · Space 浮遊 · マウス照準 / クリック使用 · X 使用 · 1 / 2 杖 · F 水瓶 · E 調べる · Tab 工作</div>
    <div id="overlay" class="overlay"></div>
  </main>`;
  const element = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = element<HTMLCanvasElement>('#cave'), overlay = element('#overlay'), game = element('.emberfall');
  let run = new SurvivalRun(seed()), started = false, paused = true, disposed = false;
  let frame = 0, last = 0, accumulator = 0, saveClock = 0, renderClock = 0, hudClock = 0, drawRequested = true;
  let lastNotice = '', noticeUntil = 0, menuTab: MenuTab = 'craft';
  let renderer: Renderer;
  let combatTarget: CombatTarget | null = null;
  try { renderer = new Renderer(canvas); } catch (error) { root.textContent = String(error); return () => {}; }
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '世界と工作');
  const controls = new SurvivalControls(root, (x, y) => {
    const point = renderer.point(x, y); return { x: point.x - run.player.x, y: point.y - (run.player.y - 1) };
  }, key => {
    if (key === 'Digit1' || key === 'Digit2' || key === 'Wand0' || key === 'Wand1') { run.selected = key === 'Digit1' || key === 'Wand0' ? 0 : 1; chooseTool('wand'); }
    else if (key === 'Digit3' || key === 'Digit4' || key === 'Digit5') chooseTool(key === 'Digit3' ? 'pick' : key === 'Digit4' ? 'stone' : 'torch');
    else if (key === 'KeyQ') { run.selected = 1 - run.selected; chooseTool('wand'); }
    else if (key === 'KeyE') { if (run.nearbyWand()) pickup(); else menu(); }
    else if (key === 'hidden') { if (started && !paused) menu(); }
    else if (key === 'Tab' || key === 'Escape') { if (started && paused) resume(); else if (started) menu(); }
  });
  const tool = element<HTMLSelectElement>('#tool');
  for (const [id, name] of Object.entries(TOOLS)) tool.add(new Option(name, id));
  tool.addEventListener('change', () => { chooseTool(tool.value as SurvivalTool); tool.blur(); });
  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => button.addEventListener('click', () => chooseTool(button.dataset.tool as SurvivalTool)));
  element('#wand-select').addEventListener('click', () => { if (run.tool === 'wand') run.selected = 1 - run.selected; chooseTool('wand'); });
  element('[data-quick-tool="pick"]').addEventListener('click', () => chooseTool('pick'));
  element('#menu-button').addEventListener('click', () => menu());
  element('#thumb-menu').addEventListener('click', () => menu());
  element('#combat-toggle').addEventListener('click', () => {
    if (!allowsAssistedFire(run.wands[run.selected])) return;
    combatAssist = !combatAssist; controls.clear('assist-change'); updateControlMode(); updateHud();
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, ...graphics, ...controlPreferences, combatAssist })); } catch { /* optional UI preference only */ }
  });
  root.querySelectorAll<HTMLButtonElement>('[data-thumb-mode]').forEach(button => button.addEventListener('click', () => {
    controls.setThumbMode(button.dataset.thumbMode as ThumbMode); updateControlMode(); canvas.focus({ preventScroll: true }); updateHud();
  }));
  element('#pickup').addEventListener('click', pickup);
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled)')];
    const first = items[0], end = items.at(-1); if (!first || !end) return;
    if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { event.preventDefault(); end.focus(); }
    else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first.focus(); }
  });

  // Settings use a new key; existing world/expedition records are never rewritten.
  let graphics: GraphicsSettings = { quality: 'balanced', pbr: true, volumetric: true, bloom: true };
  let controlPreferences: ControlPreferences = { layout: 'one-hand', hand: 'right' };
  let combatAssist = false;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    controlPreferences = readControlPreferences(value);
    combatAssist = readCombatAssist(value);
    if (value && typeof value === 'object' && 'version' in value && value.version === 1 && 'quality' in value && 'pbr' in value && 'volumetric' in value && 'bloom' in value &&
      ['low', 'balanced', 'high'].includes(String(value.quality)) && typeof value.pbr === 'boolean' && typeof value.volumetric === 'boolean' && typeof value.bloom === 'boolean') {
      graphics = { quality: value.quality as Quality, pbr: value.pbr, volumetric: value.volumetric, bloom: value.bloom };
    }
  } catch { /* Storage is optional; safe defaults keep the game playable. */ }
  // Explicit read-only, detached diagnostics. No DOM attribute churn during
  // ordinary play; observing a snapshot cannot mutate the world or inventory.
  Object.defineProperty(canvas, 'combatSnapshot', { get: () => readCombatSnapshot(run,
    { x: renderer.cameraX, y: renderer.cameraY, width: renderer.width, height: renderer.height }, combatAssist, combatTarget) });
  function applyGraphics() {
    renderer.setQuality(graphics.quality);
    renderer.setEffects({ pbr: graphics.pbr, volumetric: graphics.volumetric, bloom: graphics.bloom });
    drawRequested = true;
  }
  function updateControlMode() {
    const work = controls.thumbMode === 'work';
    const combat = run.tool === 'wand' && !work;
    const assist = combat && combatAssist && allowsAssistedFire(run.wands[run.selected]);
    element('button[data-thumb-mode="work"]').hidden = run.tool === 'wand';
    const toggle = element<HTMLButtonElement>('#combat-toggle'); toggle.hidden = run.tool !== 'wand'; toggle.disabled = !allowsAssistedFire(run.wands[run.selected]);
    toggle.setAttribute('aria-pressed', String(combatAssist && !toggle.disabled));
    toggle.querySelector('small')!.textContent = toggle.disabled ? '手動専用' : `補助 ${combatAssist ? 'ON' : 'OFF'}`;
    game.dataset.thumbMode = controls.thumbMode;
    root.querySelectorAll<HTMLElement>('[data-thumb-mode]').forEach(button => { if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.thumbMode === controls.thumbMode)); });
    element('#thumb-help').textContent = work ? run.tool === 'pick' || run.tool === 'wand' ? '引いて狙う · 0.22秒後に使う' : '引いて1個設置 · 離して次へ' : assist ? '移動＋敵を狙って射撃 · 上へ浮遊' : combat ? '引いて移動 · 杖から引いて射撃' : '引いて移動 · 上へ浮遊';
    element('#thumb-pad').setAttribute('aria-label', work ? '片手パッド。引いた方向を狙い、0.22秒後から道具を使用。戻すか離すと停止' : assist ? '引いて移動、上へ浮遊。見える敵だけを照準補助して射撃。離すと止まる' : '片手パッド。触れた位置から引いて移動、上へ引いて浮遊');
    element('.thumb-symbol').textContent = work ? '✧' : '↑';
  }
  function applyControls() {
    controls.configure(controlPreferences); game.dataset.controlLayout = controlPreferences.layout; game.dataset.controlHand = controlPreferences.hand; updateControlMode();
  }
  applyGraphics(); applyControls();
  function chooseTool(value: SurvivalTool) {
    run.tool = value; controls.clear('tool-change'); controls.setSingleUse(singleGestureTool());
    if (controlPreferences.layout === 'one-hand') controls.setThumbMode(value === 'wand' ? 'travel' : 'work');
    updateControlMode(); if (!paused) canvas.focus({ preventScroll: true }); updateHud();
  }
  function singleGestureTool() {
    return run.tool !== 'pick' && run.tool !== 'wand' || controlPreferences.layout === 'one-hand' && run.tool === 'wand' && !allowsAssistedFire(run.wands[run.selected]);
  }
  function persist() {
    const status = element('#save-status');
    try {
      const result = saveSurvival(run, localStorage);
      status.textContent = result.ok ? '● 世界を保存済み' : result.message;
      status.dataset.state = result.ok ? 'saved' : 'error'; status.title = result.message;
      return result.ok;
    } catch {
      status.textContent = '保存できません。現在のプレイは続けられます。'; status.dataset.state = 'error'; return false;
    }
  }
  function button(text: string, action: () => void, parent: HTMLElement, cls = '') {
    const button = document.createElement('button'); button.textContent = text; button.className = cls;
    button.addEventListener('click', action); parent.append(button); return button;
  }
  function paragraph(parent: HTMLElement, text: string, cls = '') {
    const paragraph = document.createElement('p'); paragraph.textContent = text; paragraph.className = cls; parent.append(paragraph); return paragraph;
  }
  function panel(title: string, eyebrow: string) {
    paused = true; controls.enabled = false; overlay.hidden = false; drawRequested = true; game.classList.add('in-menu'); overlay.innerHTML = '';
    const panel = document.createElement('section'); panel.className = 'panel';
    const small = document.createElement('span'); small.className = 'eyebrow'; small.textContent = eyebrow;
    const heading = document.createElement('h1'); heading.textContent = title; panel.append(small, heading); overlay.append(panel);
    // Focus only after buttons have been appended, without stealing focus during gameplay.
    queueMicrotask(() => { if (!overlay.hidden && panel.isConnected) panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); });
    return panel;
  }
  function resume() {
    if (!started) return;
    paused = false; overlay.hidden = true; controls.clear(); controls.setSingleUse(singleGestureTool()); controls.enabled = true; drawRequested = true; updateControlMode();
    game.classList.remove('in-menu'); canvas.focus({ preventScroll: true }); updateHud();
  }
  function start() { run = new SurvivalRun(seed()); started = true; saveClock = 0; lastNotice = ''; persist(); resume(); }
  function welcome() {
    const panelElement = panel('燐の底', 'EMBERFALL · OPEN WORLD / CRAFT'); panelElement.classList.add('welcome');
    paragraph(panelElement, '灯りをともして、ここで暮らす。', 'intro');
    paragraph(panelElement, '森の岩を掘り、木を集め、洞窟へ。つながった世界に道と拠点を作り、灯りを少しずつ広げよう。');
    let saved: ReturnType<typeof loadSurvival> = { run: null, message: '' };
    try { saved = loadSurvival(localStorage); } catch { /* optional storage */ }
    if (saved.run) button('この世界を続ける', () => { run = saved.run!; run.notice = saved.message; started = true; lastNotice = ''; resume(); }, panelElement, 'primary');
    button('新しい世界を作る', () => {
      if (!saved.run) return start();
      const confirmation = panel('新しい世界へ', '現在の世界は予備保存へ');
      paragraph(confirmation, '新しい世界を開始しますか？今の世界を続けたい場合は「戻る」を選んでください。');
      button('新しい世界を開始', start, confirmation, 'primary'); button('戻る', welcome, confirmation);
    }, panelElement, 'primary');
    const guide = document.createElement('ol'); guide.className = 'welcome-steps';
    for (const text of ['「移動」で引くと歩く。上へ引くと浮遊', '「掘る」で引いて狙う。少し待つと採掘', '工作で道具を作り、緑の照準で設置']) { const item = document.createElement('li'); item.textContent = text; guide.append(item); }
    panelElement.append(guide);
    paragraph(panelElement, 'パッド横の杖1/2で持ち替え。そのボタンから引くと狙って撃ち、離すと移動へ戻ります。通常弾は「補助ON」で、パッドを引く間だけ見える敵へ移動射撃。爆発・採掘・炎の杖は手動で1回ずつ。工作→設定で左利き・両手操作へ切り替えられます。', 'muted touch-guide');
    paragraph(panelElement, '倒れても地形・素材・建物は残り、拠点から再開します。世界は有限です。', 'muted');
    if (saved.message) paragraph(panelElement, saved.message, 'load-message');
    button('旧・旅の保存を開く', () => { location.search = '?mode=expedition'; }, panelElement, 'legacy-link');
  }
  function editor(parent: HTMLElement) {
    paragraph(parent, run.canEditWands() ? '作業台のそばにいます。外したカードは持ち物へ戻ります。' : '杖のカード編集は、設置した作業台のそばで。', 'station-status');
    run.wands.forEach((wand, wi) => {
      const card = document.createElement('div'); card.className = 'wand-card';
      const title = document.createElement('h3'); title.textContent = `${wi + 1} ${wand.name}${wi === run.selected && run.tool === 'wand' ? ' · 使用中' : ''}`; card.append(title);
      paragraph(card, `${wand.shuffle ? 'ランダム順' : '順番固定'} · 魔力 ${Math.ceil(wand.mana)} / ${wand.maxMana} · ${wand.capacity}枠`);
      button('この杖を持つ', () => { run.selected = wi; chooseTool('wand'); resume(); }, card);
      const available = [...run.spells, ...wand.spells], slots = document.createElement('div'); slots.className = 'spell-slots';
      const selects: HTMLSelectElement[] = [];
      for (let n = 0; n < wand.capacity; n++) {
        const select = document.createElement('select'); select.setAttribute('aria-label', `${wand.name} の枠 ${n + 1}`); select.add(new Option('空欄', ''));
        for (const id of [...new Set(available)]) select.add(new Option(`${SPELLS[id].name} ×${available.filter(value => value === id).length}`, id));
        select.value = wand.spells[n] ?? ''; select.disabled = !run.canEditWands(); slots.append(select); selects.push(select);
      }
      card.append(slots); const feedback = paragraph(card, '', 'edit-feedback'); feedback.setAttribute('role', 'status');
      if (run.canEditWands()) button('この構成を適用', () => {
        if (run.editRunWand(wi, selects.map(select => select.value).filter(Boolean) as SpellId[])) { persist(); menu('equipment'); }
        else feedback.textContent = 'カードが足りません。枚数以内で組んでください。';
      }, card);
      parent.append(card);
    });
    paragraph(parent, `鉱山の実 ${run.ammo.bomb} / 6発（全杖共通）。カードは枚数の範囲で付け替えできます。`, 'muted');
  }
  function craftMenu(parent: HTMLElement) {
    paragraph(parent, run.nearWorkbench() ? '● 作業台の範囲内 · すべての工作ができます' : '手作り · 道具強化と弾薬は作業台のそばで', 'station-status');
    const recipes = document.createElement('div'); recipes.className = 'recipes';
    for (const [id, data] of Object.entries(RECIPES) as [RecipeId, typeof RECIPES[RecipeId]][]) {
      const recipe = document.createElement('article'); recipe.className = 'recipe'; recipe.dataset.ready = String(run.canCraft(id));
      const name = document.createElement('h3'); name.textContent = data.name; recipe.append(name); paragraph(recipe, data.description);
      const cost = document.createElement('div'); cost.className = 'recipe-cost';
      const missing: string[] = [];
      for (const [key, needed] of Object.entries(data.cost) as [Resource, number][]) {
        const owned = run.resources[key], count = document.createElement('span'); count.dataset.enough = String(owned >= needed);
        count.textContent = `${RESOURCES[key]} ${owned}/${needed}`; cost.append(count);
        if (owned < needed) missing.push(`${RESOURCES[key]} ${needed - owned}`);
      }
      recipe.append(cost);
      const unavailable = id === 'pickaxe' && run.pickaxeLevel > 0 ? '強化済み' : id === 'ammo' && run.ammo.bomb >= 6 ? '弾薬がいっぱい' : data.workbench && !run.nearWorkbench() ? '作業台のそばへ' : missing.length ? `不足：${missing.join('・')}` : '材料が揃っています';
      paragraph(recipe, unavailable, 'recipe-requirement');
      const make = button(`${data.name}を作る`, () => {
        if (!run.craft(id)) return;
        persist(); menu('craft');
        const created = element('.craft-feedback'); created.textContent = `${data.name}を作りました。${id === 'ammo' || id === 'pickaxe' ? '装備に反映されました。' : '持ち物か下の道具一覧から選んで設置できます。'}`;
      }, recipe, 'craft-button');
      make.disabled = !run.canCraft(id); make.dataset.recipe = id;
      recipes.append(recipe);
    }
    parent.append(recipes);
    const feedback = paragraph(parent, '', 'craft-feedback'); feedback.setAttribute('role', 'status');
    paragraph(parent, '壁は工作不要。木・石・砂を9個集め、道具一覧で選んで設置。石の壁は防火・せき止めに使えます。', 'muted');
  }
  function inventoryMenu(parent: HTMLElement) {
    const inventory = document.createElement('div'); inventory.className = 'inventory-grid';
    for (const [id, count] of Object.entries(run.resources) as [Resource, number][]) {
      const card = document.createElement('article'); card.className = 'inventory-item';
      const heading = document.createElement('h3'); heading.textContent = RESOURCES[id]; const quantity = document.createElement('strong'); quantity.textContent = String(count); card.append(heading, quantity);
      if (id !== 'ore') button('手に持つ', () => { chooseTool(id); resume(); }, card);
      else paragraph(card, '作業台で強化・弾薬に');
      inventory.append(card);
    }
    parent.append(inventory);
    paragraph(parent, `設置した設備 ${run.structures.length}個 · ${run.camp ? `復帰する拠点 X${Math.round(run.camp.x)} / Y${Math.round(run.camp.y)}` : '拠点を置くと、その場所から復帰できます。'}`, 'muted');
    paragraph(parent, '設備は床の上へ。つるはしで回収して持ち運べます。足場を失った設備も完成品として戻ります。', 'muted');
  }
  function qualityStatus() {
    const metrics = renderer.metrics, label = { low: '軽量', balanced: '標準', high: '高品質' }[metrics.effectiveQuality];
    return metrics.fallback === 'canvas' ? 'この環境では一部の光の効果を省略して描画しています。' : metrics.fallback === 'performance' ? `負荷のため、実際の描画品質を「${label}」に下げています。品質を選び直すと再試行できます。` : `現在の描画品質：${label}`;
  }
  function settingsMenu(parent: HTMLElement) {
    const heading = document.createElement('h2'); heading.textContent = '画質と灯り'; parent.append(heading);
    const qualityLabel = document.createElement('label'); qualityLabel.className = 'setting-row'; qualityLabel.textContent = '描画品質';
    const quality = document.createElement('select'); quality.id = 'quality-select'; quality.setAttribute('aria-label', '描画品質');
    for (const [value, label] of [['low', '軽量'], ['balanced', '標準'], ['high', '高品質']]) quality.add(new Option(label, value));
    quality.value = graphics.quality; qualityLabel.append(quality); parent.append(qualityLabel);
    const qualityFeedback = paragraph(parent, qualityStatus(), 'quality-feedback'); qualityFeedback.id = 'quality-status'; qualityFeedback.setAttribute('role', 'status');
    const feedback = paragraph(parent, '変更はその場で反映されます。', 'settings-feedback'); feedback.setAttribute('role', 'status');
    const saveSettings = () => {
      applyGraphics();
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, ...graphics, ...controlPreferences, combatAssist })); feedback.textContent = '設定を保存しました。'; }
      catch { feedback.textContent = '設定を変更しました。保存はできませんでした。'; }
    };
    quality.addEventListener('change', () => { graphics.quality = quality.value as Quality; saveSettings(); });
    for (const [key, label] of [['pbr', '材質の反射・凹凸'], ['volumetric', '空気中ににじむ光'], ['bloom', '灯りの輝き']] as const) {
      const row = document.createElement('label'); row.className = 'setting-row';
      const text = document.createElement('span'); text.textContent = label;
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = `effect-${key}`; checkbox.checked = graphics[key];
      checkbox.addEventListener('change', () => { graphics[key] = checkbox.checked; saveSettings(); }); row.append(text, checkbox); parent.append(row);
    }
    paragraph(parent, '重いときは「軽量」へ。反射・光のにじみ・輝きは、それぞれ切り替えできます。', 'muted');
    const help = document.createElement('h2'); help.textContent = '操作'; parent.append(help);
    const layoutRow = document.createElement('label'); layoutRow.className = 'setting-row'; layoutRow.textContent = 'スマホの操作';
    const layout = document.createElement('select'); layout.id = 'control-layout'; layout.setAttribute('aria-label', 'スマホの操作');
    layout.add(new Option('片手・親指ひとつ', 'one-hand')); layout.add(new Option('両手・個別パッド', 'two-hand')); layout.value = controlPreferences.layout; layoutRow.append(layout); parent.append(layoutRow);
    const handRow = document.createElement('label'); handRow.className = 'setting-row'; handRow.textContent = '片手パッドを持つ手';
    const hand = document.createElement('select'); hand.id = 'control-hand'; hand.setAttribute('aria-label', '片手パッドを持つ手');
    hand.add(new Option('右手', 'right')); hand.add(new Option('左手', 'left')); hand.value = controlPreferences.hand; handRow.append(hand); parent.append(handRow);
    layout.addEventListener('change', () => { controlPreferences.layout = layout.value === 'two-hand' ? 'two-hand' : 'one-hand'; applyControls(); saveSettings(); });
    hand.addEventListener('change', () => { controlPreferences.hand = hand.value === 'left' ? 'left' : 'right'; applyControls(); saveSettings(); });
    const assistRow = document.createElement('label'); assistRow.className = 'setting-row'; assistRow.textContent = '片手・通常弾の移動射撃';
    const assistCheckbox = document.createElement('input'); assistCheckbox.type = 'checkbox'; assistCheckbox.id = 'combat-assist'; assistCheckbox.checked = combatAssist;
    assistCheckbox.addEventListener('change', () => { combatAssist = assistCheckbox.checked; controls.clear('assist-change'); updateControlMode(); saveSettings(); }); assistRow.append(assistCheckbox); parent.append(assistRow);
    paragraph(parent, '片手：パッド隣の杖1/2を押して装備。そのボタンから引くと手動で狙い、0.12秒後から射撃。離すと移動パッドへ戻れます。通常弾の移動射撃をONにすると、移動・浮遊中に画面内の近い敵だけを狙います。壁越し・画面外・敵なしでは撃ちません。爆発・炎・採掘を含む杖は手動で1ドラッグ1詠唱だけ。次の弾は指を戻すか離して、引き直してください。次のカード名は道具欄に表示します。');
    paragraph(parent, '採掘・設置は道具を選んで作業パッドを引き、0.22秒後から使用。設置は1ドラッグ1個だけ。中央へ戻すか離すと停止します。置けないときは理由を確認し、離してから引き直してください。作業から歩行へは「移動」を押します。');
    paragraph(parent, '両手：移動パッドを上へ引くと移動しながら浮遊。照準パッドや世界を触って狙い、「使う」を押し続けます。どちらの操作でも、指を離した照準の方向は残ります。');
    paragraph(parent, 'PC：A/Dで移動、Spaceで浮遊、マウスで狙って左クリックまたはXで使用。1/2で杖、3でつるはし、4で石の壁、5でたいまつ。Tabで工作、Escで戻ります。');
    const world = document.createElement('h2'); world.textContent = 'この世界'; parent.append(world);
    paragraph(parent, `シード ${run.seed} · 広さ ${run.world.width} × ${run.world.height} · 復帰 ${run.deaths}回。地形・持ち物・拠点を自動保存します。`);
    paragraph(parent, '世界には端があります。遠くの区画の物質シミュレーションは休止し、近づくと再開します。旧「旅」の保存は別に保持しています。', 'muted');
  }
  function menu(tab: MenuTab = 'craft') {
    if (!started) return;
    if (!paused) persist(); menuTab = tab;
    const panelElement = panel('灯りの工房', 'WORKSHOP · 世界は一時停止中'); panelElement.classList.add('workshop');
    const header = document.createElement('div'); header.className = 'workshop-header';
    button('世界に戻る', resume, header, 'primary'); paragraph(header, `木 ${run.resources.wood} · 石 ${run.resources.stone} · 砂 ${run.resources.sand} · 鉱石 ${run.resources.ore}`, 'inventory-summary'); panelElement.append(header);
    const tabs = document.createElement('nav'); tabs.className = 'workshop-tabs'; tabs.setAttribute('aria-label', '工作メニュー');
    for (const [id, label] of [['craft', '工作'], ['inventory', '持ち物'], ['equipment', '装備'], ['settings', '設定']] as [MenuTab, string][]) {
      const tabButton = button(label, () => menu(id), tabs); tabButton.dataset.tab = id; tabButton.setAttribute('aria-current', String(id === menuTab));
    }
    panelElement.append(tabs); const content = document.createElement('div'); content.className = 'workshop-content'; panelElement.append(content);
    if (tab === 'craft') craftMenu(content); else if (tab === 'inventory') inventoryMenu(content); else if (tab === 'equipment') editor(content); else settingsMenu(content);
    const footer = document.createElement('footer'); footer.className = 'workshop-footer';
    button('保存してタイトルへ', () => { if (persist()) { started = false; welcome(); } }, footer); panelElement.append(footer);
  }
  function pickup() {
    const found = run.nearbyWand(); if (!found || paused) return;
    const panelElement = panel('拾った杖', '交換 / 古い杖はその場へ'); paragraph(panelElement, `${found.wand.name} · ${found.wand.spells.map(id => SPELLS[id].name).join(' → ')}`);
    run.wands.forEach((wand, i) => button(`${i + 1} ${wand.name} と交換`, () => { if (run.exchangeWand(found.id, i)) { persist(); resume(); } }, panelElement, 'primary'));
    button('交換せず戻る', resume, panelElement);
  }
  function updateHud() {
    const player = run.player, wand = run.wands[run.selected];
    for (const [name, value, max] of [['health', player.hp, player.maxHp], ['mana', wand.mana, wand.maxMana], ['fuel', player.fuel, player.maxFuel]] as [string, number, number][]) {
      element(`.${name} i`).style.width = `${Math.max(0, Math.min(100, value / max * 100))}%`; element(`.${name} b`).textContent = String(Math.ceil(value));
    }
    element('.mana').hidden = run.tool !== 'wand';
    element('#depth').textContent = `X ${Math.floor(player.x)} · Y ${Math.floor(player.y)}${run.camp ? ' · 拠点あり' : ''}`;
    element('#region-name').textContent = getRegionName(player.x, player.y);
    if (run.notice !== lastNotice) { lastNotice = run.notice; noticeUntil = run.time + 4.5; }
    element('.notice').textContent = run.notice; element('.notice').hidden = !run.notice || run.time > noticeUntil;
    element('.resource-strip').textContent = `木 ${run.resources.wood}　石 ${run.resources.stone}　砂 ${run.resources.sand}　鉱石 ${run.resources.ore}`;
    tool.value = run.tool;
    root.querySelectorAll<HTMLElement>('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === run.tool)));
    element('#wand-select').setAttribute('aria-pressed', String(run.tool === 'wand')); element('#wand-select small').textContent = `杖 ${run.selected + 1}`;
    root.querySelectorAll<HTMLElement>('[data-wand-slot]').forEach(button => {
      const slot = Number(button.dataset.wandSlot), safe = allowsAssistedFire(run.wands[slot]);
      button.setAttribute('aria-pressed', String(run.tool === 'wand' && run.selected === slot));
      button.querySelector('small')!.textContent = safe && combatAssist ? '移動射撃' : safe ? '手動射撃' : '1回ずつ';
      button.title = `${run.wands[slot].name} · ${safe && combatAssist ? 'パッドで移動射撃、ここから引いて手動射撃' : safe ? 'ここから引いて手動射撃。移動射撃は設定でOFF' : 'ここから引いて手動で1詠唱。指を戻すか離して次のカードへ'}`;
    });
    element('[data-quick-tool="pick"]').setAttribute('aria-pressed', String(run.tool === 'pick'));
    for (const resource of ['stone', 'torch'] as const) element(`[data-count="${resource}"]`).textContent = String(resource === 'stone' ? Math.floor(run.resources.stone / 9) : run.resources.torch);
    element('#pickup').hidden = paused || !run.nearbyWand(); element('.spray-button small').textContent = `水 ${Math.floor(run.flask)}`;
    const action = run.tool === 'pick' ? '掘る' : run.tool === 'wand' ? '撃つ' : '置く';
    element('#use-button span').textContent = ICONS[run.tool]; element('#use-button small').textContent = action;
    element('#thumb-tool-icon').textContent = ICONS[run.tool]; element('#thumb-work-label').textContent = action;
    element('.thumb-water small').textContent = `水 ${Math.floor(run.flask)}`;
    const target = run.targetFromAim(controls.state.aimX, controls.state.aimY), status = element('#tool-status');
    if (run.tool === 'pick' || run.tool === 'wand') {
      const card = wand.deck[wand.cursor] ?? wand.spells[0];
      const next = wand.shuffle && wand.cursor >= wand.deck.length ? '再抽選' : card ? SPELLS[card].name : '空';
      const firing = combatAssist && allowsAssistedFire(wand) ? 'パッドで移動射撃' : allowsAssistedFire(wand) ? '杖から引いて手動射撃' : `手動1回 · 次：${next}`;
      status.textContent = `${TOOLS[run.tool]} · ${run.tool === 'pick' ? controlPreferences.layout === 'one-hand' ? '「掘る」で引いて狙う' : '狙って「掘る」' : controlPreferences.layout === 'one-hand' ? firing : `鉱山の実 ${run.ammo.bomb}発`}`; status.dataset.valid = 'neutral';
    }
    else { const placement = run.placementStatus(run.tool, target.x, target.y); status.textContent = `${TOOLS[run.tool]} · ${placement.message}${controlPreferences.layout === 'one-hand' ? ' · 離して次へ' : ''}`; status.dataset.valid = placement.ok ? 'true' : 'false'; }
    canvas.dataset.survival = JSON.stringify({ seed: run.seed, x: player.x, y: player.y, hp: player.hp, tool: run.tool, resources: run.resources, structures: run.structures, camp: run.camp, spawn: run.spawn, deaths: run.deaths, pickaxeLevel: run.pickaxeLevel, canEdit: run.canEditWands(), cameraX: renderer.cameraX, cameraY: renderer.cameraY, width: renderer.width, height: renderer.height, worldWidth: run.world.width, worldHeight: run.world.height, chunkX: Math.floor(player.x / OPEN_CHUNK_SIZE), chunkY: Math.floor(player.y / OPEN_CHUNK_SIZE), region: getRegionName(player.x, player.y), activeRegion: run.world.activeRegion, lastStepCells: run.world.lastStepCells, target, time: run.time });
    canvas.dataset.tick = String(run.world.tick); canvas.dataset.playerX = player.x.toFixed(2); canvas.dataset.playerY = player.y.toFixed(2); canvas.dataset.fuel = player.fuel.toFixed(2); canvas.dataset.phase = run.phase;
    canvas.dataset.inputMove = String(controls.state.move); canvas.dataset.inputFire = String(controls.state.fire); canvas.dataset.inputFly = String(controls.state.fly); canvas.dataset.inputAimX = String(controls.state.aimX); canvas.dataset.inputAimY = String(controls.state.aimY); canvas.dataset.lastInputClear = controls.lastClearReason;
    canvas.dataset.paused = String(paused);
    canvas.dataset.controlLayout = controlPreferences.layout; canvas.dataset.controlHand = controlPreferences.hand; canvas.dataset.thumbMode = controls.thumbMode; canvas.dataset.thumbPhase = controls.thumbPhase;
    const marker = element('#combat-target'); marker.hidden = paused || !combatTarget || controls.thumbMode !== 'travel' || controls.weaponGestureActive;
    if (combatTarget) { marker.style.left = `${(combatTarget.x-renderer.cameraX)/renderer.width*100}%`; marker.style.top = `${(combatTarget.y-renderer.cameraY)/renderer.height*100}%`; }
    const qualityFeedback = root.querySelector<HTMLElement>('#quality-status');
    if (qualityFeedback) qualityFeedback.textContent = qualityStatus();
  }
  const resize = () => { renderer.resize(); drawRequested = true; }; window.addEventListener('resize', resize); renderer.resize(); welcome();
  function refreshCombatAim() {
    const assist = combatAssist && !controls.weaponGestureActive && controlPreferences.layout === 'one-hand' && run.tool === 'wand' && allowsAssistedFire(run.wands[run.selected]);
    // Keep assisted shots in the visible play area, above the phone's controls.
    combatTarget = assist ? findCombatTarget(run, { x: renderer.cameraX, y: renderer.cameraY, width: renderer.width, height: renderer.height * (renderer.width < renderer.height ? 0.65 : 1) }) : null;
    controls.setCombatAim(combatTarget ? { x: combatTarget.aimX, y: combatTarget.aimY } : null, Boolean(combatTarget));
  }
  const loop = (now: number) => {
    if (disposed) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (started && !paused) {
      refreshCombatAim();
      controls.update(dt);
      if (game.dataset.thumbMode !== controls.thumbMode) updateControlMode();
      accumulator += dt; let steps = 0;
      while (accumulator >= 1 / 60 && steps++ < 5) {
        refreshCombatAim(); const castBefore = run.castSequence;
        run.step(1 / 60, controls.state);
        controls.consumeUse(run.tool !== 'wand' || run.castSequence > castBefore);
        controls.state.interact = false; accumulator -= 1 / 60;
      }
      if (steps > 5) accumulator = 0;
      saveClock += dt; if (saveClock > 5) { saveClock = 0; persist(); }
    } else accumulator = 0;
    // Low/balanced also cap canvas presentation work; physics/input retain the
    // same fixed step. Avoid spending a phone's frame budget on redundant blits.
    renderClock += dt;
    const renderInterval = renderer.metrics.effectiveQuality === 'low' ? 1 / 30 : renderer.metrics.effectiveQuality === 'balanced' ? 1 / 45 : 1 / 60;
    if (drawRequested || !paused && renderClock >= renderInterval) { renderer.draw(run, controls.state); drawRequested = false; renderClock = 0; }
    hudClock += dt; if (hudClock > 0.1) { updateHud(); hudClock = 0; }
    frame = requestAnimationFrame(loop);
  };
  const unload = () => { if (started) persist(); }; window.addEventListener('pagehide', unload); frame = requestAnimationFrame(loop); updateHud();
  return () => { disposed = true; cancelAnimationFrame(frame); controls.dispose(); window.removeEventListener('resize', resize); window.removeEventListener('pagehide', unload); root.innerHTML = ''; };
}
function seed() {
  const value = new URLSearchParams(location.search).get('seed');
  return value && /^\d{1,10}$/.test(value) && Number(value) <= 0xffffffff ? Number(value) >>> 0 : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
