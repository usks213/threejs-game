import { validateSave, type WorldSave } from './format';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('threejs-survival-phase0', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('worlds');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadWorld(): Promise<WorldSave | null> {
  const db = await database();
  try {
    const raw = await new Promise<unknown>((resolve, reject) => { const request = db.transaction('worlds').objectStore('worlds').get('single-player'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return raw === undefined ? null : validateSave(raw);
  } finally { db.close(); }
}
export async function saveWorld(save: WorldSave): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('worlds', 'readwrite'); transaction.objectStore('worlds').put(save, 'single-player');
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
