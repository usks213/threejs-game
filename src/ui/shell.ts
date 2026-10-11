import {modalNavigation} from './modal-navigation';
export function gameShell(signal: AbortSignal): void {
  modalNavigation(signal);
  const version=document.querySelector<HTMLElement>('#build-version');
  void fetch(new URL('deployment.json',location.href),{cache:'no-store',signal}).then(r=>r.ok?r.json():null).then((release:unknown)=>{
    if(signal.aborted||!version)return;
    const data=release as {application?:string;commit?:string}|null;
    if(data?.application==='threejs-game'&&typeof data.commit==='string'&&/^[a-f0-9]{40}$/.test(data.commit)){version.textContent='公開ビルド '+data.commit.slice(0,7);version.dataset.commit=data.commit;}else version.textContent='ローカルビルド';
  }).catch(()=>{if(!signal.aborted&&version)version.textContent='ビルド情報を取得できません';});
  const panel = document.querySelector<HTMLElement>('#system-panel')!;
  const toggle = document.querySelector<HTMLButtonElement>('#system-menu')!;
  const setOpen = (open: boolean) => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', () => setOpen(panel.hidden), { signal });
  document.querySelector('#system-close')!.addEventListener('click', () => setOpen(false), { signal });
  const more = document.querySelector<HTMLButtonElement>('#combat-more')!, extra = document.querySelector<HTMLElement>('#combat-extra')!;
  more.addEventListener('click', () => { extra.hidden = !extra.hidden; more.setAttribute('aria-expanded', String(!extra.hidden)); }, { signal });
  extra.addEventListener('click', event => { if ((event.target as HTMLElement).closest('button')) { extra.hidden = true; more.setAttribute('aria-expanded', 'false'); } }, { signal });
}
