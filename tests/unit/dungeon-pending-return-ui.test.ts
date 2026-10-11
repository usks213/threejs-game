import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMaxListeners } from 'node:events';
import { createPendingReturnPanel } from '../../src/dungeon/pending-return-panel';
import { createDungeonUI } from '../../src/dungeon/ui';
import { DungeonSimulation } from '../../src/dungeon/simulation';
import type { Item, Snapshot } from '../../src/dungeon/types';

/** Minimal DOM keeps these component regressions in the repository's Node-only unit suite. */
class Node extends EventTarget {
  children: Node[] = [];
  parentElement: Node | null = null;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  className = ''; id = ''; type = ''; value = ''; title = ''; hidden = false; disabled = false;
  tabIndex = -1; scrollTop = 0; moves = 0; private valueText = '';
  constructor(readonly tag: string) { super(); }
  get textContent(): string { return this.valueText + this.children.map(child => child.textContent).join(''); }
  set textContent(value: string) { this.valueText = value; this.replaceChildren(); }
  get isConnected(): boolean { return !!this.parentElement || this.tag === 'root'; }
  classList = {
    contains: (value: string) => this.className.split(' ').includes(value),
    add: (value: string) => { if (!this.classList.contains(value)) this.className = `${this.className} ${value}`.trim(); },
    remove: (value: string) => { this.className = this.className.split(' ').filter(name => name !== value).join(' '); },
    toggle: (value: string, active: boolean) => { if (active) this.classList.add(value); else this.classList.remove(value); },
  };
  append(...children: Node[]) { for (const child of children) this.insertBefore(child, null); }
  insertBefore(child: Node, before: Node | null) {
    child.remove();
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, child); child.parentElement = this; child.moves++;
  }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  replaceChildren(...children: Node[]) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...children); }
  contains(child: Node): boolean { return child === this || this.children.some(node => node.contains(child)); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  matches(selector: string): boolean {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector === '[hidden]') return this.hidden;
    if (selector === '[data-return-item]') return !!this.dataset.returnItem;
    return selector === this.tag;
  }
  closest(selector: string): Node | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector: string): Node[] { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  focus() { documentStub.activeElement = this; }
}
const documentStub = { activeElement: null as Node | null, createElement: (tag: string) => new Node(tag) };
const find = (node: Node, match: (candidate: Node) => boolean): Node | undefined => match(node) ? node : node.children.map(child => find(child, match)).find(Boolean);
const get = (root: Node, testid: string) => find(root, node => node.dataset.testid === testid)!;
const click = (node: Node) => {
  const event = new Event('click');
  Object.defineProperty(event, 'target', { value: node });
  for (let next: Node | null = node; next; next = next.parentElement) next.dispatchEvent(event);
};
function dom() {
  documentStub.activeElement = null;
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('window', { location: { href: 'https://example.test/?mode=dungeon' } });
  vi.stubGlobal('Element', Node); vi.stubGlobal('HTMLElement', Node);
  const BaseAbortController = globalThis.AbortController;
  vi.stubGlobal('AbortController', class extends BaseAbortController { constructor() { super(); setMaxListeners(0, this.signal); } });
}
function snapshot(): Snapshot {
  const sim = new DungeonSimulation();
  const own = sim.join('a'.repeat(64), 'Owner')!;
  sim.join('b'.repeat(64), 'Other');
  const value = sim.snapshot(own.actor.id);
  value.gold = 100;
  value.pendingReturn = [item('return-a'), item('return-b', 'relic', 1, 0)];
  return value;
}
function item(id: string, kind: Item['kind'] = 'potion', x = 0, y = 0): Item {
  return { id, kind, x, y, count: 1, quality: 0, rotated: false, found: true };
}
function full(height: number): Item[] {
  return Array.from({ length: height * 10 }, (_, index) => item(`full-${height}-${index}`, 'potion', index % 10, Math.floor(index / 10)));
}
function panel() {
  dom();
  const action = vi.fn(), abort = new AbortController();
  const panel = createPendingReturnPanel(action, abort.signal);
  const root = panel.root as unknown as Node;
  const value = snapshot(); panel.update(value);
  return { panel, root, action, abort, value };
}
function ui() {
  dom(); const root = new Node('root'), action = vi.fn();
  const ui = createDungeonUI(root as unknown as HTMLElement, { action, create: vi.fn(), join: vi.fn(), reconnect: vi.fn(), inventory: vi.fn(), leave: vi.fn(), copyInvite: vi.fn() });
  const value = snapshot(); ui.update(value);
  return { ui, root, action, value };
}
afterEach(() => vi.unstubAllGlobals());

