import { BASTION_PERKS, BASTION_SKILLS, activeBastionSkill, bastionSkillReadyIn, bastionTrainingStats, getBastionTraining } from './training';
import type { Action, BastionPerk, BastionSkill, Snapshot } from './types';

type VisibleActor = Snapshot['actors'][number];
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = value; return node;
}
function text(node: HTMLElement, value: string) { if (node.textContent !== value) node.textContent = value; }

/** Presentation only: all effect times and equipped choices come from the server. */
export function trainingSkillReadout(actor: VisibleActor, elapsed: number) {
  const selected = actor.classId === 'bastion' ? getBastionTraining(actor).skill : null;
  const active = activeBastionSkill(actor, elapsed), remaining = bastionSkillReadyIn(actor, elapsed);
  const label = selected ? BASTION_SKILLS[selected].name : '技なし';
  const reason = actor.classId !== 'bastion' ? 'この役割の訓練は未実装です' : !selected ? '補給所で技を選択してください' : actor.status !== 'alive' ? '遠征中のみ使用できます' : active ? `発動中 ${Math.max(0, actor.skillState!.activeUntil - elapsed).toFixed(1)}秒` : remaining > 0 ? `再使用まで ${remaining.toFixed(1)}秒` : actor.phase !== 'idle' || actor.cast !== 0 || !!actor.interaction || actor.extract > 0 ? '動作・詠唱・調査が終わるまで待ってください' : selected === 'brace' && !actor.bag.some(item => item.kind === 'shield') ? '携行中の盾が必要です' : null;
  return { selected, active, label, reason, ready: reason === null };
}
export function opponentTrainingLabel(actor: VisibleActor, elapsed: number) {
  const active = activeBastionSkill(actor, elapsed);
  return active ? `${BASTION_SKILLS[active].name} 発動中` : '';
}

