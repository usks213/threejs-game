export function gameShell(signal: AbortSignal): void {
  const panel = document.querySelector<HTMLElement>('#system-panel')!;
  const toggle = document.querySelector<HTMLButtonElement>('#system-menu')!;
  const setOpen = (open: boolean) => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', () => setOpen(panel.hidden), { signal });
  document.querySelector('#system-close')!.addEventListener('click', () => setOpen(false), { signal });
  const more = document.querySelector<HTMLButtonElement>('#combat-more')!, extra = document.querySelector<HTMLElement>('#combat-extra')!;
  more.addEventListener('click', () => { extra.hidden = !extra.hidden; more.setAttribute('aria-expanded', String(!extra.hidden)); }, { signal });
  extra.addEventListener('click', event => { if ((event.target as HTMLElement).closest('button')) { extra.hidden = true; more.setAttribute('aria-expanded', 'false'); } }, { signal });
}
