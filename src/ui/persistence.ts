import { loadWorld, saveWorld } from '../save/storage';
import { validateSave, type WorldSave } from '../save/format';
import type { ClientMessage } from '../simulation/protocol';
export function persistenceUI(send: (message: ClientMessage) => void, signal: AbortSignal, notice: (message: string) => void) {
  const status = document.querySelector<HTMLElement>('#save-status')!;
  let exportNext = false, last: WorldSave | null = null, writes: Promise<void> = Promise.resolve();
  const write = (save: WorldSave) => {
    last = save;
    writes = writes.then(() => saveWorld(save)).then(() => { status.textContent = `保存済み · 編集 ${save.edits.length}`; status.dataset.edits = String(save.edits.length); }).catch(() => { status.textContent = '保存できません。書出でバックアップしてください'; });
  };
  document.querySelector('#save')!.addEventListener('click', () => send({ type: 'save' }), { signal });
  document.querySelector('#export')!.addEventListener('click', () => { exportNext = true; send({ type: 'save' }); }, { signal });
  const file = document.querySelector<HTMLInputElement>('#import-file')!;
  document.querySelector('#import')!.addEventListener('click', () => file.click(), { signal });
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; if (!selected) return;
    try {
      if (selected.size > 1024 * 1024) throw new Error('セーブファイルが大きすぎます');
      const save = validateSave(JSON.parse(await selected.text()));
      if (signal.aborted) return;
      send({ type: 'init', save }); write(save); notice('セーブを読み込みました');
    } catch (error) { notice(error instanceof Error ? error.message : '読込に失敗しました'); }
    file.value = '';
  }, { signal });
  const timer = window.setInterval(() => { if (!document.hidden) send({ type: 'save' }); }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (last) write(last); send({ type: 'save' }); } }, { signal });
  signal.addEventListener('abort', () => { clearInterval(timer); if (last) write(last); }, { once: true });
  return {
    async load() { try { return await loadWorld(); } catch { status.textContent = '保存データを読めません。新しい試作を開始'; return null; } },
    receive(save: WorldSave) {
      write(save);
      if (exportNext) {
        exportNext = false;
        const url = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'terra-world-7319.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        notice('セーブを書き出しました');
      }
    },
  };
}
