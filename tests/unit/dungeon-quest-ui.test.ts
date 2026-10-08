import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMaxListeners } from 'node:events';
import { createQuestPanel } from '../../src/dungeon/quest-panel';
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
    if (selector === '[data-quest-item]') return !!this.dataset.questItem;
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
function item(id: string, kind: Item['kind'] = 'ore', count = 3, found = true): Item {
  return { id, kind, count, found, quality: 2, x: 0, y: 0, rotated: false };
}
function snapshot(): Snapshot {
  const sim = new DungeonSimulation(), owner = sim.join('a'.repeat(64), 'Owner')!;
  sim.join('b'.repeat(64), 'Other');
  return sim.snapshot(owner.actor.id);
}
function panel() {
  dom(); const action = vi.fn(), abort = new AbortController();
  const panel = createQuestPanel(action, abort.signal), root = panel.root as unknown as Node;
  const value = snapshot(); panel.setConnected(true); panel.update(value);
  return { panel, root, value, action, abort };
}
function acceptOre(value: Snapshot) {
  value.quests = [{ id: 'first-return', progress: 1, claimed: true }, { id: 'ore-delivery', progress: 0, claimed: false }];
}
afterEach(() => vi.unstubAllGlobals());

describe('supplier quest panel', () => {
  it('disables disconnected controls and recovers an unacknowledged request on reconnect', () => {
    const h = panel(), accept = get(h.root, 'dungeon-quest-accept-first-return');
    click(accept); expect(accept.disabled).toBe(true);
    h.panel.setConnected(false); h.panel.update(h.value);
    expect(accept.disabled).toBe(true); click(accept); expect(h.action).toHaveBeenCalledTimes(1);
    h.panel.setConnected(true); h.panel.update(h.value);
    expect(accept.disabled).toBe(false); click(accept); expect(h.action).toHaveBeenCalledTimes(2);
  });
  it('recovers a failed transport send without inventing server progress', () => {
    const h = panel(), accept = get(h.root, 'dungeon-quest-accept-first-return');
    h.action.mockReturnValue(false); click(accept);
    expect(accept.disabled).toBe(true); expect(h.value.quests ?? []).toEqual([]);
    expect(get(h.root, 'dungeon-quest-reason-first-return').textContent).toContain('接続が完了');
    h.panel.setConnected(true); h.panel.update(h.value); expect(accept.disabled).toBe(false);
  });
  it('requires explicit acceptance, locks prerequisites, and waits for server acknowledgement', () => {
    const h = panel(); delete h.value.quests; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-quest-status-first-return').textContent).toBe('受注前');
    expect(get(h.root, 'dungeon-quest-progress-first-return').textContent).toContain('0/1');
    expect(get(h.root, 'dungeon-quest-accept-ore-delivery').disabled).toBe(true);
    expect(get(h.root, 'dungeon-quest-claim-first-return').disabled).toBe(true);
    const accept = get(h.root, 'dungeon-quest-accept-first-return'); click(accept); click(accept);
    expect(h.action).toHaveBeenCalledExactlyOnceWith({ kind: 'accept-quest', quest: 'first-return' });
    expect(accept.disabled).toBe(true); expect(h.value.quests).toBeUndefined();
    h.panel.update({ ...h.value, tick: 10 }); expect(accept.disabled).toBe(true);
    h.value.lastAction++; h.value.quests = [{ id: 'first-return', progress: 0, claimed: false }]; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-quest-status-first-return').textContent).toBe('進行中');
    expect(get(h.root, 'dungeon-quest-claim-first-return').disabled).toBe(true);
    h.value.quests[0].progress = 1; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-quest-status-first-return').textContent).toBe('達成・報酬未受取');
    click(get(h.root, 'dungeon-quest-claim-first-return'));
    expect(h.action).toHaveBeenLastCalledWith({ kind: 'claim-quest', quest: 'first-return' });
    expect(h.value.gold).toBe(0);
    h.value.lastAction++; h.value.gold = 20; h.value.quests[0].claimed = true; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-quest-status-first-return').textContent).toBe('受取済み');
    expect(get(h.root, 'dungeon-quest-claim-first-return').disabled).toBe(true);
    expect(get(h.root, 'dungeon-quest-accept-ore-delivery').disabled).toBe(false);
  });
  it('allows only explicit eligible stash choices and previews exact consumption without mutating inventory', () => {
    const h = panel(); acceptOre(h.value);
    h.value.stash = [item('ore-a'), item('ore-b', 'ore', 1), item('free-ore', 'ore', 2, false), item('relic', 'relic')];
    h.value.pendingReturn = [item('pending-ore')]; h.value.actors[0].bag = [item('bag-ore')];
    h.panel.update(h.value);
    const deliver = get(h.root, 'dungeon-quest-deliver-ore-delivery');
    expect(deliver.disabled).toBe(true); click(deliver); expect(h.action).not.toHaveBeenCalled();
    for (const id of ['free-ore', 'relic', 'pending-ore', 'bag-ore']) expect(find(h.root, node => node.dataset.questItem === id)).toBeUndefined();
    const row = find(h.root, node => node.dataset.questItem === 'ore-a')!; click(row);
    expect(deliver.disabled).toBe(false);
    expect(get(h.root, 'dungeon-quest-selection-ore-delivery').textContent).toContain('2個を納品、残り1個');
    row.focus(); row.parentElement!.scrollTop = 50; const moves = row.moves;
    for (let n = 0; n < 30; n++) h.panel.update(structuredClone(h.value));
    expect(find(h.root, node => node.dataset.questItem === 'ore-a')).toBe(row);
    expect(documentStub.activeElement).toBe(row); expect(row.moves).toBe(moves); expect(row.parentElement!.scrollTop).toBe(50);
    click(deliver); click(deliver);
    expect(h.action).toHaveBeenCalledExactlyOnceWith({ kind: 'deliver-quest', quest: 'ore-delivery', item: 'ore-a' });
    expect(h.value.stash[0].count).toBe(3); expect(h.value.quests![1].progress).toBe(0); expect(h.value.gold).toBe(0);
    h.value.lastAction++; h.value.stash[0].count = 1; h.value.quests![1].progress = 2; h.panel.update(h.value);
    expect(deliver.disabled).toBe(true); expect(get(h.root, 'dungeon-quest-claim-ore-delivery').disabled).toBe(false);
    expect(find(h.root, node => !!node.dataset.questItem)).toBeUndefined();
    h.abort.abort(); click(get(h.root, 'dungeon-quest-claim-ore-delivery')); expect(h.action).toHaveBeenCalledTimes(1);
  });
  it('clears a removed selection rather than consuming the next eligible stack', () => {
    const h = panel(); acceptOre(h.value); h.value.stash = [item('one'), item('two')]; h.panel.update(h.value);
    click(find(h.root, node => node.dataset.questItem === 'one')!);
    h.value.stash.shift(); h.panel.update(h.value);
    expect(get(h.root, 'dungeon-quest-deliver-ore-delivery').disabled).toBe(true);
    expect(find(h.root, node => node.dataset.questItem === 'two')!.getAttribute('aria-pressed')).toBe('false');
  });
  it('blocks ready, raid, extracted, capped-gold and claimed actions and shows noninteractive raid objectives', () => {
    const h = panel(), actor = h.value.actors[0];
    h.value.quests = [{ id: 'first-return', progress: 1, claimed: false }];
    for (const state of ['ready', 'raid', 'extracted', 'cap']) {
      actor.ready = state === 'ready'; actor.status = state === 'extracted' ? 'extracted' : 'lobby';
      h.value.phase = state === 'raid' ? 'raid' : 'lobby'; h.value.gold = state === 'cap' ? 1e9 - 19 : 0;
      h.panel.update(h.value);
      expect(get(h.root, 'dungeon-quest-claim-first-return').disabled).toBe(true);
      click(get(h.root, 'dungeon-quest-claim-first-return'));
      if (state === 'raid') { expect(h.panel.raid.hidden).toBe(false); expect(h.panel.raid.textContent).toContain('1/1'); }
    }
    expect(h.action).not.toHaveBeenCalled();
    h.value.gold = 0; h.value.quests[0].claimed = true; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-quest-claim-first-return').disabled).toBe(true);
  });
  it('uses only the top-level owner journal and clears private state on leave or owner change', () => {
    const h = panel(); Object.assign(h.value.actors[1], { quests: [{ id: 'first-return', progress: 1, claimed: true }] });
    delete h.value.quests; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-quest-status-first-return').textContent).toBe('受注前');
    acceptOre(h.value); h.value.stash = [item('mine')]; h.panel.update(h.value);
    click(find(h.root, node => node.dataset.questItem === 'mine')!);
    h.panel.update(null); expect(h.root.hidden).toBe(true); expect(h.panel.raid.hidden).toBe(true);
    expect(find(h.root, node => !!node.dataset.questItem)).toBeUndefined();
    h.panel.update({ ...h.value, you: h.value.actors[1].id });
    expect(get(h.root, 'dungeon-quest-deliver-ore-delivery').disabled).toBe(true);
  });
  it('integrates a discoverable shortcut while preserving ready/start and pending-return controls', () => {
    dom(); const root = new Node('root');
    const ui = createDungeonUI(root as unknown as HTMLElement, { action: vi.fn(), create: vi.fn(), join: vi.fn(), reconnect: vi.fn(), inventory: vi.fn(), leave: vi.fn(), copyInvite: vi.fn() });
    const value = snapshot(); ui.update(value);
    expect(get(root, 'dungeon-quest-open').textContent).toContain('補給所の依頼');
    expect(get(root, 'dungeon-quest-panel').hidden).toBe(false);
    expect(get(root, 'dungeon-ready').disabled).toBe(false);
    value.pendingReturn = [item('return')]; ui.update(value);
    expect(get(root, 'dungeon-ready').disabled).toBe(true);
    expect(get(root, 'dungeon-pending-open').disabled).toBe(false);
    ui.dispose();
  });
});