describe('bounded private return panel', () => {
  it('retains selected controls, focus and list scroll during repeated snapshots', () => {
    const h = panel();
    const row = find(h.root, node => node.dataset.returnItem === 'return-b')!;
    const list = row.parentElement!; click(row); row.focus(); list.scrollTop = 75;
    const moves = row.moves, claim = get(h.root, 'dungeon-claim-bag');
    for (let index = 0; index < 100; index++) {
      h.panel.update({ ...structuredClone(h.value), tick: index });
      expect(find(h.root, node => node.dataset.returnItem === 'return-b')).toBe(row);
      expect(get(h.root, 'dungeon-claim-bag')).toBe(claim);
      expect(row.moves).toBe(moves); expect(list.scrollTop).toBe(75);
      expect(documentStub.activeElement).toBe(row); expect(row.getAttribute('aria-pressed')).toBe('true');
    }
    click(claim);
    expect(h.action).toHaveBeenCalledExactlyOnceWith({ kind: 'claim-return', item: 'return-b', to: 'bag' });
    expect(h.value.pendingReturn).toHaveLength(2);
    h.abort.abort(); click(claim); expect(h.action).toHaveBeenCalledTimes(1);
  });
  it('explains each full destination, retains selection and unlocks when server frees space', () => {
    const h = panel(), own = h.value.actors.find(actor => actor.id === h.value.you)!;
    own.bag = full(5); h.value.stash = full(10); h.panel.update(h.value);
    const row = find(h.root, node => node.dataset.returnItem === 'return-b')!; click(row);
    const bag = get(h.root, 'dungeon-claim-bag'), stash = get(h.root, 'dungeon-claim-stash');
    expect(bag.disabled).toBe(true); expect(stash.disabled).toBe(true);
    expect(get(h.root, 'dungeon-claim-bag-reason').textContent).toContain('鞄にこの品が入る空きがありません');
    expect(get(h.root, 'dungeon-claim-stash-reason').textContent).toContain('倉庫にこの品が入る空きがありません');
    click(bag); click(stash); expect(h.action).not.toHaveBeenCalled();
    own.bag = []; h.panel.update(h.value);
    expect(row.getAttribute('aria-pressed')).toBe('true'); expect(bag.disabled).toBe(false); expect(stash.disabled).toBe(true);
    click(bag); expect(h.action).toHaveBeenLastCalledWith({ kind: 'claim-return', item: 'return-b', to: 'bag' });
    expect(h.value.pendingReturn).toHaveLength(2);
  });
  it('requires supplier and not-ready state; clears final batch and legacy snapshots', () => {
    const h = panel(), own = h.value.actors.find(actor => actor.id === h.value.you)!;
    own.status = 'extracted'; h.value.phase = 'finished'; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-claim-bag').disabled).toBe(true);
    expect(get(h.root, 'dungeon-claim-bag-reason').textContent).toContain('補給所');
    own.status = 'lobby'; own.ready = true; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-claim-bag-reason').textContent).toContain('準備完了を解除');
    own.ready = false; h.panel.update(h.value); expect(get(h.root, 'dungeon-claim-bag').disabled).toBe(false);
    h.value.pendingReturn = []; h.panel.update(h.value);
    expect(h.root.hidden).toBe(true); expect(find(h.root, node => !!node.dataset.returnItem)).toBeUndefined();
    expect(get(h.root, 'dungeon-claim-bag').disabled).toBe(true);
    delete h.value.pendingReturn; h.panel.update(h.value); expect(h.root.hidden).toBe(true);
    click(get(h.root, 'dungeon-claim-bag')); expect(h.action).not.toHaveBeenCalled();
  });
  it('shows only the top-level owner batch and erases it on leave', () => {
    const h = panel();
    const other = h.value.actors.find(actor => actor.id !== h.value.you)!;
    Object.assign(other, { pendingReturn: [item('other-private')] });
    h.panel.update(h.value);
    expect(find(h.root, node => node.dataset.returnItem === 'other-private')).toBeUndefined();
    h.panel.update(null);
    expect(h.root.hidden).toBe(true); expect(find(h.root, node => !!node.dataset.returnItem)).toBeUndefined();
    click(get(h.root, 'dungeon-claim-stash')); expect(h.action).not.toHaveBeenCalled();
  });
});

