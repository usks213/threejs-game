import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMaxListeners } from 'node:events';
import { createDungeonUI } from '../../src/dungeon/ui';
import { DungeonSimulation } from '../../src/dungeon/simulation';
import type { Container, Item } from '../../src/dungeon/types';

/** Node-only DOM fixture: tests state, order, identity and focus, not browser layout. */
class Node extends EventTarget {
  children: Node[] = []; parentElement: Node | null = null;
  dataset: Record<string, string> = {}; style: Record<string, string> = {};
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
    child.remove(); const index = before ? this.children.indexOf(before) : this.children.length;
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
    if (selector.startsWith('[data-')) {
      const key = selector.slice(6, -1).replace(/-([a-z])/g, (_, character: string) => character.toUpperCase());
      return this.dataset[key] !== undefined;
    }
    return selector === this.tag;
  }
  closest(selector: string): Node | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector: string): Node[] { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  focus() { documentStub.activeElement = this; }
}
const documentStub = { activeElement: null as Node | null, createElement: (tag: string) => new Node(tag) };
const find = (node: Node, match: (candidate: Node) => boolean): Node | undefined => match(node) ? node : node.children.map(child => find(child, match)).find(Boolean);
const get = (root: Node, testid: string) => find(root, node => node.dataset.testid === testid)!;
const withClass = (root: Node, name: string) => find(root, node => node.classList.contains(name))!;
const pick = (root: Node, id: string) => find(root, node => node.dataset.lootItem === id)!;
function click(node: Node) {
  const event = new Event('click'); Object.defineProperty(event, 'target', { value: node });
  for (let next: Node | null = node; next; next = next.parentElement) next.dispatchEvent(event);
}
function item(id: string): Item { return { id, kind: 'relic', count: 1, quality: 1, found: false, x: 0, y: 0, rotated: false }; }
function chest(id: string, z = -1, items = [item(`${id}-a`), item(`${id}-b`)]): Container {
  return { id, name: id, kind: 'chest', opened: true, locked: false, position: { x: 0, y: 0, z }, items };
}
function fixture() {
  documentStub.activeElement = null;
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('window', { location: { href: 'https://example.test/?mode=dungeon' } });
  vi.stubGlobal('Element', Node); vi.stubGlobal('HTMLElement', Node);
  const BaseAbortController = globalThis.AbortController;
  vi.stubGlobal('AbortController', class extends BaseAbortController { constructor() { super(); setMaxListeners(0, this.signal); } });
  const root = new Node('root'), action = vi.fn(), inventory = vi.fn();
  const ui = createDungeonUI(root as unknown as HTMLElement, { action, inventory, create: vi.fn(), join: vi.fn(), reconnect: vi.fn(), leave: vi.fn(), copyInvite: vi.fn() });
  const sim = new DungeonSimulation(), owner = sim.join('a'.repeat(64), 'Owner')!;
  const value = sim.snapshot(owner.actor.id); value.phase = 'raid'; value.raid = 1;
  value.actors[0].status = 'alive'; value.actors[0].position = { x: 0, y: 0, z: 0 };
  value.doors = []; value.exits = []; value.containers = [chest('near')];
  ui.update(value);
  return { ui, root, action, inventory, value, actor: value.actors[0] };
}
afterEach(() => vi.unstubAllGlobals());

