import { BIOMES, BOSSES, BUILDINGS, ITEM_NAMES, RECIPES, SPELLS, WEAPONS } from '../content/catalog';
import type { AdventureSnapshot, GameAction } from '../game/types';
export function adventureUI(signal: AbortSignal, action: (action: GameAction, id?: string) => void, selectBuilding: (id: string) => void) {
 const hud = document.querySelector<HTMLElement>('#adventure-hud')!, panel = document.querySelector<HTMLElement>('#adventure-panel')!, content = document.querySelector<HTMLElement>('#adventure-content')!;
 let latest: AdventureSnapshot | null = null, tab = 'bag', signature = '';
 const label = (cost: Record<string, number>) => Object.entries(cost).map(([id, n]) => `${ITEM_NAMES[id]}${n}`).join(' · ');
 const button = (name: string, kind: string, id = '') => `<button type="button" data-game-action="${kind}" data-id="${id}">${name}</button>`;
 const render = () => {
  const s = latest; if (!s || panel.hidden) return;
  const next = tab + JSON.stringify([s.inventory, s.equipment, s.unlocked, s.defeated]); if (next === signature) return; signature = next;
  if (tab === 'bag') content.innerHTML = `<p>${Object.entries(s.inventory).filter(([, n]) => n > 0).map(([id, n]) => `${ITEM_NAMES[id]} ×${n}`).join(' ／ ') || '素材を集めましょう'}</p><p>装備：${ITEM_NAMES[s.equipment] ?? '素手'}</p>${Object.keys(s.inventory).filter(id => s.inventory[id] > 0 && WEAPONS[id]).map(id => button(`${ITEM_NAMES[id]}を装備`, 'equip', id)).join('')}${button('食べる', 'eat')}${button('箱へ預ける／取り出す', 'chest')}`;
  if (tab === 'craft') content.innerHTML = RECIPES.filter(r => r.tier <= s.unlocked).map(r => `<article><strong>${r.name}</strong><p>${label(r.cost)}${r.station ? ' ／ 作業台の近く' : ''}</p>${button('作る', 'craft', r.id)}</article>`).join('');
  if (tab === 'build') content.innerHTML = `<p>部品を選び、地面に照準を合わせ「設置」を押す。床や柱を積む場合は既存部品を照準に合わせます。</p>${BUILDINGS.map(b => `<article><strong>${b.name}</strong><p>${label(b.cost)}</p>${button('配置する', 'place', b.id)}</article>`).join('')}${button('近くの建物を解体', 'remove')}${button('寝床と焚き火で休む', 'rest')}${button('転移門を使う', 'portal')}`;
  if (tab === 'magic') content.innerHTML = `<p>作業台で杖を作ると使用できます。</p>${SPELLS.map(sp => `<article><strong>${sp.name}</strong><p>魔力 ${sp.mana}</p>${button('使う', 'spell', sp.id)}</article>`).join('')}`;
  if (tab === 'world') content.innerHTML = `<p>${s.objective}</p>${BIOMES.map(b => `<article><strong>${b.name} / Tier ${b.tier}</strong><p>ボス：${BOSSES.find(v => v.id === b.boss)!.name}${s.defeated.includes(b.boss) ? ' 攻略済み' : ''}</p>${button(b.tier <= s.unlocked ? '地域へ移動' : '前のボスで解放', 'travel', b.id)}</article>`).join('')}${button('祭壇でボス召喚', 'summon')}<p>祭壇は各地域の中心から北へ14m。木材・樹脂や地域の素材を供えます。倒れると寝床から復活。装備は保持し、素材の20%は墓標で回収できます。転移門は設置順に二つずつ接続されます。</p>`;
 };
 document.querySelector('#adventure-menu')!.addEventListener('click', () => { panel.hidden = !panel.hidden; signature = ''; render(); }, { signal });
 document.querySelector('#adventure-close')!.addEventListener('click', () => { panel.hidden = true; }, { signal });
 panel.addEventListener('click', event => {
  const b = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b) return;
  if (b.dataset.tab) { tab = b.dataset.tab; signature = ''; render(); }
  if (b.dataset.gameAction === 'place') { selectBuilding(b.dataset.id!); panel.hidden = true; }
  else if (b.dataset.gameAction) { action(b.dataset.gameAction as GameAction, b.dataset.id); if (b.dataset.gameAction === 'spell' || b.dataset.gameAction === 'travel') panel.hidden = true; }
 }, { signal });
 return { update(s: AdventureSnapshot, player: { x: number; z: number }) {
  latest = s; const weather: Record<string, string> = { clear: '晴れ', cloud: '曇り', rain: '雨', storm: '雷雨', snow: '雪', fog: '霧', magic: '魔力嵐' };
  const biome = BIOMES.find(b => b.id === s.biome)!;
  const nearest = s.resources.filter(n => n.ready <= s.seconds).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
  hud.innerHTML = `<div>${biome.name} · ${s.environment.day}日目 ${Math.floor(s.environment.hour).toString().padStart(2, '0')}:${Math.floor(s.environment.hour % 1 * 60).toString().padStart(2, '0')} · ${weather[s.environment.weather]}${s.wet ? ' · 水中' : ''}</div><div class="vitals"><span>♥ ${Math.ceil(s.health)}</span><span>体力 ${Math.floor(s.stamina)}</span><span>魔力 ${Math.floor(s.mana)}</span></div><small>${ITEM_NAMES[s.equipment] ?? '素手'} · 攻略 ${s.defeated.length}/5${s.guarding ? ' · ガード中' : ''}</small>${nearest ? `<div>近くの${ITEM_NAMES[nearest.kind]} · ${Math.round(Math.hypot(nearest.x - player.x, nearest.z - player.z))}m</div>` : ''}`;
  render();
 } };
}