describe('return recovery in the actual dungeon UI', () => {
  it('locks ready/start/purchases with reasons while ordinary inventory recovery remains available', () => {
    const h = ui();
    expect(get(h.root, 'dungeon-ready').disabled).toBe(true);
    expect(get(h.root, 'dungeon-start').disabled).toBe(true);
    expect(get(h.root, 'dungeon-start-hint').textContent).toContain('未受領品が2品');
    click(get(h.root, 'dungeon-pending-open'));
    expect(get(h.root, 'dungeon-inventory').hidden).toBe(false);
    expect(get(h.root, 'dungeon-pending-return').hidden).toBe(false);
    expect(get(h.root, 'dungeon-buy-potion').disabled).toBe(true);
    expect(find(h.root, node => node.id === 'dungeon-buy-potion-reason')!.textContent).toContain('未受領品');
    h.value.stash = [item('banked-relic', 'relic')]; h.ui.update(h.value);
    click(find(h.root, node => node.dataset.item === 'banked-relic')!);
    expect(get(h.root, 'dungeon-sell-selected').disabled).toBe(false);
    const transfer = find(h.root, node => node.tag === 'button' && node.textContent === '鞄へ移す')!;
    expect(transfer.disabled).toBe(false); click(transfer);
    expect(h.action).toHaveBeenLastCalledWith({ kind: 'transfer', item: 'banked-relic', to: 'bag' });
    get(h.root, 'dungeon-claim-bag').focus();
    h.value.pendingReturn = []; h.ui.update(h.value);
    expect(documentStub.activeElement?.textContent).toBe('閉じる · I / Esc');
    expect(get(h.root, 'dungeon-pending-return').hidden).toBe(true);
    expect(get(h.root, 'dungeon-pending-summary').hidden).toBe(true);
    expect(get(h.root, 'dungeon-ready').disabled).toBe(false);
    expect(get(h.root, 'dungeon-buy-potion').disabled).toBe(false);
    for (const actor of h.value.actors) actor.ready = true;
    h.ui.update(h.value); expect(get(h.root, 'dungeon-start').disabled).toBe(false);
    h.ui.dispose();
  });
  it('explains safe result retention, requires returning, and accepts missing legacy fields', () => {
    const h = ui(), own = h.value.actors.find(actor => actor.id === h.value.you)!;
    own.status = 'extracted'; h.value.phase = 'finished'; h.ui.update(h.value);
    const result = get(h.root, 'dungeon-result');
    expect(result.textContent).toContain('未受領 2品（安全に保管済み）');
    expect(result.textContent).toContain('補給所へ戻り');
    click(find(result, node => node.tag === 'button' && node.textContent === '未受領品 2品を確認')!);
    expect(get(h.root, 'dungeon-claim-bag').disabled).toBe(true);
    own.status = 'lobby'; delete h.value.pendingReturn; h.ui.update(h.value);
    expect(get(h.root, 'dungeon-ready').disabled).toBe(false);
    expect(get(h.root, 'dungeon-pending-return').hidden).toBe(true);
    h.ui.dispose();
  });
});
