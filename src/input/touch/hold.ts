/** Pointer capture keeps a held ability working while the other finger moves the stick. */
export function holdAction(button: HTMLButtonElement, action: () => void, repeat: () => boolean, signal: AbortSignal): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => { clearInterval(timer); timer = undefined; button.classList.remove('held'); };
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    event.preventDefault(); stop(); button.setPointerCapture(event.pointerId); button.classList.add('held'); action();
    timer = setInterval(() => { if (repeat()) action(); }, 120);
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, stop, { signal });
  window.addEventListener('blur', stop, { signal }); window.addEventListener('resize', stop, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal });
  button.addEventListener('click', event => { if (event.detail === 0 && !button.disabled) action(); }, { signal });
  signal.addEventListener('abort', stop, { once: true });
}
