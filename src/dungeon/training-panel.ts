import { CLASSES } from './catalog';
import { BASTION_PERKS, BASTION_SKILLS, activeBastionSkill, bastionSkillReadyIn, bastionTrainingStats, getBastionTraining } from './training';
import { RAVAGER_PERKS, RAVAGER_SKILLS, activeRavagerSkill, getRavagerTraining, ravagerSkillReadyIn } from './ravager-training';
import type { Action, BastionPerk, BastionSkill, RavagerPerk, RavagerSkill, Snapshot } from './types';

type VisibleActor = Snapshot['actors'][number];
type TrainingClass = 'bastion' | 'ravager';
type Choice = BastionSkill | BastionPerk | RavagerSkill | RavagerPerk | null;
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = value; return node;
}
function text(node: HTMLElement, value: string) { if (node.textContent !== value) node.textContent = value; }

/** Presentation only: all effect times, HP thresholds and equipped choices come from the server. */
export function trainingSkillReadout(actor: VisibleActor, elapsed: number) {
  const ravager = actor.classId === 'ravager', supported = ravager || actor.classId === 'bastion';
  const selected = ravager ? getRavagerTraining(actor).skill : actor.classId === 'bastion' ? getBastionTraining(actor).skill : null;
  const active = ravager ? activeRavagerSkill(actor, elapsed) : activeBastionSkill(actor, elapsed);
  const remaining = ravager ? ravagerSkillReadyIn(actor, elapsed) : bastionSkillReadyIn(actor, elapsed);
  const activeUntil = ravager ? actor.ravagerSkillState?.activeUntil : actor.skillState?.activeUntil;
  const label = selected ? selected === 'frenzy' ? RAVAGER_SKILLS.frenzy.name : BASTION_SKILLS[selected].name : '技なし';
  const effect = active === 'frenzy' ? actor.weapon === 'greatsword' ? ' · 大剣近接×1.25 / 被ダメージ×1.2' : ' · 被ダメージ×1.2 / 大剣装備時に近接×1.25' : '';
  const reason = !supported ? 'この役割の訓練は未実装です' : !selected ? '補給所で技を選択してください' : actor.status !== 'alive' ? '遠征中のみ使用できます' : active ? `発動中 ${Math.max(0, (activeUntil ?? elapsed) - elapsed).toFixed(1)}秒${effect}` : remaining > 0 ? `再使用まで ${remaining.toFixed(1)}秒` : actor.phase !== 'idle' || actor.cast !== 0 || !!actor.interaction || actor.extract > 0 ? '動作・詠唱・調査が終わるまで待ってください' : selected === 'brace' && !actor.bag.some(item => item.kind === 'shield') ? '携行中の盾が必要です' : selected === 'frenzy' && (actor.weapon !== 'greatsword' || !actor.bag.some(item => item.kind === 'greatsword')) ? '携行・装備中の大剣が必要です' : null;
  return { selected, active, label, reason, remaining, ready: reason === null };
}
export function opponentTrainingLabel(actor: VisibleActor, elapsed: number) {
  if (activeRavagerSkill(actor, elapsed)) return `${RAVAGER_SKILLS.frenzy.name} 発動中 · ${actor.weapon === 'greatsword' ? '大剣近接×1.25 / 被ダメージ×1.2' : '被ダメージ×1.2 / 大剣装備時に近接×1.25'}`;
  const active = activeBastionSkill(actor, elapsed);
  return active ? `${BASTION_SKILLS[active].name} 発動中` : '';
}

