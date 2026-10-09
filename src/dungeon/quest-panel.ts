import { ITEMS } from './catalog';
import { QUEST_IDS, QUESTS, questDeliveryCount, questPrerequisiteMet } from './quests';
import type { Action, QuestId, Snapshot } from './types';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', value = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}
function text(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

/** The journal and inventory remain server-owned; only the explicit stack choice is local. */
export function createQuestPanel(action: (action: Action) => boolean | void, signal: AbortSignal) {
  const root = element('section', 'dungeon-quest-panel');
  root.dataset.testid = 'dungeon-quest-panel';
  root.setAttribute('aria-labelledby', 'dungeon-quest-title');
  root.hidden = true;
  const heading = element('div', 'dungeon-quest-heading');
  const title = element('h3', '', '補給所の依頼'); title.id = 'dungeon-quest-title';
  const gold = element('strong', 'dungeon-gold'); gold.dataset.testid = 'dungeon-quest-gold';
  heading.append(title, gold);
  root.append(heading, element('p', 'dungeon-fine-print', '2件の入門依頼。受注してから進め、達成後は補給所で報酬を受け取ってください。依頼・金貨はこの部屋の探索者専用です。'));
  const raid = element('div', 'dungeon-quest-raid');
  raid.dataset.testid = 'dungeon-quest-raid'; raid.hidden = true;
  raid.setAttribute('aria-label', '受注中の依頼');
  const summary = element('p', 'dungeon-quest-summary');
  summary.dataset.testid = 'dungeon-quest-summary';
  let connected = false;
  let current: Snapshot | null = null;
  let owner: string | null = null;
  let selected: string | null = null;
  let pending: { owner: string; lastAction: number } | null = null;
  const cards = new Map<QuestId, { status: HTMLElement; progress: HTMLElement; reason: HTMLElement; accept: HTMLButtonElement; claim: HTMLButtonElement }>();
  const items = element('div', 'dungeon-quest-items');
  items.dataset.testid = 'dungeon-quest-item-ore-delivery';
  items.setAttribute('role', 'group'); items.setAttribute('aria-label', '納品する倉庫の鉱石を選ぶ');
  items.tabIndex = 0;
  const rows = new Map<string, HTMLButtonElement>();
  const selection = element('p', 'dungeon-quest-selection'); selection.dataset.testid = 'dungeon-quest-selection-ore-delivery';
  const delivery = element('button', 'dungeon-button', '選んだ鉱石を納品');
  delivery.type = 'button'; delivery.dataset.testid = 'dungeon-quest-deliver-ore-delivery';
  delivery.setAttribute('aria-describedby', 'dungeon-quest-selection-ore-delivery');
  selection.id = 'dungeon-quest-selection-ore-delivery';

  function stateReason(): string | null {
    const actor = current?.actors.find(value => value.id === current?.you);
    if (!current || !actor || current.phase === 'raid' || actor.status !== 'lobby') return '受注・納品・報酬受取は補給所へ戻ってから行えます。';
    if (!connected) return '接続が完了してから依頼を操作してください。';
    if (actor.ready) return '操作するには先に準備完了を解除してください。';
    if (pending) return 'サーバーに確認中です…';
    return null;
  }
  function send(command: Action) {
    if (!current || signal.aborted || stateReason()) return;
    pending = { owner: current.you, lastAction: current.lastAction };
    render();
    if (action(command) === false) { pending = null; connected = false; render(); }
  }
  for (const id of QUEST_IDS) {
    const definition = QUESTS[id];
    const card = element('article', 'dungeon-quest-card'); card.dataset.testid = `dungeon-quest-${id}`;
    const top = element('div', 'dungeon-quest-heading');
    const status = element('span', 'dungeon-quest-status'); status.dataset.testid = `dungeon-quest-status-${id}`;
    status.setAttribute('aria-live', 'polite');
    top.append(element('strong', '', definition.name), status);
    const progress = element('p', 'dungeon-quest-progress'); progress.dataset.testid = `dungeon-quest-progress-${id}`;
    const reward = element('p', 'dungeon-quest-reward', `報酬：${definition.reward}金貨 · 1回限り`);
    const prerequisite = element('p', 'dungeon-fine-print', definition.prerequisite ? `前提：「${QUESTS[definition.prerequisite].name}」の報酬を受取済み` : '前提なし · 受注後の生還が対象です');
    const reason = element('p', 'dungeon-fine-print'); reason.id = `dungeon-quest-reason-${id}`; reason.dataset.testid = reason.id;
    const controls = element('div', 'dungeon-quest-controls');
    const accept = element('button', 'dungeon-button', '依頼を受注'); accept.type = 'button'; accept.dataset.testid = `dungeon-quest-accept-${id}`;
    const claim = element('button', 'dungeon-button dungeon-button-primary', `${definition.reward}金貨を受け取る`); claim.type = 'button'; claim.dataset.testid = `dungeon-quest-claim-${id}`;
    accept.setAttribute('aria-describedby', reason.id); claim.setAttribute('aria-describedby', reason.id);
    accept.addEventListener('click', () => {
      if (!accept.disabled && !current?.quests?.some(entry => entry.id === id) && questPrerequisiteMet(current?.quests, id)) send({ kind: 'accept-quest', quest: id });
    }, { signal });
    claim.addEventListener('click', () => {
      const entry = current?.quests?.find(value => value.id === id);
      if (!claim.disabled && entry && !entry.claimed && entry.progress === definition.goal) send({ kind: 'claim-quest', quest: id });
    }, { signal });
    cards.set(id, { status, progress, reason, accept, claim });
    controls.append(accept, claim);
    card.append(top, progress, reward, prerequisite);
    if (id === 'ore-delivery') {
      card.append(element('p', 'dungeon-fine-print', '倉庫にある帰還品の鉱石だけを納品できます。鞄・未受領品の鉱石は、先に倉庫へ移してください。選んだ束から必要な数だけ消費し、余りは残ります。'), items, selection, delivery);
    }
    card.append(controls, reason); root.append(card);
  }
  items.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-quest-item]') : null;
    if (!target || target.disabled || !items.contains(target) || signal.aborted || stateReason()) return;
    const entry = current?.quests?.find(value => value.id === 'ore-delivery');
    const item = current?.stash.find(value => value.id === target.dataset.questItem);
    if (!item || !questDeliveryCount(entry, item)) return;
    selected = item.id; render();
  }, { signal });
  delivery.addEventListener('click', () => {
    const entry = current?.quests?.find(value => value.id === 'ore-delivery');
    const item = current?.stash.find(value => value.id === selected);
    if (!delivery.disabled && item && questDeliveryCount(entry, item)) send({ kind: 'deliver-quest', quest: 'ore-delivery', item: item.id });
  }, { signal });

  function render() {
    const actor = current?.actors.find(value => value.id === current?.you);
    const journal = actor ? current?.quests ?? [] : [];
    root.hidden = !actor;
    text(gold, `${actor ? current?.gold ?? 0 : 0}金貨`);
    const blocked = stateReason();
    for (const id of QUEST_IDS) {
      const definition = QUESTS[id], entry = journal.find(value => value.id === id), card = cards.get(id)!;
      const complete = !!entry && entry.progress === definition.goal;
      text(card.status, entry?.claimed ? '受取済み' : complete ? '達成・報酬未受取' : entry ? '進行中' : '受注前');
      text(card.progress, `${definition.objective} · ${entry?.progress ?? 0}/${definition.goal}`);
      const prerequisiteMet = questPrerequisiteMet(journal, id);
      const cap = (current?.gold ?? 0) + definition.reward > 1e9;
      card.accept.disabled = !!blocked || !!entry || !prerequisiteMet;
      card.claim.disabled = !!blocked || !complete || !!entry?.claimed || cap;
      text(card.accept, entry ? '受注済み' : '依頼を受注');
      text(card.claim, entry?.claimed ? '報酬受取済み' : `${definition.reward}金貨を受け取る`);
      text(card.reason, blocked ?? (entry?.claimed ? 'この依頼の報酬は受取済みです。' : !prerequisiteMet ? '先に「初めての生還」の報酬を受け取ってください。' : complete ? cap ? '所持金の上限を超えるため、先に金貨を使用してください。' : '達成しました。報酬受取ボタンで金貨を受け取れます。' : entry ? id === 'first-return' ? '受注後に遠征で生きて抽出すると達成します。' : '倉庫の鉱石の束を選び、納品してください。' : '受注ボタンを押すと進行を記録します。'));
    }
    const ore = journal.find(value => value.id === 'ore-delivery');
    const eligible = actor ? current?.stash.filter(item => questDeliveryCount(ore, item) > 0) ?? [] : [];
    const ids = new Set(eligible.map(item => item.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    if (selected && !ids.has(selected)) selected = null;
    for (let index = 0; index < eligible.length; index++) {
      const item = eligible[index];
      let row = rows.get(item.id);
      if (!row) { row = element('button', 'dungeon-button dungeon-quest-item'); row.type = 'button'; row.dataset.questItem = item.id; rows.set(item.id, row); }
      text(row, `${ITEMS[item.kind].name} ×${item.count} · 品質${item.quality} · 納品${questDeliveryCount(ore, item)}個`);
      row.disabled = !!blocked; row.setAttribute('aria-pressed', String(selected === item.id));
      if (items.children[index] !== row) items.insertBefore(row, items.children[index] ?? null);
    }
    const chosen = eligible.find(item => item.id === selected);
    delivery.disabled = !!blocked || !chosen;
    text(delivery, chosen ? `選んだ鉱石を${questDeliveryCount(ore, chosen)}個納品` : '選んだ鉱石を納品');
    text(selection, chosen ? `選択中：${ITEMS[chosen.kind].name} ×${chosen.count} · ${questDeliveryCount(ore, chosen)}個を納品、残り${chosen.count - questDeliveryCount(ore, chosen)}個` : !ore ? '受注後に、納品する倉庫の鉱石を選んでください。' : ore.claimed || ore.progress === QUESTS['ore-delivery'].goal ? '必要な鉱石の納品は完了しています。' : eligible.length ? `あと${QUESTS['ore-delivery'].goal - ore.progress}個。納品する倉庫の鉱石の束を選んでください。` : '納品できる倉庫の鉱石がありません。遠征で拾って持ち帰り、倉庫へ移してください。');
    const active = journal.filter(entry => !entry.claimed);
    text(summary, active.length ? active.map(entry => `${QUESTS[entry.id].name} ${entry.progress}/${QUESTS[entry.id].goal}`).join(' · ') : journal.length === QUEST_IDS.length && journal.every(entry => entry.claimed) ? '2件の依頼は報酬受取済みです。' : '依頼を受注して、帰還と鉱石の納品で金貨を獲得。');
    raid.hidden = !actor || current?.phase !== 'raid' || !active.length;
    text(raid, active.map(entry => `${QUESTS[entry.id].name} ${entry.progress}/${QUESTS[entry.id].goal} · ${entry.id === 'first-return' ? '生きて抽出' : '帰還後に倉庫から納品'}`).join('\n'));
  }
  function update(snapshot: Snapshot | null) {
    if (signal.aborted) return;
    const nextOwner = snapshot?.you ?? null;
    if (nextOwner !== owner) { selected = null; pending = null; }
    if (pending && (!snapshot || pending.owner !== snapshot.you || snapshot.lastAction > pending.lastAction)) pending = null;
    owner = nextOwner; current = snapshot; render();
  }
  function setConnected(value: boolean) {
    if (signal.aborted) return;
    if (!value) pending = null;
    connected = value; render();
  }
  return { root, raid, summary, update, setConnected };
}