/** Stable nodes preserve focus/scroll. Pending input never pretends to equip a choice. */
export function createTrainingPanel(action: (action: Action) => boolean | void, signal: AbortSignal, sentSequence?: () => number | undefined, changed?: () => void) {
  const root = element('section', 'dungeon-training-panel'); root.dataset.testid = 'dungeon-training-panel'; root.hidden = true;
  root.setAttribute('aria-labelledby', 'dungeon-training-title');
  const title = element('h3', '', '城塞兵の訓練 · 任意'); title.id = 'dungeon-training-title';
  const selection = element('p', 'dungeon-training-selection'); selection.dataset.testid = 'dungeon-training-selection';
  const stats = element('p', 'dungeon-training-stats'); stats.dataset.testid = 'dungeon-training-stats';
  const reason = element('p', 'dungeon-fine-print'); reason.id = 'dungeon-training-reason'; reason.dataset.testid = reason.id; reason.setAttribute('role', 'status');
  const choices = element('div', 'dungeon-training-choices');
  root.append(title, element('p', 'dungeon-fine-print', '城塞兵だけの小さな訓練。技1つ・特性1つを任意で選べます。「なし」なら従来の能力のまま。変更は補給所の準備完了前に行えます。'), choices, selection, stats, reason);
  const hud = element('div', 'dungeon-skill-state'); hud.dataset.testid = 'dungeon-skill-state'; hud.id = 'dungeon-skill-state'; hud.hidden = true;
  const skillButton = element('button', 'dungeon-button dungeon-action-button dungeon-action-skill'); skillButton.type = 'button'; skillButton.hidden = true;
  skillButton.dataset.dungeonAction = 'skill'; skillButton.dataset.testid = 'dungeon-action-skill'; skillButton.setAttribute('aria-describedby', hud.id);
  const skillName = element('span', '', '技'), skillKey = element('kbd', '', 'V'); skillButton.append(skillName, skillKey);
  const buttons: { node: HTMLButtonElement; kind: 'skill' | 'perk'; value: BastionSkill | BastionPerk | null }[] = [];
  let current: Snapshot | null = null, connected = false;
  let pending: { owner: string; sequence: number; kind: 'selection' | 'skill' } | null = null;
  const own = () => current?.actors.find(actor => actor.id === current?.you);
  function selectionReason(includePending = true) {
    const actor = own();
    if (!connected) return '接続が完了してから訓練を変更してください。';
    if (!actor || current?.phase === 'raid' || actor.status !== 'lobby') return '訓練の変更は補給所へ戻ってから行えます。';
    if (actor.classId !== 'bastion') return 'ほかの役割の訓練は未実装です。城塞兵に戻すと選択が復元されます。';
    if (actor.ready) return '変更するには先に準備完了を解除してください。';
    if (includePending && pending) return 'サーバーに確認中です…';
    return null;
  }
  function send(command: Action, kind: 'selection' | 'skill') {
    if (!current || signal.aborted || pending) return;
    pending = { owner: current.you, sequence: Infinity, kind }; render(); changed?.();
    if (action(command) === false) { pending = null; connected = false; }
    else if (pending) pending.sequence = sentSequence?.() ?? current.lastAction + 1;
    render(); changed?.();
  }
  function group(kind: 'skill' | 'perk', label: string, values: readonly (BastionSkill | BastionPerk)[]) {
    const field = element('fieldset', 'dungeon-training-group'), legend = element('legend', '', label);
    field.append(legend);
    for (const value of [null, ...values]) {
      const definition = value ? kind === 'skill' ? BASTION_SKILLS[value as BastionSkill] : BASTION_PERKS[value as BastionPerk] : null;
      const node = element('button', 'dungeon-button dungeon-training-option'); node.type = 'button';
      node.dataset.testid = `dungeon-training-${kind}-${value ?? 'none'}`;
      node.setAttribute('aria-describedby', reason.id); node.setAttribute('aria-pressed', 'false');
      node.append(element('strong', '', definition?.name ?? 'なし'), element('span', '', definition?.description ?? (kind === 'skill' ? '発動する技を装備しない' : '追加の能力補正なし')));
      node.addEventListener('click', () => {
        const actor = own(); if (!actor || node.disabled || signal.aborted || selectionReason()) return;
        const training = getBastionTraining(actor);
        if (training[kind] === value) return;
        send({ kind: 'configure-training', ...training, [kind]: value }, 'selection');
      }, { signal });
      buttons.push({ node, kind, value }); field.append(node);
    }
    choices.append(field);
  }
  group('skill', '技 · V / タッチで発動', ['rush', 'brace']);
  group('perk', '特性 · 選択中は常時適用', ['vigor', 'stride']);
  function render() {
    const actor = own(), bastion = actor?.classId === 'bastion';
    root.hidden = !actor; choices.hidden = !bastion; selection.hidden = stats.hidden = !bastion;
    const blocked = selectionReason(); text(reason, blocked ?? '選択はサーバー保存後に確定します。技と特性は「なし」に戻せます。');
    const training = actor ? getBastionTraining(actor) : { skill: null, perk: null };
    // aria-disabled during the brief request lock retains the initiating keyboard focus.
    // The click handler independently checks the lock; ready/raid/offline remain native-disabled.
    for (const button of buttons) { button.node.disabled = !!selectionReason(false); button.node.setAttribute('aria-disabled', String(!!blocked)); button.node.setAttribute('aria-pressed', String(training[button.kind] === button.value)); }
    text(selection, `保存済みの選択：技 ${training.skill ? BASTION_SKILLS[training.skill].name : 'なし'} / 特性 ${training.perk ? BASTION_PERKS[training.perk].name : 'なし'}`);
    const data = bastionTrainingStats(training); text(stats, `最大HP ${data.maxHp} · 基本移動 ${data.speed.toFixed(2)} m/秒`);
    hud.hidden = !bastion || current?.phase !== 'raid' || actor?.status !== 'alive';
    skillButton.hidden = hud.hidden || !training.skill;
    if (!actor || !current) { skillButton.disabled = true; return; }
    const readout = trainingSkillReadout(actor, current.elapsed);
    const unavailable = !connected ? '接続待ち' : pending ? 'サーバーに確認中' : readout.reason;
    skillButton.disabled = !!unavailable || current.phase !== 'raid';
    text(skillName, readout.selected ? readout.label : '技なし');
    text(hud, `${readout.label} · ${unavailable ?? '使用可能 · V / 技ボタン'}`);
    hud.dataset.state = !connected ? 'disconnected' : pending ? 'pending' : readout.active ? 'active' : bastionSkillReadyIn(actor, current.elapsed) > 0 ? 'cooldown' : readout.ready ? 'ready' : 'unavailable';
    skillButton.setAttribute('aria-label', `${readout.label} (V) · ${unavailable ?? '使用可能'}`);
    skillButton.title = unavailable ?? `${readout.label}を発動`;
  }
  return {
    root, hud, skillButton,
    get pendingSelection() { return pending?.kind === 'selection'; },
    activateSkill() { const actor = own(); if (!actor || !current || signal.aborted || !connected || current.phase !== 'raid' || pending || !trainingSkillReadout(actor, current.elapsed).ready) return; send({ kind: 'skill' }, 'skill'); },
    update(snapshot: Snapshot | null) {
      if (signal.aborted) return;
      if (pending && (!snapshot || snapshot.you !== pending.owner || snapshot.lastAction >= pending.sequence)) pending = null;
      current = snapshot; render();
    },
    setConnected(value: boolean) { if (signal.aborted) return; connected = value; if (!value) pending = null; render(); changed?.(); },
  };
}
