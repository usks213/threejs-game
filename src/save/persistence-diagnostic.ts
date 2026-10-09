/** Public failure diagnostics are bounded enums, never exception text or saved data. */
export const PERSISTENCE_PHASES=['checkpoint','encode-checkpoint','encode-access','transaction-open','transaction-read','transaction-write','transaction-pointers','transaction-cleanup','transaction-commit','record-revision','queue'] as const;
export type PersistencePhase=typeof PERSISTENCE_PHASES[number];
export const PERSISTENCE_CATEGORIES=['limit','storage-full','storage-busy','value-size','overloaded','timeout','unknown'] as const;
export type PersistenceCategory=typeof PERSISTENCE_CATEGORIES[number];
export interface PersistenceDiagnostic {phase:PersistencePhase;category:PersistenceCategory}
function category(error:unknown):PersistenceCategory{
 try{
  if(!(error instanceof Error))return 'unknown';
  if((error as Error&{overloaded?:unknown}).overloaded===true)return 'overloaded';
  const text=error.message.slice(0,1024);
  if(/\bSQLITE_FULL\b/.test(text))return 'storage-full';
  if(/\bSQLITE_(BUSY|LOCKED)\b/.test(text))return 'storage-busy';
  if(/\bSQLITE_TOOBIG\b/.test(text))return 'value-size';
  if(error.name==='QuotaExceededError'||text==='Save queue is full')return 'limit';
  if(/^Durable Object storage operation exceeded timeout\b/.test(text))return 'timeout';
 }catch{/* Exception getters are not trusted diagnostics. */}
 return 'unknown';
}
export class PersistenceFailure extends Error{
 readonly diagnostic:PersistenceDiagnostic;
 constructor(phase:PersistencePhase,error:unknown){super('Shared persistence failed',{cause:error});this.name='PersistenceFailure';this.diagnostic={phase,category:category(error)};}
}
export function persistenceDiagnostic(error:unknown):PersistenceDiagnostic{return error instanceof PersistenceFailure?error.diagnostic:{phase:'queue',category:category(error)};}
export function formatPersistenceDiagnostic(value:unknown):string{
 try{const d=value as PersistenceDiagnostic,phase=d?.phase,category=d?.category;if(PERSISTENCE_PHASES.includes(phase)&&PERSISTENCE_CATEGORIES.includes(category))return phase+'/'+category;}catch{/* Never let diagnostic formatting interrupt fail-closed shutdown. */}
 return 'unknown/unknown';
}
