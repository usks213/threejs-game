import { createHash } from 'node:crypto';

// The random capability stays on the client. Saves and snapshots contain only its hash.
export function playerIdentity(token: unknown, sessionId: string): string {
  if (token === undefined) return sessionId; // Older clients remain session-scoped.
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid player credential');
  return createHash('sha256').update(token).digest('hex');
}