/** Stable nodes preserve focus/scroll. Pending input never pretends to equip a choice. */
export function createTrainingPanel(action: (action: Action) => boolean | void, signal: AbortSignal, sentSequence?: () => number | undefined, changed?: () => void) {
  const root = element('section', 'dungeon-training-panel'); root.dataset.testid = 'dungeon-training-panel'; root.hidden = true;
  root.setAttribute('aria-labelledby', 'dungeon-training-title');
  const title = element('h3', '', '城塞兵の訓練 · 任意'); title.id = 'dungeon-training-title';
  const description = element('p', 'dungeon-fine-print');
  const selection = element('p', 'dungeon-training-selection'); selection.dataset.testid = 'dungeon-training-selection';
  const stats = element('p', 'dungeon-training-stats'); stats.dataset.testid = 'dungeon-training-stats';
  const reason = element('p', 'dungeon-fine-print'); reason.id = 'dungeon-training-reason'; reason.dataset.testid = reason.id; reason.setAttribute('role', 'status');
  const choices = { bastion: element('div', 'dungeon-training-choices'), ravager: element('div', 'dungeon-training-choices') };
  choices.bastion.dataset.testid = 'dungeon-training-choices'; choices.ravager.dataset.testid = 'dungeon-ravager-training-choices';
  root.append(title, description, choices.bastion, choices.ravager, selection, stats, reason);
  const hud = element('div', 'dungeon-skill-state'); hud.dataset.testid = 'dungeon-skill-state'; hud.id = 'dungeon-skill-state'; hud.hidden = true;
  const skillButton = element('button', 'dungeon-button dungeon-action-button dungeon-action-skill'); skillButton.type = 'button'; skillButton.hidden = true;
  skillButton.dataset.dungeonAction = 'skill'; skillButton.dataset.testid = 'dungeon-action-skill'; skillButton.setAttribute('aria-describedby', hud.id);
  const skillName = element('span', '', '技'), skillKey = element('kbd', '', 'V'); skillButton.append(skillName, skillKey);
  const buttons: { node: HTMLButtonElement; classId: TrainingClass; kind: 'skill' | 'perk'; value: Choice }[] = [];
  let current: Snapshot | null = null, connected = false;
  let pending: { owner: string; sequence: number; kind: 'selection' | 'skill' } | null = null;
  const own = () => current?.actors.find(actor => actor.id === current?.you);
  function selectionReason(includePending = true) {
    const actor = own();
    if (!connected) return '接続が完了してから訓練を変更してください。';
    if (!actor || current?.phase === 'raid' || actor.status !== 'lobby') return '訓練の変更は補給所へ戻ってから行えます。';
    if (actor.classId !== 'bastion' && actor.classId !== 'ravager') return 'この役割の訓練は未実装です。城塞兵・荒戦士に戻すと、それぞれの選択が復元されます。';
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
  function group(classId: TrainingClass, kind: 'skill' | 'perk', label: string, values: readonly Exclude<Choice, null>[]) {
    const field = element('fieldset', 'dungeon-training-group'), legend = element('legend', '', label);
    field.append(legend);
    for (const value of [null, ...values]) {
      const definition = value ? classId === 'bastion' ? kind === 'skill' ? BASTION_SKILLS[value as BastionSkill] : BASTION_PERKS[value as BastionPerk] : kind === 'skill' ? RAVAGER_SKILLS[value as RavagerSkill] : RAVAGER_PERKS[value as RavagerPerk] : null;
      const node = element('button', 'dungeon-button dungeon-training-option'); node.type = 'button';
      node.dataset.testid = `dungeon-${classId === 'ravager' ? 'ravager-' : ''}training-${kind}-${value ?? 'none'}`;
      node.setAttribute('aria-describedby', reason.id); node.setAttribute('aria-pressed', 'false');
      node.append(element('strong', '', definition?.name ?? 'なし'), element('span', '', definition?.description ?? (kind === 'skill' ? '発動する技を装備しない' : '追加の能力補正なし')));
      node.addEventListener('click', () => {
        const actor = own(); if (!actor || actor.classId !== classId || node.disabled || signal.aborted || selectionReason()) return;
        if (classId === 'ravager') {
          const training = getRavagerTraining(actor);
          if (training[kind] !== value) send(kind === 'skill' ? { kind: 'configure-ravager-training', ...training, skill: value as RavagerSkill | null } : { kind: 'configure-ravager-training', ...training, perk: value as RavagerPerk | null }, 'selection');
        } else {
          const training = getBastionTraining(actor);
          if (training[kind] !== value) send(kind === 'skill' ? { kind: 'configure-training', ...training, skill: value as BastionSkill | null } : { kind: 'configure-training', ...training, perk: value as BastionPerk | null }, 'selection');
        }
      }, { signal });
      buttons.push({ node, classId, kind, value }); field.append(node);
    }
    choices[classId].append(field);
  }
  group('bastion', 'skill', '技 · V / タッチで発動', ['rush', 'brace']);
  group('bastion', 'perk', '特性 · 選択中は常時適用', ['vigor', 'stride']);
  group('ravager', 'skill', '技 · V / タッチで発動', ['frenzy']);
  group('ravager', 'perk', '特性 · 条件を満たす間だけ適用', ['laststand', 'followthrough']);
  function render() {
    const actor = own(), bastion = actor?.classId === 'bastion', ravager = actor?.classId === 'ravager', supported = bastion || ravager;
    root.hidden = !actor; root.dataset.class = actor?.classId ?? '';
    choices.bastion.hidden = !bastion; choices.ravager.hidden = !ravager; selection.hidden = stats.hidden = !supported;
    text(title, `${ravager ? '荒戦士' : bastion ? '城塞兵' : '役割'}の訓練 · 任意`);
    text(description, `${ravager ? '荒戦士' : bastion ? '城塞兵' : '役割ごと'}の小さな訓練。技1つ・特性1つを任意で選べます。「なし」なら従来の能力のまま。変更は補給所の準備完了前に行えます。役割ごとの選択は別々に保存されます。`);
    const blocked = selectionReason(); text(reason, blocked ?? '選択はサーバー保存後に確定します。技と特性は「なし」に戻せます。');
    const bastionTraining = actor ? getBastionTraining(actor) : { skill: null, perk: null };
    const ravagerTraining = actor ? getRavagerTraining(actor) : { skill: null, perk: null };
    const training = ravager ? ravagerTraining : bastionTraining;
    // aria-disabled during the brief request lock retains the initiating keyboard focus.
    // The click handler independently checks the lock; ready/raid/offline remain native-disabled.
    for (const button of buttons) {
      const choices = button.classId === 'ravager' ? ravagerTraining : bastionTraining;
      button.node.disabled = actor?.classId !== button.classId || !!selectionReason(false);
      button.node.setAttribute('aria-disabled', String(actor?.classId !== button.classId || !!blocked));
      button.node.setAttribute('aria-pressed', String(choices[button.kind] === button.value));
    }
    const skillLabel = ravager ? ravagerTraining.skill ? RAVAGER_SKILLS[ravagerTraining.skill].name : 'なし' : bastionTraining.skill ? BASTION_SKILLS[bastionTraining.skill].name : 'なし';
    const perkLabel = ravager ? ravagerTraining.perk ? RAVAGER_PERKS[ravagerTraining.perk].name : 'なし' : bastionTraining.perk ? BASTION_PERKS[bastionTraining.perk].name : 'なし';
    text(selection, `保存済みの選択：技 ${skillLabel} / 特性 ${perkLabel}`);
    const data = ravager ? { maxHp: CLASSES.ravager.hp, speed: CLASSES.ravager.speed } : bastionTrainingStats(bastionTraining);
    text(stats, `最大HP ${data.maxHp} · 基本移動 ${data.speed.toFixed(2)} m/秒${ravagerTraining.perk && ravager ? ` · ${RAVAGER_PERKS[ravagerTraining.perk].description}` : ''}`);
    hud.hidden = !supported || current?.phase !== 'raid' || actor?.status !== 'alive';
    skillButton.hidden = hud.hidden || !training.skill;
    if (!actor || !current) { skillButton.disabled = true; return; }
    const readout = trainingSkillReadout(actor, current.elapsed);
    const unavailable = !connected ? '接続待ち' : pending ? 'サーバーに確認中' : readout.reason;
    skillButton.disabled = !!unavailable || current.phase !== 'raid';
    text(skillName, readout.selected ? readout.label : '技なし');
    const meleeEquipped = ['sword', 'greatsword', 'dagger'].includes(actor.weapon);
    const perk = ravager && ravagerTraining.perk === 'laststand' ? ` · 背水 ${!meleeEquipped ? '剣・大剣・短剣の装備が必要' : actor.status === 'alive' && actor.hp > 0 && actor.maxHp > 0 && actor.hp <= actor.maxHp * .35 ? '発動中 · 近接×1.15' : 'HP35%以下で近接×1.15'}` : ravager && ravagerTraining.perk === 'followthrough' ? ' · 追撃：大剣の強撃後硬直20%短縮' : '';
    text(hud, `${readout.label} · ${unavailable ?? '使用可能 · V / 技ボタン'}${perk}`);
    hud.dataset.state = !connected ? 'disconnected' : pending ? 'pending' : readout.active ? 'active' : readout.remaining > 0 ? 'cooldown' : readout.ready ? 'ready' : 'unavailable';
    hud.dataset.class = actor.classId;
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
