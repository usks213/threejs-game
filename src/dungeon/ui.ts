import { CLASSES, ITEMS } from './catalog';
import { BAG_HEIGHT, BAG_WIDTH, STASH_HEIGHT, dimensions, fits, place } from './inventory';
import { RAID_SECONDS, type Action, type ClassId, type Item, type Snapshot, type Input } from './types';
import { distance, wallRay } from './world';
import './style.css';
import {combatReadout,focusedOpponent,receivedDamage} from './readability';
import { SUPPLIES, loadoutWeapon, preparationIssue, saleValue } from './economy';
import type { SupplyKind } from './types';
import { createPendingReturnPanel, pendingReturnIssue } from './pending-return-panel';
import { createQuestPanel } from './quest-panel';

type Callbacks = {
  create(name: string): void;
  join(room: string, name: string): void;
  action(action: Action): boolean | void;
  reconnect(): void;
  inventory(open: boolean): void;
  leave(): void;
  copyInvite(): void;
};
type InventorySource = 'bag' | 'stash';
type Player = Snapshot['actors'][number];
type NearbyTarget = { id: string; title: string; description: string; disabled: boolean; opened: boolean };

const CLASS_NOTES: Record<ClassId, string> = {
  bastion: '盾と片剣で前線を支える',
  ravager: '大剣の重い一撃を狙う',
  shade: '軽い足取りと短剣で接近',
  hunter: '弓を引き、距離を保つ',
  arcanist: '限られた術で道を切り開く',
  keeper: '回復の術と盾で生き延びる',
};
const ITEM_GLYPHS: Record<Item['kind'], string> = {
  sword: '剣', greatsword: '大剣', dagger: '短剣', bow: '弓', staff: '杖', shield: '盾',
  potion: '薬', bandage: '布', arrow: '矢', relic: '遺宝', ore: '鉱', key: '鍵',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function text(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value;
}
function timeLabel(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
/** Invitations are prefilled only. Reading a URL never joins a room. */
function invitedRoom(value: string): string | null {
  const clean = value.trim();
  if (/^[a-f0-9]{64}$/i.test(clean)) return clean.toLowerCase();
  try {
    const url = new URL(clean, window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const room = hash.get('dungeon');
    return room && /^[a-f0-9]{64}$/i.test(room) ? room.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function createDungeonUI(root: HTMLElement, callbacks: Callbacks) {
  const hadRootClass = root.classList.contains('dungeon-app');
  root.classList.add('dungeon-app');
  const shell = element('div', 'dungeon-shell');
  const listeners = new AbortController();
  const listen = (node: EventTarget, type: string, handler: EventListener) =>
    node.addEventListener(type, handler, { signal: listeners.signal });
  const button = (label: string, className = '', handler?: () => void) => {
    const node = element('button', `dungeon-button ${className}`, label);
    node.type = 'button';
    if (handler) listen(node, 'click', handler);
    return node;
  };
  let snapshot: Snapshot | null = null;
  let inventoryOpen = false;
  let selected: { id: string; source: InventorySource } | null = null;
  let focusBeforeInventory: HTMLElement | null = null;
  let invite = '';
  let room = '';
  let inventorySignature = '';
  let targetSignature = '';
  let participantsSignature = '';
  let lootSignature = '';
  let disposed = false;
  let damageFlash = 0;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  const player = () => snapshot?.actors.find(actor => actor.id === snapshot?.you);
  const alive = () => snapshot?.phase === 'raid' && player()?.status === 'alive';

  const canvas = element('canvas', 'dungeon-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '灰の回廊：一人称ダンジョン画面');
  const header = element('header', 'dungeon-header');
  const brand = element('div', 'dungeon-brand');
  brand.append(element('span', 'dungeon-brand-symbol', '◇'), element('span', '', 'ASHEN VAULT'));
  const connection = element('span', 'dungeon-connection', '未接続');
  connection.setAttribute('role', 'status');
  connection.dataset.testid = 'dungeon-connection';
  const roomLabel = element('span', 'dungeon-room-label');
  const headerActions = element('div', 'dungeon-header-actions');
  const bagButton = button('鞄を開く · I', 'dungeon-button-small', () => changeInventory(!inventoryOpen, true));
  bagButton.hidden = true;
  bagButton.dataset.testid = 'dungeon-bag-toggle';
  bagButton.setAttribute('aria-expanded', 'false');
  bagButton.setAttribute('aria-controls', 'dungeon-inventory');
  const reconnectButton = button('再接続', 'dungeon-button-small', () => callbacks.reconnect());
  reconnectButton.hidden = true;
  reconnectButton.dataset.testid = 'dungeon-reconnect';
  const leaveButton = button('部屋を離れる', 'dungeon-button-small', () => callbacks.leave());
  leaveButton.hidden = true;
  const campaign = element('a', 'dungeon-campaign-link', '七つの灯へ');
  campaign.href = '?mode=campaign';
  campaign.title = '既存のキャンペーンを開く';
  headerActions.append(roomLabel, bagButton, reconnectButton, leaveButton, campaign);
  header.append(brand, connection, headerActions);

  const lobby = element('main', 'dungeon-lobby');
  const introduction = element('section', 'dungeon-introduction');
  introduction.append(element('p', 'dungeon-eyebrow', 'PRIVATE EXPEDITION · 1–6 EXPLORERS'));
  introduction.append(element('h1', 'dungeon-title', '灰の回廊'));
  introduction.append(element('p', 'dungeon-subtitle', 'ASHEN VAULT'));
  introduction.append(element('p', 'dungeon-intro-copy', '灯の届かない石の迷宮。戦利品を掴み、帰還の光まで生き延びる。'));
  const prototype = element('p', 'dungeon-prototype-note', '初期・簡易PvPvE試作。探索者同士も敵対します。死亡すると携行品を失い、抽出に成功した品だけが倉庫に残ります。');
  introduction.append(prototype);
  const principles = element('div', 'dungeon-principles');
  for (const [number, title, detail] of [
    ['01', '備える', '6つの役割と格子式の鞄'],
    ['02', '探索する', '番兵・ほかの探索者・戦利品'],
    ['03', '持ち帰る', '8分の制限時間 / 4秒の抽出'],
  ]) {
    const card = element('div', 'dungeon-principle');
    card.append(element('span', 'dungeon-principle-number', number), element('strong', '', title), element('span', '', detail));
    principles.append(card);
  }
  introduction.append(principles);
  const instructions = element('details', 'dungeon-instructions');
  const instructionsSummary = element('summary', '', '操作と遠征のルール');
  instructions.append(instructionsSummary);
  instructions.append(element('p', '', 'PC：画面をクリックして視点操作 / WASD 移動 / 左クリック・T 攻撃 / 右ボタン・Z 防御 / R 重攻撃 / E 調べる / Q 回復 / G 術 / F 弓 / I 鞄 / Esc マウス解除'));
  instructions.append(element('p', '', 'マウス固定が使えない場合：左ドラッグで視点、短い左クリックで攻撃、右ボタンを押して防御。矢印キーでも視点を動かせます（Shiftで微調整）。'));
  instructions.append(element('p', '', 'タッチ：左パッドで移動、右パッドで視点。攻撃ボタンと防御・しゃがみは同時に操作できます。'));
  instructions.append(element('p', '', '抽出の光は開始45秒・90秒・180秒後に順番に開きます。光のそばで「抽出」を選び、4秒静止してください。移動・被撃で中断します。'));
  instructions.append(element('p', '', '鞄を開くと自分の操作が止まります。遠征の時間と周囲の敵は止まりません。部屋を離れても安全な抽出にはなりません。'));
  introduction.append(instructions);

  const lobbyPanel = element('section', 'dungeon-lobby-panel');
  const entry = element('form', 'dungeon-entry');
  entry.append(element('p', 'dungeon-eyebrow', 'ENTER THE VAULT'));
  entry.append(element('h2', '', '遠征への入り口'));
  const nameLabel = element('label', 'dungeon-label', '探索者の名前');
  const nameInput = element('input', 'dungeon-input');
  nameInput.name = 'explorer';
  nameInput.dataset.testid = 'dungeon-name';
  nameInput.maxLength = 20;
  nameInput.placeholder = '探索者';
  nameInput.autocomplete = 'off';
  nameLabel.append(nameInput);
  const createButton = button('プライベート部屋を作る', 'dungeon-button-primary', () => {
    if (!disposed) callbacks.create(nameInput.value.trim().slice(0, 20) || '探索者');
  });
  createButton.dataset.testid = 'dungeon-create';
  const divider = element('div', 'dungeon-divider', '招待を受け取った方');
  const roomInputLabel = element('label', 'dungeon-label', '招待URL または 部屋ID');
  const roomInput = element('input', 'dungeon-input');
  roomInput.name = 'room';
  roomInput.dataset.testid = 'dungeon-room';
  roomInput.type = 'text';
  roomInput.autocomplete = 'off';
  roomInput.spellcheck = false;
  roomInput.maxLength = 2048;
  roomInput.placeholder = '招待URLを貼り付け';
  roomInput.value = invitedRoom(window.location.href) ?? '';
  roomInputLabel.append(roomInput);
  const joinButton = button('招待された部屋に参加', '', () => {
    const id = invitedRoom(roomInput.value);
    if (!id) { notice('有効な招待URLか、64文字の部屋IDを入力してください。'); roomInput.focus(); return; }
    callbacks.join(id, nameInput.value.trim().slice(0, 20) || '探索者');
  });
  joinButton.dataset.testid = 'dungeon-join';
  listen(entry, 'submit', event => { event.preventDefault(); });
  const privacyHint = element('p', 'dungeon-fine-print', 'この試作はアカウント認証なしの招待部屋です。URLは参加を許可する相手だけに共有してください。招待は持ち物を引き継ぎません。参加はボタンを押したときに行います。');
  entry.append(nameLabel, createButton, divider, roomInputLabel, joinButton, privacyHint);

  const preparation = element('div', 'dungeon-preparation');
  preparation.hidden = true;
  preparation.append(element('p', 'dungeon-eyebrow', 'EXPEDITION PREPARATION'));
  preparation.append(element('h2', '', '補給所'));
  const invitationLabel = element('label', 'dungeon-label', '同じ部屋への招待');
  const invitationInput = element('input', 'dungeon-input dungeon-invite-input');
  invitationInput.readOnly = true;
  invitationInput.dataset.testid = 'dungeon-invite';
  invitationInput.setAttribute('aria-label', 'この部屋の招待URL');
  invitationLabel.append(invitationInput);
  const copyButton = button('招待URLをコピー', '', () => callbacks.copyInvite());
  copyButton.disabled = true;
  preparation.append(invitationLabel, copyButton);
  const classLabel = element('h3', '', '役割を選ぶ');
  const classList = element('div', 'dungeon-class-list');
  const classButtons = new Map<ClassId, HTMLButtonElement>();
  for (const id of Object.keys(CLASSES) as ClassId[]) {
    const data = CLASSES[id];
    const option = button('', 'dungeon-class-option', () => callbacks.action({ kind: 'class', classId: id }));
    option.setAttribute('aria-pressed', 'false');
    option.dataset.testid = `dungeon-class-${id}`;
    option.append(element('strong', '', data.name), element('span', '', CLASS_NOTES[id]), element('small', '', `HP ${data.hp} · ${ITEMS[data.weapon].name}`));
    classButtons.set(id, option);
    classList.append(option);
  }
  const playersTitle = element('h3', '', '参加中の探索者');
  const participants = element('ul', 'dungeon-participants');
  const preparationActions = element('div', 'dungeon-preparation-actions');
  const pendingSummary = element('div', 'dungeon-pending-summary');
  pendingSummary.dataset.testid = 'dungeon-pending-summary';
  pendingSummary.hidden = true;
  const pendingSummaryText = element('p', 'dungeon-fine-print');
  const pendingOpen = button('未受領品を受け取る', '', () => {
    changeInventory(true, true);
    inventoryPanel.scrollTop = 0;
  });
  pendingOpen.dataset.testid = 'dungeon-pending-open';
  pendingSummary.append(pendingSummaryText, pendingOpen);
  const inventoryButton = button('鞄と倉庫を確認', '', () => changeInventory(true, true));
  const readyButton = button('準備完了にする', '', () => callbacks.action({ kind: 'ready' }));
  const startButton = button('全員で遠征を開始', 'dungeon-button-primary', () => callbacks.action({ kind: 'start' }));
  readyButton.dataset.testid = 'dungeon-ready';
  startButton.dataset.testid = 'dungeon-start';
  const preparationLoadout = element('p', 'dungeon-loadout-preview');
  preparationLoadout.dataset.testid = 'dungeon-loadout-preview';
  const startHint = element('p', 'dungeon-fine-print', '接続中の全員が準備完了になると開始できます。1人でも出発できます。');
  startHint.id = 'dungeon-start-hint';
  startHint.dataset.testid = 'dungeon-start-hint';
  readyButton.setAttribute('aria-describedby', startHint.id);
  startButton.setAttribute('aria-describedby', startHint.id);
  preparationActions.append(inventoryButton, readyButton, startButton);
  const questPanel = createQuestPanel(callbacks.action, listeners.signal);
  const questOpen = button('補給所の依頼を見る · 2件', '', () => {
    questPanel.root.scrollIntoView({ block: 'start', behavior: 'instant' });
    questPanel.root.focus({ preventScroll: true });
  });
  questOpen.dataset.testid = 'dungeon-quest-open';
  questOpen.setAttribute('aria-controls', 'dungeon-quest-panel');
  questPanel.root.id = 'dungeon-quest-panel';
  questPanel.root.tabIndex = -1;
  preparation.insertBefore(questOpen, invitationLabel);
  preparation.insertBefore(questPanel.summary, invitationLabel);
  preparation.append(classLabel, classList, playersTitle, participants, preparationLoadout, pendingSummary, preparationActions, startHint, questPanel.root);
  lobbyPanel.append(entry, preparation);
  lobby.append(introduction, lobbyPanel);

  const hud = element('section', 'dungeon-hud');
  hud.hidden = true;
  hud.setAttribute('aria-label', '探索者の状態');
  const healthPanel = element('div', 'dungeon-vitals');
  const playerName = element('strong', 'dungeon-player-name');
  const hpText = element('span', 'dungeon-hp-text');
  const healthTrack = element('div', 'dungeon-health-track');
  healthTrack.setAttribute('role', 'meter');
  healthTrack.setAttribute('aria-label', '体力');
  healthTrack.setAttribute('aria-valuemin', '0');
  const recoverableBar = element('div', 'dungeon-recoverable-bar');
  const hpBar = element('div', 'dungeon-health-bar');
  healthTrack.append(recoverableBar, hpBar);
  const resourceText = element('div', 'dungeon-resources');
  const guardTrack = element('div', 'dungeon-guard-track');
  const guardBar = element('div', 'dungeon-guard-bar');
  guardTrack.append(guardBar);
  const guardLabel = element('span', 'dungeon-guard-label', '防御の構え');
  healthPanel.append(playerName, hpText, healthTrack, resourceText, guardLabel, guardTrack);
  const objective = element('div', 'dungeon-objective');
  const timer = element('strong', 'dungeon-timer', '8:00');
  const aliveCount = element('span', 'dungeon-alive-count');
  objective.append(element('span', 'dungeon-eyebrow', 'TIME TO RETURN'), timer, aliveCount, questPanel.raid);
  const crosshair = element('div', 'dungeon-crosshair', '+');
  crosshair.setAttribute('aria-hidden', 'true');
  const interactionProgress = element('div', 'dungeon-interaction-progress');
  interactionProgress.hidden = true;
  const interactionText = element('span');
  const interactionTrack = element('progress', 'dungeon-progress');
  interactionTrack.dataset.testid = 'dungeon-extraction-progress';
  interactionTrack.setAttribute('aria-label', '調査・抽出の進行');
  interactionProgress.append(interactionText, interactionTrack);
  const nearbyPanel = element('div', 'dungeon-nearby');
  const eventLog = element('ol', 'dungeon-events');
  eventLog.setAttribute('aria-label', '遠征の出来事');
  const controlsHint = element('p', 'dungeon-controls-hint', '画面クリックで視点 · 左 攻撃 / 右 防御 · WASD 移動 · E 調べる · I 鞄');
  const damageOverlay = element('div', 'dungeon-damage-overlay');
  damageOverlay.setAttribute('aria-hidden', 'true');
  const opponent = element('div', 'dungeon-opponent');
  opponent.dataset.testid = 'dungeon-opponent';
  opponent.hidden = true;
  const opponentName = element('strong');
  const opponentHealth = element('progress');
  opponentHealth.setAttribute('aria-label', '照準先の体力');
  const opponentPhase = element('span');
  opponent.append(opponentName, opponentHealth, opponentPhase);
  const combatState = element('div', 'dungeon-combat-state');
  combatState.dataset.testid = 'dungeon-combat-state';
  const combatLabel = element('span');
  const combatProgress = element('progress');
  combatProgress.max = 1;
  combatProgress.setAttribute('aria-label', '攻撃動作の進行');
  combatState.append(combatLabel, combatProgress);
  hud.append(damageOverlay, healthPanel, objective, crosshair, opponent, combatState, interactionProgress, nearbyPanel, eventLog, controlsHint);

  const gameplayControls = element('div', 'dungeon-gameplay-controls');
  gameplayControls.hidden = true;
  const movePad = element('div', 'dungeon-touch-pad dungeon-move-pad');
  movePad.setAttribute('aria-label', 'タッチ移動パッド');
  movePad.dataset.dungeonPad = 'move';
  movePad.dataset.testid = 'dungeon-move-pad';
  movePad.append(element('span', '', '移動'), element('span', 'dungeon-pad-center', '✥'));
  const lookPad = element('div', 'dungeon-touch-pad dungeon-look-pad');
  lookPad.setAttribute('aria-label', 'タッチ視点パッド');
  lookPad.dataset.dungeonPad = 'look';
  lookPad.dataset.testid = 'dungeon-look-pad';
  lookPad.append(element('span', '', '視点'), element('span', 'dungeon-pad-center', '◎'));
  const actionBar = element('div', 'dungeon-action-bar');
  const actionButtons = new Map<string, HTMLElement>();
  for (const [action, label, key] of [
    ['attack', '攻撃', 'T'], ['heavy', '重撃', 'R'], ['block', '防御', 'Z'], ['interact', '調べる', 'E'],
    ['heal', '回復', 'Q'], ['cast', '術', 'G'], ['shoot', '弓', 'F'], ['crouch', '屈む', 'C'],
  ]) {
    // Input owns these listeners, including independent pointer IDs for held controls.
    const control = button('', `dungeon-action-button dungeon-action-${action}`);
    control.dataset.dungeonAction = action;
    control.dataset.testid = `dungeon-action-${action}`;
    control.setAttribute('aria-label', `${label} (${key})${action === 'block' || action === 'crouch' ? '・押し続ける' : ''}`);
    control.append(element('span', '', label), element('kbd', '', key));
    actionButtons.set(action, control);
    actionBar.append(control);
  }
  gameplayControls.append(movePad, lookPad, actionBar);

  const outcome = element('section', 'dungeon-outcome');
  outcome.hidden = true;
  const resultCard = element('div', 'dungeon-result-card');
  resultCard.dataset.testid = 'dungeon-result';
  const resultEyebrow = element('p', 'dungeon-eyebrow');
  const resultTitle = element('h2');
  const resultText = element('p', 'dungeon-result-text');
  const resultStats = element('p', 'dungeon-result-stats');
  const waitingText = element('p', 'dungeon-fine-print');
  const returnButton = button('補給所へ戻る', 'dungeon-button-primary', () => callbacks.action({ kind: 'return' }));
  const resultInventory = button('倉庫を確認', '', () => changeInventory(true, true));
  resultCard.append(resultEyebrow, resultTitle, resultText, resultStats, waitingText, returnButton, resultInventory);
  outcome.append(resultCard);

  const inventoryOverlay = element('section', 'dungeon-inventory-overlay');
  inventoryOverlay.id = 'dungeon-inventory';
  inventoryOverlay.dataset.testid = 'dungeon-inventory';
  inventoryOverlay.hidden = true;
  inventoryOverlay.setAttribute('role', 'dialog');
  inventoryOverlay.setAttribute('aria-modal', 'true');
  inventoryOverlay.setAttribute('aria-labelledby', 'dungeon-inventory-title');
  const inventoryPanel = element('div', 'dungeon-inventory-panel');
  const inventoryHeading = element('div', 'dungeon-inventory-heading');
  const inventoryTitle = element('h2', '', '鞄と倉庫');
  inventoryTitle.id = 'dungeon-inventory-title';
  const closeInventory = button('閉じる · I / Esc', '', () => changeInventory(false, true));
  inventoryHeading.append(inventoryTitle, closeInventory);
  const inventoryWarning = element('p', 'dungeon-inventory-warning');
  const inventoryLoadout = element('p', 'dungeon-loadout-preview');
  inventoryLoadout.dataset.testid = 'dungeon-inventory-loadout';
  const selection = element('div', 'dungeon-selection');
  const selectedDescription = element('p', '', '品物を選ぶと詳細を確認できます。');
  const rotateButton = button('90°回転', '', rotateSelected);
  const transferButton = button('倉庫へ移す', '', transferSelected);
  rotateButton.disabled = true;
  transferButton.disabled = true;
  selection.append(selectedDescription, rotateButton, transferButton);
  const inventoryColumns = element('div', 'dungeon-inventory-columns');
  const bagSection = element('section', 'dungeon-inventory-section');
  const stashSection = element('section', 'dungeon-inventory-section');
  const bagTitle = element('h3', '', '携行品 · 10 × 5');
  const stashTitle = element('h3', '', '倉庫（この部屋・このブラウザ）· 10 × 10');
  const bagGrid = makeGrid('bag', BAG_HEIGHT);
  const stashGrid = makeGrid('stash', STASH_HEIGHT);
  const bagScroll = element('div', 'dungeon-grid-scroll');
  const stashScroll = element('div', 'dungeon-grid-scroll');
  bagScroll.tabIndex = 0;
  stashScroll.tabIndex = 0;
  bagScroll.setAttribute('aria-label', '携行品の格子。横にスクロールできます');
  stashScroll.setAttribute('aria-label', '倉庫の格子。横にスクロールできます');
  bagScroll.append(bagGrid);
  stashScroll.append(stashGrid);
  bagSection.append(bagTitle, element('p', 'dungeon-fine-print', '品物を選択 → 空きマスで移動。回転には空き領域が必要です。'), bagScroll);
  stashSection.append(stashTitle, element('p', 'dungeon-fine-print', '補給所の準備前に携行品と移せます。招待では持ち物は引き継げません。ブラウザの保存データを消すと、この倉庫へ戻れなくなります。'), stashScroll);
  inventoryColumns.append(bagSection, stashSection);
  const lootSection = element('section', 'dungeon-loot-section');
  const lootTitle = element('h3', '', '手の届く戦利品');
  const lootContent = element('div', 'dungeon-loot-content');
  lootSection.append(lootTitle, lootContent);
  const supplySection = element('section', 'dungeon-supply-section');
  supplySection.setAttribute('aria-labelledby', 'dungeon-supply-title');
  const supplyHeading = element('div', 'dungeon-supply-heading');
  const supplyTitle = element('h3', '', '部屋の補給商');
  supplyTitle.id = 'dungeon-supply-title';
  const gold = element('strong', 'dungeon-gold');
  gold.dataset.testid = 'dungeon-gold';
  gold.setAttribute('aria-live', 'polite');
  supplyHeading.append(supplyTitle, gold);
  const supplyHint = element('p', 'dungeon-fine-print', '金貨と倉庫はこの部屋・このブラウザの探索者専用です。購入品は1個ずつ倉庫へ届きます。在庫は部屋の全員で共有し、遠征開始時に補充されます。');
  const supplyStatus = element('p', 'dungeon-supply-status');
  supplyStatus.setAttribute('aria-live', 'polite');
  const supplyOffers = element('div', 'dungeon-supply-offers');
  const supplyControls = new Map<SupplyKind, { buy: HTMLButtonElement; stock: HTMLElement; reason: HTMLElement }>();
  for (const kind of Object.keys(SUPPLIES) as SupplyKind[]) {
    const offer = SUPPLIES[kind];
    const card = element('div', 'dungeon-supply-offer');
    const stock = element('span', 'dungeon-fine-print');
    stock.dataset.testid = `dungeon-shop-stock-${kind}`;
    const reason = element('span', 'dungeon-fine-print');
    reason.id = `dungeon-buy-${kind}-reason`;
    const buy = button(`${offer.name}を1個購入 · ${offer.price}金貨`, '', () => {
      if (canTrade() && !buy.disabled) callbacks.action({ kind: 'buy-supply', supply: kind });
    });
    buy.dataset.testid = `dungeon-buy-${kind}`;
    buy.setAttribute('aria-describedby', reason.id);
    card.append(buy, stock, reason);
    supplyControls.set(kind, { buy, stock, reason });
    supplyOffers.append(card);
  }
  const sellSelected = button('選択した倉庫の品を売却', '', () => {
    const item = selectedItem();
    if (canTrade() && !sellSelected.disabled && selected?.source === 'stash' && item && saleValue(item)) {
      callbacks.action({ kind: 'sell-treasure', item: item.id });
    }
  });
  sellSelected.dataset.testid = 'dungeon-sell-selected';
  const saleHint = element('p', 'dungeon-fine-print', '買い取りは抽出して持ち帰った遺宝・鉱石だけ。倉庫の品を選ぶと、選択した品の全個数を売却できます。初期装備・薬・包帯は売れません。');
  saleHint.id = 'dungeon-sale-hint';
  sellSelected.setAttribute('aria-describedby', saleHint.id);
  const tradeTitle = element('h3', '', '自分の取引履歴 · 最新6件');
  const trades = element('ol', 'dungeon-trades');
  trades.tabIndex = 0;
  trades.dataset.testid = 'dungeon-trades';
  trades.setAttribute('aria-label', '自分の最新の取引履歴');
  const noTrades = element('p', 'dungeon-fine-print', 'まだ取引はありません。');
  supplySection.append(supplyHeading, supplyHint, supplyStatus, supplyOffers, sellSelected, saleHint, tradeTitle, noTrades, trades);
  const pendingPanel = createPendingReturnPanel(callbacks.action, listeners.signal);
  inventoryPanel.append(inventoryHeading, inventoryWarning, inventoryLoadout, pendingPanel.root, selection, supplySection, inventoryColumns, lootSection);
  inventoryOverlay.append(inventoryPanel);
  listen(inventoryOverlay, 'keydown', event => {
    const key = event as KeyboardEvent;
    if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); changeInventory(false, true); return; }
    if (key.key !== 'Tab') return;
    const focusable = Array.from(inventoryOverlay.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'))
      .filter(node => !node.hidden && !node.closest('[hidden]'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (key.shiftKey && document.activeElement === first) { key.preventDefault(); last?.focus(); }
    else if (!key.shiftKey && document.activeElement === last) { key.preventDefault(); first?.focus(); }
  });

  const notification = element('div', 'dungeon-notice');
  notification.hidden = true;
  notification.setAttribute('role', 'status');
  notification.setAttribute('aria-live', 'polite');
  const notificationText = element('span');
  const dismissNotice = button('閉じる', 'dungeon-notice-dismiss', () => { notification.hidden = true; });
  notification.append(notificationText, dismissNotice);
  const graphicsError = element('section', 'dungeon-graphics-error');
  graphicsError.hidden = true;
  graphicsError.setAttribute('role', 'alert');
  graphicsError.dataset.testid = 'dungeon-graphics-error';
  const graphicsErrorText = element('p');
  graphicsError.append(element('h2', '', '描画を続けられません'), graphicsErrorText, element('p', '', 'WebGLが使えるブラウザで再読み込みしてください。生存中の切断は安全な帰還にはなりません。'), button('閉じて部屋を確認', '', () => { graphicsError.hidden = true; }));
  const graphicsIndicator = button('描画停止 · 詳細', 'dungeon-graphics-indicator', () => { graphicsError.hidden = false; });
  graphicsIndicator.hidden = true;
  graphicsIndicator.dataset.testid = 'dungeon-graphics-indicator';
  shell.append(canvas, header, lobby, hud, gameplayControls, outcome, inventoryOverlay, notification, graphicsIndicator, graphicsError);
  root.replaceChildren(shell);

  function notice(message: string) {
    if (disposed) return;
    text(notificationText, message);
    notification.hidden = !message;
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = message ? setTimeout(() => { notification.hidden = true; noticeTimer = null; }, 6500) : null;
  }
  function changeInventory(open: boolean, notify: boolean) {
    if (disposed || inventoryOpen === open) return;
    // Notify before DOM work so opening the bag immediately releases gameplay input.
    inventoryOpen = open;
    if (notify) callbacks.inventory(open);
    inventoryOverlay.hidden = !open;
    bagButton.setAttribute('aria-expanded', String(open));
    text(bagButton, open ? '鞄を閉じる · I' : '鞄を開く · I');
    gameplayControls.hidden = !alive() || open;
    nearbyPanel.hidden = open;
    crosshair.hidden = open;
    if (open) {
      focusBeforeInventory = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      renderInventory();
      closeInventory.focus();
    } else if (focusBeforeInventory?.isConnected && !focusBeforeInventory.closest('[hidden]')) {
      focusBeforeInventory.focus();
    }
  }
  function makeGrid(source: InventorySource, height: number) {
    const grid = element('div', 'dungeon-inventory-grid');
    grid.style.gridTemplateRows = `repeat(${height}, var(--dungeon-cell))`;
    grid.setAttribute('aria-label', source === 'bag' ? '携行品の配置' : '倉庫の配置');
    for (let y = 0; y < height; y++) for (let x = 0; x < BAG_WIDTH; x++) {
      const cell = button('', 'dungeon-inventory-cell');
      cell.style.gridColumn = String(x + 1);
      cell.style.gridRow = String(y + 1);
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute('aria-label', `${source === 'bag' ? '鞄' : '倉庫'} ${y + 1}行 ${x + 1}列`);
      if (source === 'stash') { cell.disabled = true; cell.tabIndex = -1; }
      grid.append(cell);
    }
    // Delegation avoids accumulating listeners when server snapshots change items.
    listen(grid, 'click', event => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!target || !grid.contains(target)) return;
      const id = target.dataset.item;
      if (id) {
        selected = { id, source };
        inventorySignature = '';
        renderInventory();
        return;
      }
      if (source !== 'bag' || selected?.source !== 'bag') return;
      const actor = player();
      const item = actor?.bag.find(value => value.id === selected?.id);
      if (!actor || !item) return;
      const next = { ...item, x: Number(target.dataset.x), y: Number(target.dataset.y) };
      if (!fits(actor.bag, next)) { notice('品物が重なるか、鞄からはみ出します。'); return; }
      callbacks.action({ kind: 'move-item', item: item.id, x: next.x, y: next.y, rotate: item.rotated });
    });
    return grid;
  }
  function canTrade() {
    const actor = player();
    return !!snapshot && snapshot.phase !== 'raid' && actor?.status === 'lobby' && !actor.ready;
  }
  function loadoutLabel(actor: Player) {
    const weapon = loadoutWeapon(actor.bag, actor.classId);
    if (!actor.bag.length) {
      return `鞄が空のため出発時に無料補給：${ITEMS[CLASSES[actor.classId].weapon].name}、${ITEMS.potion.name}×2${actor.classId === 'bastion' || actor.classId === 'keeper' ? `、${ITEMS.shield.name}` : ''}。`;
    }
    return `${weapon ? `携行武器：${ITEMS[weapon].name}。` : '携行武器：なし。'}携行品があるため初期補給は追加されません。${preparationIssue(actor.bag) ?? ''}`;
  }
  function selectedItem() {
    return selected && (selected.source === 'bag' ? player()?.bag : snapshot?.stash)?.find(item => item.id === selected?.id);
  }
  function rotateSelected() {
    const actor = player();
    const item = selectedItem();
    if (!actor || !item || selected?.source !== 'bag') return;
    const next = { ...item, rotated: !item.rotated };
    if (!fits(actor.bag, next)) { notice('この位置では回転できません。空きのある場所へ移してください。'); return; }
    callbacks.action({ kind: 'move-item', item: item.id, x: item.x, y: item.y, rotate: next.rotated });
  }
  function transferSelected() {
    const item = selectedItem();
    if (!item || !selected || !canTrade()) return;
    callbacks.action({ kind: 'transfer', item: item.id, to: selected.source === 'bag' ? 'stash' : 'bag' });
  }
  function renderItems(grid: HTMLElement, items: Item[], source: InventorySource) {
    const focusedItem = document.activeElement instanceof HTMLElement && grid.contains(document.activeElement)
      ? document.activeElement.dataset.item : undefined;
    grid.querySelectorAll('.dungeon-inventory-item').forEach(node => node.remove());
    for (const item of items) {
      const data = ITEMS[item.kind];
      const { w, h } = dimensions(item);
      const node = element('button', 'dungeon-button dungeon-inventory-item');
      node.type = 'button';
      node.dataset.item = item.id;
      node.dataset.quality = String(item.quality);
      node.style.gridColumn = `${item.x + 1} / span ${w}`;
      node.style.gridRow = `${item.y + 1} / span ${h}`;
      node.setAttribute('aria-label', `${data.name} ×${item.count} / 品質${item.quality} / ${w}×${h}マス`);
      node.setAttribute('aria-pressed', String(selected?.id === item.id && selected.source === source));
      node.title = `${data.name} ×${item.count}`;
      node.append(element('strong', 'dungeon-item-glyph', ITEM_GLYPHS[item.kind]), element('span', 'dungeon-item-count', `×${item.count}`));
      grid.append(node);
      if (focusedItem === item.id) node.focus({ preventScroll: true });
    }
  }
  function renderInventory() {
    if (!snapshot) return;
    const actor = player();
    if (!actor) return;
    if (selected && !selectedItem()) selected = null;
    const nextSignature = JSON.stringify([actor.bag, snapshot.stash, selected, snapshot.phase, actor.ready, actor.status, actor.classId, snapshot.gold, snapshot.shop, snapshot.trades, snapshot.pendingReturn]);
    if (nextSignature !== inventorySignature) {
      inventorySignature = nextSignature;
      renderItems(bagGrid, actor.bag, 'bag');
      renderItems(stashGrid, snapshot.stash, 'stash');
      text(bagTitle, `携行品 · 10 × 5 · ${actor.bag.length}品`);
      text(stashTitle, `倉庫（この部屋・このブラウザ）· ${snapshot.stash.length}品`);
      const item = selectedItem();
      const data = item && ITEMS[item.kind];
      text(selectedDescription, item && data ? `${data.name} ×${item.count} · 品質${item.quality} · ${selected?.source === 'bag' ? '携行品' : '倉庫'}` : '品物を選ぶと詳細を確認できます。');
      rotateButton.disabled = !item || selected?.source !== 'bag';
      transferButton.disabled = !item || !canTrade();
      text(transferButton, selected?.source === 'stash' ? '鞄へ移す' : '倉庫へ移す');
      inventoryLoadout.hidden = snapshot.phase === 'raid' || actor.status !== 'lobby';
      text(inventoryLoadout, loadoutLabel(actor));
      inventoryLoadout.classList.toggle('dungeon-loadout-issue', !!preparationIssue(actor.bag));
      text(gold, `${snapshot.gold} 金貨`);
      const trading = canTrade();
      const pending = pendingReturnIssue(snapshot.pendingReturn);
      text(supplyStatus, trading ? pending ? '未受領品をすべて受け取るまで購入できません。倉庫の遺宝・鉱石の売却と、鞄・倉庫の移動で空きを作れます。' : '取引できます。購入後は倉庫から鞄へ移して持ち出してください。' : actor.ready ? '準備完了中です。取引するには準備を解除してください。' : '取引は遠征終了後、補給所へ戻ってから行えます。');
      for (const [kind, control] of supplyControls) {
        const candidate: Item = { id: 'supply-capacity-preview', kind, quality: 0, count: 1, x: 0, y: 0, rotated: false, found: false };
        const capacity = place([...snapshot.stash], candidate, STASH_HEIGHT);
        const stock = snapshot.shop[kind];
        const reason = !trading ? '取引できるのは補給所の準備前のみ' : pending ? '未受領品をすべて受け取ってください' : !stock ? '売り切れ · 次の遠征開始時に補充' : snapshot.gold < SUPPLIES[kind].price ? '金貨が足りません' : !capacity ? '倉庫に空きがありません' : '届け先：倉庫 · 1個';
        control.buy.disabled = !trading || !!pending || !stock || snapshot.gold < SUPPLIES[kind].price || !capacity;
        text(control.stock, `共有在庫 ${stock} / ${SUPPLIES[kind].stock}`);
        text(control.reason, reason);
      }
      const value = item && selected?.source === 'stash' ? saleValue(item) : 0;
      sellSelected.disabled = !trading || !value || snapshot.gold + value > 1e9;
      text(sellSelected, value && item ? `${ITEMS[item.kind].name}×${item.count}を売却 · +${value}金貨` : '選択した倉庫の品を売却');
      const receipts = snapshot.trades.slice(-6);
      noTrades.hidden = receipts.length > 0;
      trades.hidden = !receipts.length;
      trades.replaceChildren(...receipts.map(receipt => element('li', '', receipt)));
      text(inventoryWarning, snapshot.phase === 'raid' ? '鞄を開いている間は操作が止まります。周囲の敵と制限時間は止まりません。倉庫への移動は補給所のみです。' : actor.ready ? '準備完了中です。倉庫と移すには先に準備を解除してください。' : '死亡すると携行品を失います。持ち帰った品はこの部屋・このブラウザの倉庫に保管されます。');
    }
    renderLoot(actor);
  }
  function reachable(actor: Player, position: Player['position'], doorId?: string) {
    return !!snapshot && distance(actor.position, position) <= 2.2 && !wallRay(
      { ...actor.position, y: 1.3 }, { ...position, y: 1.3 }, snapshot.seed,
      doorId ? snapshot.doors.filter(door => door.id !== doorId) : snapshot.doors,
    );
  }
  function renderLoot(actor: Player) {
    if (!snapshot) return;
    const containers = alive() ? snapshot.containers.filter(container => container.opened && reachable(actor, container.position)) : [];
    const signature = JSON.stringify(containers.map(container => [container.id, container.name, container.items]));
    lootSection.hidden = snapshot.phase !== 'raid' || actor.status !== 'alive';
    if (signature === lootSignature) return;
    lootSignature = signature;
    lootContent.replaceChildren();
    if (!containers.length) { lootContent.append(element('p', 'dungeon-fine-print', '開いた箱や遺品の近くで戦利品を確認できます。')); return; }
    for (const container of containers) {
      const box = element('div', 'dungeon-loot-box');
      box.append(element('strong', '', container.name));
      if (!container.items.length) box.append(element('span', 'dungeon-fine-print', '空です'));
      for (const item of container.items) {
        const pick = element('button', 'dungeon-button dungeon-loot-item');
        pick.type = 'button';
        pick.dataset.lootTarget = container.id;
        pick.dataset.lootItem = item.id;
        pick.textContent = `${ITEMS[item.kind].name} ×${item.count} を拾う`;
        box.append(pick);
      }
      lootContent.append(box);
    }
  }
  listen(lootContent, 'click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-loot-item]') : null;
    const actor = player();
    if (!target || !actor || !snapshot || !alive()) return;
    const container = snapshot.containers.find(box => box.id === target.dataset.lootTarget);
    if (!container?.opened || !reachable(actor, container.position) || !container.items.some(item => item.id === target.dataset.lootItem)) return;
    callbacks.action({ kind: 'loot', target: container.id, item: target.dataset.lootItem! });
  });
  function nearbyTargets(actor: Player): NearbyTarget[] {
    if (!snapshot || !alive()) return [];
    const targets: Array<NearbyTarget & { range: number }> = [];
    for (const door of snapshot.doors) if (reachable(actor, door.position, door.id)) {
      targets.push({ id: door.id, title: '石廊の扉', description: door.open ? '扉を閉める' : '扉を開く', disabled: false, opened: false, range: distance(actor.position, door.position) });
    }
    for (const box of snapshot.containers) if (reachable(actor, box.position)) {
      targets.push({ id: box.id, title: box.name, description: box.opened ? '戦利品を見る' : box.locked ? '鍵で調べる' : '調べる · 1.5秒', disabled: false, opened: box.opened, range: distance(actor.position, box.position) });
    }
    for (const exit of snapshot.exits) if (reachable(actor, exit.position)) {
      const locked = snapshot.elapsed < exit.opensAt;
      targets.push({ id: exit.id, title: '帰還の光', description: !exit.remaining ? '使用済み' : locked ? `開くまで ${timeLabel(exit.opensAt - snapshot.elapsed)}` : `抽出 · 4秒 / 残り${exit.remaining}人`, disabled: !exit.remaining || locked, opened: false, range: distance(actor.position, exit.position) });
    }
    return targets.sort((a, b) => a.range - b.range).slice(0, 3).map(({ range: _, ...target }) => target);
  }
  listen(nearbyPanel, 'click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-target]') : null;
    const actor = player();
    if (!target || !actor) return;
    const current = nearbyTargets(actor).find(value => value.id === target.dataset.target);
    if (!current || current.disabled) return;
    if (current.opened) changeInventory(true, true);
    else callbacks.action({ kind: 'interact', target: current.id });
  });
  function renderHUD(actor: Player) {
    if (!snapshot) return;
    text(playerName, `${actor.name} · ${CLASSES[actor.classId].name}`);
    text(hpText, `${Math.ceil(actor.hp)} / ${actor.maxHp}`);
    healthTrack.setAttribute('aria-valuemax', String(actor.maxHp));
    healthTrack.setAttribute('aria-valuenow', String(Math.ceil(actor.hp)));
    hpBar.style.width = `${Math.max(0, actor.hp / actor.maxHp * 100)}%`;
    recoverableBar.style.width = `${Math.max(0, actor.recoverable / actor.maxHp * 100)}%`;
    guardBar.style.width = `${Math.max(0, Math.min(1, actor.guard)) * 100}%`;
    const hasShield = actor.bag.some(item => item.kind === 'shield');
    guardLabel.hidden = guardTrack.hidden = !hasShield;
    actionButtons.get('block')!.hidden = !hasShield;
    text(resourceText, `${ITEMS[actor.weapon].name} · 薬 ${actor.bag.filter(item => item.kind === 'potion' || item.kind === 'bandage').reduce((sum, item) => sum + item.count, 0)}${actor.weapon === 'bow' ? ` · 矢 ${actor.arrows}` : ''}${CLASSES[actor.classId].spells ? ` · 術 ${actor.spells}` : ''}`);
    text(timer, timeLabel(RAID_SECONDS - snapshot.elapsed));
    timer.classList.toggle('dungeon-timer-urgent', RAID_SECONDS - snapshot.elapsed <= 60);
    text(aliveCount, `生存 ${snapshot.actors.filter(value => value.status === 'alive').length} / ${snapshot.actors.length}人`);
    interactionProgress.hidden = !actor.interaction;
    if (actor.interaction) {
      const extracting = snapshot.exits.some(exit => exit.id === actor.interaction);
      const duration = extracting ? 4 : 1.5;
      interactionTrack.max = duration;
      interactionTrack.value = actor.extract;
      text(interactionText, `${extracting ? '抽出中' : '調査中'} ${Math.min(duration, actor.extract).toFixed(1)} / ${duration}秒 · 静止を維持`);
    }
    const targets = nearbyTargets(actor);
    const nextTargets = JSON.stringify(targets);
    if (nextTargets !== targetSignature) {
      targetSignature = nextTargets;
      nearbyPanel.replaceChildren();
      for (const target of targets) {
        const row = element('div', 'dungeon-nearby-target');
        const control = element('button', 'dungeon-button');
        control.type = 'button';
        control.dataset.target = target.id;
        control.disabled = target.disabled;
        control.textContent = target.description;
        row.append(element('span', '', target.title), control);
        nearbyPanel.append(row);
      }
    }
    const events = snapshot.events.slice(-3);
    if (eventLog.dataset.events !== JSON.stringify(events)) {
      eventLog.dataset.events = JSON.stringify(events);
      eventLog.replaceChildren(...events.map(value => element('li', '', value)));
    }
    const cast = actionButtons.get('cast') as HTMLButtonElement;
    const shoot = actionButtons.get('shoot') as HTMLButtonElement;
    cast.hidden = CLASSES[actor.classId].spells === 0;
    shoot.hidden = actor.weapon !== 'bow';
    cast.disabled = actor.spells <= 0;
    shoot.disabled = actor.weapon !== 'bow' || actor.arrows <= 0;
  }
  function update(next: Snapshot | null) {
    if (disposed) return;
    damageFlash = receivedDamage(snapshot, next) > 0 ? .65 : next?.raid === snapshot?.raid ? damageFlash : 0;
    snapshot = next;
    const pendingHadFocus = document.activeElement instanceof HTMLElement && pendingPanel.root.contains(document.activeElement);
    pendingPanel.update(next);
    questPanel.update(next);
    if (pendingHadFocus && pendingPanel.root.hidden && inventoryOpen) closeInventory.focus({ preventScroll: true });
    const actor = player();
    const inRaid = alive();
    const awaitingRaid = !!actor && snapshot?.phase === 'raid' && actor.status === 'lobby';
    const showingResult = !!actor && (actor.status === 'dead' || actor.status === 'extracted' || awaitingRaid);
    lobby.hidden = !!actor && (inRaid || showingResult || snapshot?.phase === 'raid');
    entry.hidden = !!actor;
    preparation.hidden = !actor;
    hud.hidden = !inRaid;
    gameplayControls.hidden = !inRaid || inventoryOpen;
    outcome.hidden = !showingResult;
    bagButton.hidden = !actor;
    leaveButton.hidden = !room && !actor;
    reconnectButton.hidden = !room;
    if (!actor || !snapshot) {
      if (inventoryOpen) changeInventory(false, true);
      return;
    }
    for (const [id, option] of classButtons) {
      option.disabled = actor.ready || snapshot.phase === 'raid';
      option.setAttribute('aria-pressed', String(actor.classId === id));
    }
    text(readyButton, actor.ready ? '準備を解除' : '準備完了にする');
    readyButton.setAttribute('aria-pressed', String(actor.ready));
    const pending = pendingReturnIssue(snapshot.pendingReturn);
    pendingSummary.hidden = !pending;
    text(pendingSummaryText, pending ?? '');
    text(pendingOpen, `未受領品を受け取る · ${snapshot.pendingReturn?.length ?? 0}品`);
    const issue = preparationIssue(actor.bag);
    readyButton.disabled = snapshot.phase === 'raid' || actor.status !== 'lobby' || (!actor.ready && (!!issue || !!pending));
    text(preparationLoadout, loadoutLabel(actor));
    preparationLoadout.classList.toggle('dungeon-loadout-issue', !!issue);
    const connected = snapshot.actors.filter(value => value.connected);
    startButton.disabled = !!pending || snapshot.phase === 'raid' || !connected.length || connected.some(value => !value.ready || value.status !== 'lobby' || !!preparationIssue(value.bag));
    text(startHint, pending ?? issue ?? (connected.some(value => !!preparationIssue(value.bag)) ? '武器のない携行品があります。該当する探索者は準備を解除して装備を確認してください。' : '接続中の全員が準備完了になると開始できます。1人でも出発できます。'));
    const playersSignature = JSON.stringify(snapshot.actors.map(value => [value.id, value.name, value.classId, value.ready, value.connected]));
    if (playersSignature !== participantsSignature) {
      participantsSignature = playersSignature;
      participants.replaceChildren(...snapshot.actors.map(value => {
        const row = element('li');
        row.append(element('span', '', `${value.name}${value.id === snapshot?.you ? '（あなた）' : ''} · ${CLASSES[value.classId].name}`));
        row.append(element('strong', value.ready ? 'dungeon-ready' : '', !value.connected ? '切断中' : value.ready ? '準備完了' : '準備中'));
        return row;
      }));
    }
    if (inRaid) renderHUD(actor);
    if (showingResult) {
      const extracted = actor.status === 'extracted';
      text(resultEyebrow, awaitingRaid ? 'EXPEDITION IN PROGRESS' : extracted ? 'EXTRACTION COMPLETE' : 'EXPEDITION LOST');
      text(resultTitle, awaitingRaid ? '遠征の終了を待っています' : extracted ? '帰還の灯は消えなかった' : '回廊に倒れる');
      text(resultText, awaitingRaid ? '進行中の遠征には途中入場できません。次の出発から参加できます。' : snapshot.result || (extracted ? '戦利品を倉庫へ持ち帰りました。' : '携行品はその場に残されました。'));
      text(resultStats, `討伐 ${actor.kills} · 経験 ${actor.xp} · 倉庫 ${snapshot.stash.length}品${pending ? ` · 未受領 ${snapshot.pendingReturn!.length}品（安全に保管済み）` : ''}`);
      text(resultInventory, pending ? `未受領品 ${snapshot.pendingReturn!.length}品を確認` : '倉庫を確認');
      const waiting = snapshot.phase === 'raid';
      returnButton.disabled = waiting;
      text(waitingText, waiting ? 'ほかの探索者の結果を待っています。遠征が終わると補給所へ戻れます。' : pending ? '倉庫に入らなかった品も帰還済みです。補給所へ戻り、未受領品を鞄か倉庫へすべて受け取ってから次の探索へ進んでください。' : '遠征が終わりました。補給して次の探索へ進めます。');
      resultCard.classList.toggle('dungeon-result-success', extracted);
    }
    if (inventoryOpen) renderInventory();
  }

  return {
    canvas, movePad, lookPad, actionButtons, update,
    renderFeedback(dt: number, look: Input) {
      if (disposed) return;
      damageFlash = Math.max(0, damageFlash - Math.max(0, dt) * 1.8);
      damageOverlay.style.opacity = String(damageFlash);
      const actor = player();
      const target = snapshot && alive() && !inventoryOpen ? focusedOpponent(snapshot, look) : null;
      opponent.hidden = !target;
      if (target) {
        const readout = combatReadout(target);
        text(opponentName, target.name);
        opponentHealth.max = target.maxHp;
        opponentHealth.value = target.hp;
        text(opponentPhase, readout.phase === 'recover' ? '隙あり' : readout.label);
        opponent.dataset.phase = readout.phase;
      }
      combatState.hidden = !actor || !alive() || inventoryOpen || !!actor.interaction;
      if (actor) {
        const readout = combatReadout(actor, true);
        text(combatLabel, readout.label);
        combatProgress.value = readout.progress;
        combatProgress.hidden = actor.phase === 'idle';
        combatState.dataset.phase = readout.phase;
      }
    },
    setConnection(state: string) {
      if (disposed) return;
      const label: Record<string, string> = { connecting: '接続中…', connected: '接続済み', disconnected: '切断中', offline: 'オフライン', reconnecting: '再接続中…', error: '接続エラー' };
      questPanel.setConnected(state === 'connected' || state === '接続済み');
      text(connection, label[state] ?? state);
      connection.dataset.state = state === '接続済み' ? 'connected' : state.includes('切断') || state.includes('拒否') ? 'disconnected' : state;
    },
    notice,
    setGraphicsError(message: string) {
      if (disposed) return;
      text(graphicsErrorText, message);
      graphicsError.hidden = !message;
      graphicsIndicator.hidden = !message;
    },
    setInvite(url: string) {
      if (disposed) return;
      invite = url;
      invitationInput.value = invite;
      copyButton.disabled = !invite;
    },
    setRoom(value: string) {
      if (disposed) return;
      room = value;
      text(roomLabel, value ? `部屋 ${value.slice(0, 6)}` : '');
      roomLabel.title = value ? 'プライベート招待部屋' : '';
      leaveButton.hidden = !value;
      reconnectButton.hidden = !value;
      if (value) roomInput.value = value;
    },
    setInventory(open: boolean) { changeInventory(open, false); },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.abort();
      if (noticeTimer !== null) clearTimeout(noticeTimer);
      shell.remove();
      if (!hadRootClass) root.classList.remove('dungeon-app');
    },
  };
}
