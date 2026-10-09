import { ITEMS } from './catalog';
import { BAG_HEIGHT, dimensions, place, STASH_HEIGHT } from './inventory';
import type { Action, Item, Snapshot } from './types';

/** Missing batches are old, compatible snapshots. Only the viewer's top-level batch is used. */
export function pendingReturnIssue(items: readonly Item[] = []): string | null {
  return items.length ? `未受領品が${items.length}品あります。鞄か倉庫へすべて受け取ると、準備完了・遠征開始・補給品の購入ができます。` : null;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', value = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}
function text(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

/** Server snapshots own every item. Selection is the only locally mutable state. */
export function createPendingReturnPanel(action: (action: Action) => void, signal: AbortSignal) {
  const root = element('section', 'dungeon-pending-return');
  root.dataset.testid = 'dungeon-pending-return';
  root.hidden = true;
  root.setAttribute('aria-labelledby', 'dungeon-pending-title');
  const heading = element('div', 'dungeon-pending-heading');
  const title = element('h3', '', '自分の未受領品');
  title.id = 'dungeon-pending-title';
  const count = element('strong');
  count.dataset.testid = 'dungeon-pending-count';
  count.setAttribute('aria-live', 'polite');
  heading.append(title, count);
  const description = element('p', 'dungeon-fine-print', '倉庫に入らなかった帰還品を、この部屋・このブラウザの探索者専用に保管しています。保管は鞄10×5マスの1回分のみ。すべて受け取るまで次の出発・補給品の購入はできません。倉庫の遺宝・鉱石を売るか、鞄と移して空きを作れます。');
  const status = element('p', 'dungeon-pending-status');
  status.dataset.testid = 'dungeon-pending-status';
  status.setAttribute('aria-live', 'polite');
  const list = element('div', 'dungeon-pending-list');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', '受け取る帰還品を選ぶ');
  list.tabIndex = 0;
  const selection = element('p', 'dungeon-pending-selection');
  selection.dataset.testid = 'dungeon-pending-selection';
  const destinations = element('div', 'dungeon-pending-destinations');
  const controls = new Map<'bag' | 'stash', { button: HTMLButtonElement; reason: HTMLElement }>();
  let current: Snapshot | null = null;
  let selected: string | null = null;
  let owner: string | null = null;
  const rows = new Map<string, HTMLButtonElement>();

  for (const to of ['stash', 'bag'] as const) {
    const cell = element('div');
    const button = element('button', 'dungeon-button', `${to === 'stash' ? '倉庫' : '鞄'}へ受け取る`);
    button.type = 'button';
    button.dataset.testid = `dungeon-claim-${to}`;
    const reason = element('p', 'dungeon-fine-print');
    reason.id = `dungeon-claim-${to}-reason`;
    reason.dataset.testid = `dungeon-claim-${to}-reason`;
    button.setAttribute('aria-describedby', reason.id);
    button.addEventListener('click', () => {
      // Re-evaluate current state even if a stale pointer click survives a snapshot.
      const item = current?.pendingReturn?.find(value => value.id === selected);
      if (!signal.aborted && item && !button.disabled && claimReason(to, item) === null) {
        action({ kind: 'claim-return', item: item.id, to });
      }
    }, { signal });
    controls.set(to, { button, reason });
    cell.append(button, reason);
    destinations.append(cell);
  }
  root.append(heading, description, status, list, selection, destinations);
  list.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-return-item]') : null;
    if (!target || !list.contains(target) || !current?.pendingReturn?.some(item => item.id === target.dataset.returnItem)) return;
    selected = target.dataset.returnItem!;
    renderSelection();
  }, { signal });

  function claimReason(to: 'bag' | 'stash', item: Item): string | null {
    const actor = current?.actors.find(value => value.id === current?.you);
    if (!current || !actor || current.phase === 'raid' || actor.status !== 'lobby') return '受け取りは遠征終了後、補給所へ戻ってから行えます。';
    if (actor.ready) return '先に準備完了を解除してください。';
    const destination = to === 'stash' ? current.stash : actor.bag;
    if (destination.some(value => value.id === item.id) || !place([...destination], { ...item }, to === 'stash' ? STASH_HEIGHT : BAG_HEIGHT)) {
      return `${to === 'stash' ? '倉庫' : '鞄'}にこの品が入る空きがありません。品物を移すか、倉庫の遺宝・鉱石を売って空きを作ってください。`;
    }
    return null;
  }
  function renderSelection() {
    const item = current?.pendingReturn?.find(value => value.id === selected);
    for (const [id, row] of rows) row.setAttribute('aria-pressed', String(id === selected));
    text(selection, item ? `選択中：${ITEMS[item.kind].name} ×${item.count} · 品質${item.quality}` : '受け取る品物を選んでください。');
    for (const [to, control] of controls) {
      const reason = item ? claimReason(to, item) : '受け取る品物を選んでください。';
      control.button.disabled = reason !== null;
      text(control.reason, reason ?? `${to === 'stash' ? '倉庫' : '鞄'}の空きに配置します。`);
    }
  }
  function update(snapshot: Snapshot | null) {
    if (signal.aborted) return;
    current = snapshot;
    const actor = snapshot?.actors.find(value => value.id === snapshot.you);
    // Clear selection and stale private rows on leave, reconnect to another owner, or legacy-empty snapshots.
    if (owner !== (actor?.id ?? null)) selected = null;
    owner = actor?.id ?? null;
    const items = actor ? snapshot?.pendingReturn ?? [] : [];
    root.hidden = !items.length;
    text(count, `${items.length}品 · 帰還1回分`);
    text(status, snapshot?.phase === 'raid' || actor?.status !== 'lobby' ? '安全に帰還済みです。遠征終了後に補給所へ戻り、受け取ってください。' : actor.ready ? '準備を解除してから受け取ってください。' : '品物を選び、受け取り先を選んでください。');
    const ids = new Set(items.map(item => item.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    if (!selected || !ids.has(selected)) selected = items[0]?.id ?? null;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      let row = rows.get(item.id);
      if (!row) {
        row = element('button', 'dungeon-button dungeon-pending-item');
        row.type = 'button';
        row.dataset.returnItem = item.id;
        rows.set(item.id, row);
      }
      const { w, h } = dimensions(item);
      text(row, `${ITEMS[item.kind].name} ×${item.count} · 品質${item.quality} · ${w}×${h}マス`);
      // Never detach unchanged controls during the server's repeated snapshots.
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    }
    renderSelection();
  }
  return { root, update };
}
