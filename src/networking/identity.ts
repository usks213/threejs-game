export function dedicatedIdentity(endpoint: string): string {
  const key = 'survival-player:' + new URL(endpoint).origin;
  const stored = localStorage.getItem(key);
  if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(key, token);
  return token;
}
