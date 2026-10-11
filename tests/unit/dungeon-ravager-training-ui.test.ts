import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMaxListeners } from 'node:events';
import { createTrainingPanel, trainingSkillReadout, opponentTrainingLabel } from '../../src/dungeon/training-panel';
import { createDungeonUI } from '../../src/dungeon/ui';
import { DungeonSimulation } from '../../src/dungeon/simulation';
import type { Snapshot } from '../../src/dungeon/types';
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
  rect = { x: 0, y: 0, width: 0, height: 0 };
  getClientRects() { return [this.rect]; }
  getBoundingClientRect() { return this.rect; }
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
function snapshot(): Snapshot { const sim = new DungeonSimulation(), owner = sim.join('a'.repeat(64), 'Owner')!; sim.command(owner.actor.id, 1, { kind: 'class', classId: 'ravager' }); owner.actor.bag = [{ id: 'greatsword', kind: 'greatsword', count: 1, quality: 0, found: false, rotated: false, x: 0, y: 0 }]; return sim.snapshot(owner.actor.id); }
function panel() {
  dom(); const action = vi.fn(), abort = new AbortController(), sequence = vi.fn(() => 8);
  const panel = createTrainingPanel(action, abort.signal, sequence), root = panel.root as unknown as Node;
  const value = snapshot(); panel.setConnected(true); panel.update(value);
  return { panel, root, value, action, abort, sequence };
}
afterEach(() => vi.unstubAllGlobals());
describe('independent optional ravager training controls', () => {
  it('shows legacy none, exact benefits and risks, baseline stats and no skill button until selected', () => {
    const h = panel(), actor = h.value.actors[0];
    expect(actor.ravagerTraining).toBeUndefined();
    expect(get(h.root, 'dungeon-ravager-training-skill-none').getAttribute('aria-pressed')).toBe('true');
    expect(get(h.root, 'dungeon-ravager-training-perk-none').getAttribute('aria-pressed')).toBe('true');
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('145');
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('2.85');
    for (const copy of ['荒戦士の訓練', '5秒', '1.25倍', '1.2倍', '18秒', '35%以下', '1.15倍', '20%短縮']) expect(h.root.textContent).toContain(copy);
    click(get(h.root, 'dungeon-ravager-training-skill-none')); click(get(h.root, 'dungeon-ravager-training-perk-none'));
    expect(h.action).not.toHaveBeenCalled(); expect(actor.ravagerTraining).toBeUndefined();
    h.value.phase = 'raid'; actor.status = 'alive'; h.panel.update(h.value); expect(h.panel.skillButton.hidden).toBe(true);
  });
  it('keeps both classes independently saved and restores exact nodes across class switching and snapshots', () => {
    const h = panel(), actor = h.value.actors[0], frenzy = get(h.root, 'dungeon-ravager-training-skill-frenzy');
    actor.ravagerTraining = { skill: 'frenzy', perk: 'laststand' }; actor.training = { skill: 'brace', perk: 'stride' };
    h.panel.update(h.value); expect(frenzy.getAttribute('aria-pressed')).toBe('true');
    frenzy.focus(); h.root.scrollTop = 90; const moves = frenzy.moves;
    for (let n = 0; n < 20; n++) h.panel.update(structuredClone(h.value));
    expect(documentStub.activeElement).toBe(frenzy); expect(frenzy.moves).toBe(moves); expect(h.root.scrollTop).toBe(90);
    actor.classId = 'bastion'; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-ravager-training-choices').hidden).toBe(true);
    expect(get(h.root, 'dungeon-training-skill-brace').getAttribute('aria-pressed')).toBe('true');
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('3.15');
    click(frenzy); expect(h.action).not.toHaveBeenCalled();
    actor.classId = 'ravager'; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-ravager-training-skill-frenzy')).toBe(frenzy);
    expect(get(h.root, 'dungeon-training-selection').textContent).toContain('狂奔 / 特性 背水');
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('145');
    expect(actor.training).toEqual({ skill: 'brace', perk: 'stride' });
  });
  it('waits for the actual sent sequence, preserves keyboard focus and the other choice, and supports explicit none', () => {
    const h = panel(), actor = h.value.actors[0], frenzy = get(h.root, 'dungeon-ravager-training-skill-frenzy');
    let disabled = false;
    Object.defineProperty(frenzy, 'disabled', { get: () => disabled, set: (value: boolean) => { disabled = value; if (value && documentStub.activeElement === frenzy) documentStub.activeElement = null; } });
    frenzy.focus(); click(frenzy); click(frenzy); click(get(h.root, 'dungeon-ravager-training-perk-followthrough'));
    expect(h.action).toHaveBeenCalledExactlyOnceWith({ kind: 'configure-ravager-training', skill: 'frenzy', perk: null });
    expect(frenzy.getAttribute('aria-pressed')).toBe('false'); expect(frenzy.getAttribute('aria-disabled')).toBe('true');
    expect(documentStub.activeElement).toBe(frenzy); expect(frenzy.disabled).toBe(false);
    h.value.lastAction = 7; h.panel.update(h.value); expect(h.panel.pendingSelection).toBe(true);
    h.value.lastAction = 8; actor.ravagerTraining = { skill: 'frenzy', perk: null }; h.panel.update(h.value);
    expect(h.panel.pendingSelection).toBe(false); expect(frenzy.getAttribute('aria-pressed')).toBe('true'); expect(documentStub.activeElement).toBe(frenzy);
    h.sequence.mockReturnValue(9); click(get(h.root, 'dungeon-ravager-training-perk-followthrough'));
    expect(h.action).toHaveBeenLastCalledWith({ kind: 'configure-ravager-training', skill: 'frenzy', perk: 'followthrough' });
    expect(get(h.root, 'dungeon-training-selection').textContent).toContain('特性 なし');
    actor.ravagerTraining.perk = 'followthrough'; h.value.lastAction = 9; h.panel.update(h.value);
    h.sequence.mockReturnValue(10); click(get(h.root, 'dungeon-ravager-training-skill-none'));
    expect(h.action).toHaveBeenLastCalledWith({ kind: 'configure-ravager-training', skill: null, perk: 'followthrough' });
  });
  it('blocks ready/raid/unsupported/offline choices, recovers rejection or failed send, and releases on owner changes', () => {
    const h = panel(), actor = h.value.actors[0], frenzy = get(h.root, 'dungeon-ravager-training-skill-frenzy');
    actor.ready = true; h.panel.update(h.value); click(frenzy); expect(h.action).not.toHaveBeenCalled();
    expect(get(h.root, 'dungeon-training-reason').textContent).toContain('準備完了を解除');
    actor.ready = false; actor.status = 'alive'; h.value.phase = 'raid'; h.panel.update(h.value); click(frenzy); expect(h.action).not.toHaveBeenCalled();
    actor.status = 'lobby'; h.value.phase = 'lobby'; actor.classId = 'hunter'; h.panel.update(h.value); click(frenzy); expect(h.action).not.toHaveBeenCalled();
    actor.classId = 'ravager'; h.panel.update(h.value); click(frenzy); h.value.lastAction = 8; h.panel.update(h.value);
    expect(frenzy.getAttribute('aria-pressed')).toBe('false'); expect(h.panel.pendingSelection).toBe(false);
    h.action.mockReturnValue(false); click(frenzy); expect(frenzy.disabled).toBe(true); expect(h.panel.pendingSelection).toBe(false);
    h.action.mockReturnValue(undefined); h.panel.setConnected(true); click(frenzy); h.panel.setConnected(false); expect(h.panel.pendingSelection).toBe(false);
    h.panel.setConnected(true); click(frenzy); h.panel.update({ ...h.value, you: 'other' }); expect(h.panel.pendingSelection).toBe(false); expect(h.root.hidden).toBe(true);
    h.panel.update(null); h.abort.abort(); h.panel.update(h.value); expect(h.root.hidden).toBe(true);
  });
  it('locks readiness and class switching until selection acknowledgement without rebuilding other panels', () => {
    dom(); const root = new Node('root'), action = vi.fn();
    const ui = createDungeonUI(root as unknown as HTMLElement, { action, actionSequence: () => 8, create: vi.fn(), join: vi.fn(), reconnect: vi.fn(), inventory: vi.fn(), leave: vi.fn(), copyInvite: vi.fn() });
    const value = snapshot(); ui.setConnection('接続済み'); ui.update(value);
    const ready = get(root, 'dungeon-ready'), quest = get(root, 'dungeon-quest-open'); click(get(root, 'dungeon-ravager-training-perk-laststand'));
    expect(ready.disabled).toBe(true); expect(get(root, 'dungeon-class-bastion').disabled).toBe(true);
    value.lastAction = 7; ui.update(value); expect(ready.disabled).toBe(true);
    value.lastAction = 8; value.actors[0].ravagerTraining = { skill: null, perk: 'laststand' }; ui.update(value);
    expect(ready.disabled).toBe(false); expect(get(root, 'dungeon-class-bastion').disabled).toBe(false); expect(get(root, 'dungeon-quest-open')).toBe(quest); ui.dispose();
  });
});
describe('server-confirmed ravager skill and perk presentation', () => {
  it('shows active risk only after acknowledgement, expires at five seconds and enables at eighteen', () => {
    const h = panel(), actor = h.value.actors[0]; h.value.phase = 'raid'; actor.status = 'alive'; actor.ravagerTraining = { skill: 'frenzy', perk: 'laststand' }; h.panel.update(h.value);
    expect(h.panel.skillButton.disabled).toBe(false); h.panel.activateSkill(); h.panel.activateSkill();
    expect(h.action).toHaveBeenCalledExactlyOnceWith({ kind: 'skill' }); expect(h.panel.hud.dataset.state).toBe('pending');
    expect(h.panel.hud.textContent).not.toContain('被ダメージ×1.2');
    h.value.lastAction = 8; actor.ravagerSkillState = { skill: 'frenzy', activeUntil: 5, readyAt: 18 }; h.value.elapsed = 1; h.panel.update(h.value);
    expect(h.panel.hud.dataset.state).toBe('active'); expect(h.panel.hud.textContent).toContain('4.0秒'); expect(h.panel.hud.textContent).toContain('被ダメージ×1.2');
    h.value.elapsed = 5; h.panel.update(h.value); expect(h.panel.hud.dataset.state).toBe('cooldown'); expect(h.panel.hud.textContent).toContain('13.0秒');
    h.value.elapsed = 18; h.panel.update(h.value); expect(h.panel.skillButton.disabled).toBe(false);
    h.panel.setConnected(false); h.panel.activateSkill(); expect(h.action).toHaveBeenCalledTimes(1); expect(h.panel.hud.dataset.state).toBe('disconnected');
  });
  it('requires equipped and carried greatsword, explains busy states and uses only current class', () => {
    const h = panel(), actor = h.value.actors[0]; actor.status = 'alive';
    expect(trainingSkillReadout(actor, 0).reason).toContain('技を選択'); actor.ravagerTraining = { skill: 'frenzy', perk: null };
    expect(trainingSkillReadout(actor, 0).ready).toBe(true);
    expect(trainingSkillReadout({ ...actor, weapon: 'sword' }, 0).reason).toContain('大剣');
    expect(trainingSkillReadout({ ...actor, bag: [] }, 0).reason).toContain('大剣');
    for (const patch of [{ phase: 'windup' }, { phase: 'recover' }, { cast: 1 }, { cast: -1 }, { interaction: 'exit' }, { extract: 1 }]) expect(trainingSkillReadout({ ...actor, ...patch } as typeof actor, 0).ready).toBe(false);
    for (const status of ['dead', 'extracted', 'lobby'] as const) expect(trainingSkillReadout({ ...actor, status }, 0).reason).toContain('遠征中');
    expect(trainingSkillReadout({ ...actor, classId: 'hunter' }, 0).reason).toContain('未実装');
    expect(trainingSkillReadout({ ...actor, classId: 'bastion' }, 0).selected).toBeNull();
  });
  it('shows active opponent benefit and risk with redacted bags, never an expired or wrong-class effect', () => {
    const actor = snapshot().actors[0]; actor.status = 'alive'; actor.bag = []; actor.ravagerTraining = { skill: 'frenzy', perk: null }; actor.ravagerSkillState = { skill: 'frenzy', activeUntil: 5, readyAt: 18 };
    expect(opponentTrainingLabel(actor, 1)).toContain('狂奔 発動中'); expect(opponentTrainingLabel(actor, 1)).toContain('大剣近接×1.25 / 被ダメージ×1.2');
    expect(opponentTrainingLabel(actor, 5)).toBe(''); expect(opponentTrainingLabel({ ...actor, status: 'dead' }, 1)).toBe('');
    expect(opponentTrainingLabel({ ...actor, classId: 'bastion' }, 1)).toBe('');
    expect(opponentTrainingLabel({ ...actor, ravagerTraining: { skill: null, perk: null } }, 1)).toBe('');
  });
  it('reports laststand at the exact authoritative HP threshold and followthrough only for the current selection', () => {
    const h = panel(), actor = h.value.actors[0]; h.value.phase = 'raid'; actor.status = 'alive'; actor.ravagerTraining = { skill: null, perk: 'laststand' };
    actor.hp = actor.maxHp * .35 + .01; h.panel.update(h.value); expect(h.panel.hud.textContent).toContain('HP35%以下'); expect(h.panel.hud.textContent).not.toContain('背水 発動中');
    actor.hp = actor.maxHp * .35; h.panel.update(h.value); expect(h.panel.hud.textContent).toContain('背水 発動中 · 近接×1.15'); expect(h.panel.skillButton.hidden).toBe(true);
    for (const weapon of ['bow', 'staff'] as const) { actor.weapon = weapon; h.panel.update(h.value); expect(h.panel.hud.textContent).not.toContain('背水 発動中'); expect(h.panel.hud.textContent).toContain('装備が必要'); }
    actor.weapon = 'greatsword'; actor.ravagerTraining.perk = 'followthrough'; h.panel.update(h.value); expect(h.panel.hud.textContent).toContain('強撃後硬直20%短縮'); expect(h.panel.hud.textContent).not.toContain('背水');
    actor.classId = 'bastion'; h.panel.update(h.value); expect(h.panel.hud.textContent).not.toContain('追撃');
  });
});
