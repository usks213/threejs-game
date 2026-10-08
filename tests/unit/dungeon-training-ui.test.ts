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
function snapshot(): Snapshot { const sim = new DungeonSimulation(), owner = sim.join('a'.repeat(64), 'Owner')!; return sim.snapshot(owner.actor.id); }
function panel() {
  dom(); const action = vi.fn(), abort = new AbortController(), sequence = vi.fn(() => 8);
  const panel = createTrainingPanel(action, abort.signal, sequence), root = panel.root as unknown as Node;
  const value = snapshot(); panel.setConnected(true); panel.update(value);
  return { panel, root, value, action, abort, sequence };
}
afterEach(() => vi.unstubAllGlobals());
describe('optional bastion training selection', () => {
  it('shows none for legacy profiles, exact descriptions and baseline stats without mutation', () => {
    const h = panel(); delete h.value.actors[0].training; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-training-skill-none').getAttribute('aria-pressed')).toBe('true');
    expect(get(h.root, 'dungeon-training-perk-none').getAttribute('aria-pressed')).toBe('true');
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('125');
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('3.00');
    expect(h.root.textContent).toContain('2.5秒'); expect(h.root.textContent).toContain('盾と防御操作');
    expect(h.action).not.toHaveBeenCalled(); expect(h.value.actors[0].training).toBeUndefined();
    h.value.phase = 'raid'; h.value.actors[0].status = 'alive'; h.panel.update(h.value); expect(h.panel.skillButton.hidden).toBe(true);
  });
  it('does not confirm or unlock before the exact sent sequence, then atomically preserves the other choice', () => {
    const h = panel(), rush = get(h.root, 'dungeon-training-skill-rush');
    click(rush); click(get(h.root, 'dungeon-training-perk-vigor'));
    expect(h.action).toHaveBeenCalledExactlyOnceWith({ kind: 'configure-training', skill: 'rush', perk: null });
    expect(rush.getAttribute('aria-pressed')).toBe('false'); expect(rush.disabled).toBe(false); expect(rush.getAttribute('aria-disabled')).toBe('true');
    h.value.lastAction = 7; h.panel.update(h.value); expect(rush.getAttribute('aria-disabled')).toBe('true');
    h.value.lastAction = 8; h.value.actors[0].training = { skill: 'rush', perk: null }; h.panel.update(h.value);
    expect(rush.getAttribute('aria-pressed')).toBe('true'); expect(rush.disabled).toBe(false);
    h.sequence.mockReturnValue(9); click(get(h.root, 'dungeon-training-perk-vigor'));
    expect(h.action).toHaveBeenLastCalledWith({ kind: 'configure-training', skill: 'rush', perk: 'vigor' });
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('125');
    h.value.lastAction = 9; h.value.actors[0].training.perk = 'vigor'; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('135');
    h.sequence.mockReturnValue(10); click(get(h.root, 'dungeon-training-skill-none'));
    expect(h.action).toHaveBeenLastCalledWith({ kind: 'configure-training', skill: null, perk: 'vigor' });
  });
  it('recovers denied selection, failed send, disconnect, owner switch and leave safely', () => {
    const h = panel(), rush = get(h.root, 'dungeon-training-skill-rush'); click(rush);
    h.value.lastAction = 8; h.panel.update(h.value);
    expect(rush.disabled).toBe(false); expect(rush.getAttribute('aria-pressed')).toBe('false');
    h.action.mockReturnValue(false); click(rush); expect(rush.disabled).toBe(true);
    expect(get(h.root, 'dungeon-training-reason').textContent).toContain('接続が完了');
    h.action.mockReturnValue(undefined); h.panel.setConnected(true); click(rush);
    h.panel.setConnected(false); click(rush); expect(h.action).toHaveBeenCalledTimes(3);
    h.panel.setConnected(true); h.panel.update(h.value); expect(rush.disabled).toBe(false);
    click(rush); h.panel.update({ ...h.value, you: 'other' }); expect(h.root.hidden).toBe(true);
    h.panel.update(null); expect(h.panel.pendingSelection).toBe(false); expect(h.root.hidden).toBe(true);
  });
  it('locks ready, raid and other roles, and restores saved selection after switching back', () => {
    const h = panel(), actor = h.value.actors[0], rush = get(h.root, 'dungeon-training-skill-rush');
    actor.training = { skill: 'brace', perk: 'stride' };
    actor.ready = true; h.panel.update(h.value); click(rush); expect(rush.disabled).toBe(true);
    expect(get(h.root, 'dungeon-training-reason').textContent).toContain('準備完了を解除');
    actor.ready = false; h.value.phase = 'raid'; actor.status = 'alive'; h.panel.update(h.value); click(rush); expect(rush.disabled).toBe(true);
    h.value.phase = 'lobby'; actor.status = 'lobby'; actor.classId = 'hunter'; h.panel.update(h.value); click(rush);
    expect(get(h.root, 'dungeon-training-reason').textContent).toContain('未実装');
    actor.classId = 'bastion'; h.panel.update(h.value);
    expect(get(h.root, 'dungeon-training-skill-brace').getAttribute('aria-pressed')).toBe('true');
    expect(get(h.root, 'dungeon-training-stats').textContent).toContain('3.15'); expect(h.action).not.toHaveBeenCalled();
  });
  it('keeps node identity, focus and scroll on snapshots; removes listeners on disposal', () => {
    const h = panel(), option = get(h.root, 'dungeon-training-perk-vigor'); option.focus(); h.root.scrollTop = 80; const moves = option.moves;
    for (let n = 0; n < 30; n++) h.panel.update(structuredClone(h.value));
    expect(get(h.root, 'dungeon-training-perk-vigor')).toBe(option); expect(option.moves).toBe(moves);
    expect(documentStub.activeElement).toBe(option); expect(h.root.scrollTop).toBe(80);
    h.abort.abort(); click(option); expect(h.action).not.toHaveBeenCalled();
  });
  it('retains keyboard focus with a semantic pending lock without native disabling or permitting repeated sends', () => {
    const h = panel(), option = get(h.root, 'dungeon-training-skill-rush');
    // Model native disabled focus loss, which a plain mutable DOM stub would miss.
    let disabled = false;
    Object.defineProperty(option, 'disabled', { get: () => disabled, set: (value: boolean) => { disabled = value; if (value && documentStub.activeElement === option) documentStub.activeElement = null; } });
    option.focus(); h.root.scrollTop = 120; click(option);
    expect(option.disabled).toBe(false); expect(option.getAttribute('aria-disabled')).toBe('true');
    expect(documentStub.activeElement).toBe(option); click(option); expect(h.action).toHaveBeenCalledTimes(1);
    h.value.lastAction = 8; h.value.actors[0].training = { skill: 'rush', perk: null }; h.panel.update(h.value);
    expect(option.getAttribute('aria-disabled')).toBe('false'); expect(documentStub.activeElement).toBe(option); expect(h.root.scrollTop).toBe(120);
  });
  it('positions fresh and resized notices without any renderFeedback/RAF, and restores placement across menu and snapshot changes', () => {
    dom(); const browser = Object.assign(new EventTarget(), { location: { href: 'https://example.test/' }, innerWidth: 390, innerHeight: 844 }); vi.stubGlobal('window', browser);
    const root = new Node('root');
    const ui = createDungeonUI(root as unknown as HTMLElement, { action: vi.fn(), create: vi.fn(), join: vi.fn(), reconnect: vi.fn(), inventory: vi.fn(), leave: vi.fn(), copyInvite: vi.fn() });
    const value = snapshot(); value.phase = 'raid'; value.actors[0].status = 'alive'; value.actors[0].training = { skill: 'rush', perk: null };
    const notice = get(root, 'dungeon-notice'); notice.rect = { x: 0, y: 0, width: 230, height: 72 };
    ui.update(value); ui.notice('遠征を開始しました');
    expect(notice.hidden).toBe(false); expect(notice.style.left).toBe('14px'); expect(notice.style.top).toBe('617px');
    browser.innerHeight = 667; browser.dispatchEvent(new Event('resize')); expect(notice.style.top).toBe('440px');
    browser.innerHeight = 844; browser.dispatchEvent(new Event('orientationchange')); expect(notice.style.top).toBe('617px');
    ui.setInventory(true); expect(notice.classList.contains('dungeon-notice-gameplay')).toBe(false); expect(notice.style.top).toBe('');
    ui.setInventory(false); expect(notice.style.top).toBe('617px');
    value.phase = 'finished'; value.actors[0].status = 'dead'; ui.update(value); expect(notice.style.top).toBe('');
    value.phase = 'raid'; value.actors[0].status = 'alive'; ui.update(value); expect(notice.style.top).toBe('617px');
    ui.dispose(); browser.innerHeight = 667; browser.dispatchEvent(new Event('resize')); expect(notice.style.top).toBe('617px');
  });
  it('integrates pending readiness lock without rebuilding quest or inventory controls', () => {
    dom(); const root = new Node('root'), action = vi.fn();
    const ui = createDungeonUI(root as unknown as HTMLElement, { action, actionSequence: () => 3, create: vi.fn(), join: vi.fn(), reconnect: vi.fn(), inventory: vi.fn(), leave: vi.fn(), copyInvite: vi.fn() });
    const value = snapshot(); ui.setConnection('接続済み'); ui.update(value);
    const quest = get(root, 'dungeon-quest-open'), ready = get(root, 'dungeon-ready');
    expect(get(root, 'dungeon-class-bastion').textContent).toContain('基本HP 125');
    const vitals = find(root, node => node.classList.contains('dungeon-vitals'))!;
    const events = get(root, 'dungeon-events'), skillState = get(root, 'dungeon-skill-state');
    expect(events.parentElement).toBe(vitals);
    expect(vitals.children.indexOf(events)).toBeGreaterThan(vitals.children.indexOf(skillState));
    click(get(root, 'dungeon-training-skill-rush'));
    expect(ready.disabled).toBe(true); expect(get(root, 'dungeon-class-hunter').disabled).toBe(true);
    value.lastAction = 2; ui.update(value); expect(ready.disabled).toBe(true);
    value.lastAction = 3; ui.update(value); expect(ready.disabled).toBe(false);
    expect(get(root, 'dungeon-quest-open')).toBe(quest); ui.dispose();
  });
});
describe('server-timed bastion skill controls', () => {
  it('sends one activation, waits for ACK, shows active/cooldown and only enables again at readyAt', () => {
    const h = panel(), actor = h.value.actors[0]; h.value.phase = 'raid'; actor.status = 'alive'; actor.training = { skill: 'rush', perk: null }; h.panel.update(h.value);
    expect(h.panel.skillButton.disabled).toBe(false); h.panel.activateSkill(); h.panel.activateSkill();
    expect(h.action).toHaveBeenCalledExactlyOnceWith({ kind: 'skill' }); expect(h.panel.skillButton.disabled).toBe(true);
    h.value.lastAction = 8; actor.skillState = { skill: 'rush', activeUntil: 2.5, readyAt: 14 }; h.value.elapsed = 1; h.panel.update(h.value);
    expect(h.panel.hud.dataset.state).toBe('active'); expect(h.panel.hud.textContent).toContain('1.5秒');
    expect(opponentTrainingLabel(actor, 1)).toBe('疾駆 発動中');
    h.value.elapsed = 2.5; h.panel.update(h.value); expect(h.panel.hud.dataset.state).toBe('cooldown');
    h.value.elapsed = 14; h.panel.update(h.value); expect(h.panel.skillButton.disabled).toBe(false);
    h.panel.setConnected(false); h.panel.activateSkill(); expect(h.action).toHaveBeenCalledTimes(1);
    expect(h.panel.hud.dataset.state).toBe('disconnected');
  });
  it('explains missing choice, shield, busy phase, cast, interaction, death and unsupported class', () => {
    const h = panel(), actor = h.value.actors[0]; actor.status = 'alive';
    expect(trainingSkillReadout(actor, 0).reason).toContain('技を選択');
    actor.training = { skill: 'brace', perk: null }; actor.bag = [];
    expect(trainingSkillReadout(actor, 0).reason).toContain('盾');
    actor.training.skill = 'rush';
    for (const busy of [{ phase: 'windup' }, { cast: 1 }, { interaction: 'exit' }, { extract: 1 }]) {
      expect(trainingSkillReadout({ ...actor, ...busy } as typeof actor, 0).ready).toBe(false);
    }
    actor.status = 'dead'; expect(trainingSkillReadout(actor, 0).ready).toBe(false);
    actor.status = 'alive'; actor.classId = 'hunter'; expect(trainingSkillReadout(actor, 0).reason).toContain('未実装');
    expect(opponentTrainingLabel(actor, 0)).toBe('');
  });
});
