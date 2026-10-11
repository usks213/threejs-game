/** Opaque generations identify completed durable saves, never simulation ticks. */
export function isSavedRevision(value:unknown):value is string{return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);}
export function shortSavedRevision(value:string):string{return value.length>12?value.slice(0,12):value;}
