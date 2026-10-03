// Trigger on contact: a second finger must not depend on a compatibility click.
export function actionInput(button: HTMLButtonElement, action: () => void, signal: AbortSignal): void {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    event.preventDefault();
    action();
  }, { signal });
  // Keyboard and assistive activation have no pointer contact (detail === 0).
  button.addEventListener('click', event => {
    if (event.detail === 0 && !button.disabled) action();
  }, { signal });
}