describe('first-raid loot inventory', () => {
  it('puts loot first, hides unavailable raid facilities, and restores them for results and lobby', () => {
    const h = fixture(); h.ui.setInventory(true);
    const panel = withClass(h.root, 'dungeon-inventory-panel');
    const loot = get(h.root, 'dungeon-loot-section'), supply = get(h.root, 'dungeon-supply-section');
    const stash = get(h.root, 'dungeon-stash-section'), bag = get(h.root, 'dungeon-bag-section');
    expect(panel.children.indexOf(loot)).toBeLessThan(panel.children.indexOf(supply));
    expect(panel.children.indexOf(loot)).toBeLessThan(panel.children.indexOf(bag.parentElement!));
    expect(supply.hidden).toBe(true); expect(stash.hidden).toBe(true); expect(bag.hidden).toBe(false);
    expect(bag.parentElement!.classList.contains('dungeon-inventory-columns-raid')).toBe(true);
    expect(withClass(h.root, 'dungeon-inventory-heading').textContent).toContain('戦利品と鞄');
    for (const status of ['dead', 'extracted', 'lobby'] as const) {
      h.actor.status = status; h.value.phase = status === 'lobby' ? 'lobby' : 'raid'; h.ui.update(h.value);
      expect(supply.hidden).toBe(false); expect(stash.hidden).toBe(false); expect(loot.hidden).toBe(true);
      expect(bag.parentElement!.classList.contains('dungeon-inventory-columns-raid')).toBe(false);
    }
    h.ui.dispose();
  });
  it('opens the selected chest at the full 2.5m loot reach and focuses a visible pickup without changing server state', () => {
    const h = fixture(); h.value.containers = [chest('other'), chest('chosen', -2.5)]; h.ui.update(h.value);
    const before = structuredClone(h.value);
    expect(h.ui.openLoot('chosen')).toBe(true);
    expect(h.inventory).toHaveBeenCalledExactlyOnceWith(true);
    expect(documentStub.activeElement).toBe(pick(h.root, 'chosen-a'));
    expect(withClass(h.root, 'dungeon-loot-content').children[1].dataset.lootContainer).toBe('chosen');
    expect(h.value).toEqual(before); expect(h.action).not.toHaveBeenCalled();
    expect(h.ui.openLoot('chosen')).toBe(true); expect(h.inventory).toHaveBeenCalledTimes(1);
    h.ui.dispose();
  });
  it.each(['distant', 'closed', 'wall', 'dead', 'missing'])('refuses to open inaccessible loot: %s', reason => {
    const h = fixture();
    if (reason === 'distant') h.value.containers[0].position.z = -2.501;
    if (reason === 'closed') h.value.containers[0].opened = false;
    if (reason === 'wall') { h.actor.position = { x: -8, y: 0, z: -4 }; h.value.containers[0].position = { x: -8, y: 0, z: -6 }; }
    if (reason === 'dead') h.actor.status = 'dead';
    h.ui.update(h.value);
    expect(h.ui.openLoot(reason === 'missing' ? 'missing' : 'near')).toBe(false);
    expect(h.inventory).not.toHaveBeenCalled(); expect(h.action).not.toHaveBeenCalled();
    h.ui.dispose();
  });
  it('keeps pickup nodes, focus and scroll stable through unchanged snapshots and other-item removal', () => {
    const h = fixture(); h.ui.openLoot('near');
    const kept = pick(h.root, 'near-b'), panel = withClass(h.root, 'dungeon-inventory-panel');
    kept.focus(); panel.scrollTop = 33; const moves = kept.moves;
    for (let n = 0; n < 20; n++) h.ui.update(structuredClone(h.value));
    expect(pick(h.root, 'near-b')).toBe(kept); expect(kept.moves).toBe(moves);
    expect(documentStub.activeElement).toBe(kept); expect(panel.scrollTop).toBe(33);
    h.value.containers[0].items.shift(); h.ui.update(h.value);
    expect(pick(h.root, 'near-b')).toBe(kept); expect(documentStub.activeElement).toBe(kept);
    click(kept); expect(h.action).toHaveBeenCalledExactlyOnceWith({ kind: 'loot', target: 'near', item: 'near-b' });
    expect(h.value.containers[0].items).toHaveLength(1);
    h.ui.dispose();
  });
  it('moves focus to the next pickup, then the empty chest, after authoritative item removal', () => {
    const h = fixture(); h.ui.openLoot('near');
    h.value.containers[0].items.shift(); h.ui.update(h.value);
    expect(documentStub.activeElement).toBe(pick(h.root, 'near-b'));
    h.value.containers[0].items = []; h.ui.update(h.value);
    expect(documentStub.activeElement?.dataset.lootContainer).toBe('near');
    expect(documentStub.activeElement?.textContent).toContain('空です');
    h.ui.dispose();
  });
  it('allows door/exit interactions at 2.6m while an opened chest beyond 2.5m has no loot button', () => {
    const h = fixture(); h.value.containers = [chest('near', -2.55)];
    h.value.doors = [{ id: 'door', position: { x: 0, y: 0, z: 2.6 }, open: true }];
    h.value.exits = [{ id: 'exit', position: { x: 2.6, y: 0, z: 0 }, opensAt: 0, remaining: 1 }];
    h.ui.update(h.value);
    expect(find(h.root, node => node.dataset.target === 'near')).toBeUndefined();
    click(find(h.root, node => node.dataset.target === 'door')!);
    click(find(h.root, node => node.dataset.target === 'exit')!);
    expect(h.action.mock.calls).toEqual([[{ kind: 'interact', target: 'door' }], [{ kind: 'interact', target: 'exit' }]]);
    h.value.containers[0].opened = false; h.ui.update(h.value);
    expect(find(h.root, node => node.dataset.target === 'near')).toBeUndefined();
    h.value.containers[0].position.z = -2.5; h.ui.update(h.value);
    expect(find(h.root, node => node.dataset.target === 'near')).toBeDefined();
    h.ui.dispose();
  });
  it('does not send a stale pickup after moving out of reach or after disposal', () => {
    const h = fixture(); h.ui.openLoot('near'); const stale = pick(h.root, 'near-a');
    h.actor.position.z = 3; h.ui.update(h.value); click(stale);
    expect(h.action).not.toHaveBeenCalled();
    h.actor.position.z = 0; h.ui.update(h.value); const restored = pick(h.root, 'near-a');
    h.ui.dispose(); click(restored); expect(h.action).not.toHaveBeenCalled();
  });
});
