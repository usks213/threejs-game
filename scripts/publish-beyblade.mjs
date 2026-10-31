// PR7-only, free-account deployment. Never changes subscriptions or production.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const account = 'c3ca485329f03044432fbd5164083278';
const worker = 'threejs-game-beyblade-pr7';
const expected = process.env.EXPECTED_COMMIT;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token || !/^[0-9a-f]{40}$/.test(expected ?? '')) throw new Error('Missing existing Cloudflare credential or exact commit.');
if (execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim() !== expected) throw new Error('Checkout differs from approved CI commit.');
const manifest=JSON.parse(readFileSync('dist/deployment.json','utf8'));
if(manifest.commit!==expected) throw new Error('Build differs from tested commit.');
const config=JSON.parse(readFileSync('wrangler.beyblade.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''));
if(config.name!==worker || config.routes || config.route || config.env || config.account_id && config.account_id!==account) throw new Error('Dedicated-worker isolation check failed.');
if(JSON.stringify(config.durable_objects)!==JSON.stringify({bindings:[{name:'ARENA',class_name:'BeybladeArena'}]})) throw new Error('Unexpected resource bindings.');
if(config.migrations?.some(m=>m.new_classes || m.transferred_classes || m.deleted_classes)) throw new Error('Only independent SQLite migration is permitted.');
async function api(path){
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
 if(!r.ok) throw new Error(`Read-only Cloudflare check ${path.split('?')[0]} failed HTTP ${r.status}; no permission expansion or deployment.`);
 const j=await r.json();if(j.success!==true)throw new Error('Cloudflare read check failed; no deployment.');return j;
}
// Workers defaults to Free without a paid subscription. Fail closed on ANY active
// subscription or unknown schema rather than guessing from usage_model='standard'.
// Docs: developers.cloudflare.com/api/resources/accounts/ and /workers/platform/pricing/.
const subscriptions=[];
for(let page=1;page<=100;page++){
 const j=await api(`subscriptions?page=${page}&per_page=50`);
 if(!Array.isArray(j.result))throw new Error('Unrecognized subscription response; cannot establish free account.');
 subscriptions.push(...j.result);
 const info=j.result_info;
 if(info?.total_pages!==undefined){if(!Number.isInteger(info.total_pages)||info.total_pages>100)throw new Error('Subscription pagination unverified.');if(page>=info.total_pages)break;}
 else if(j.result.length<50)break;
 if(page===100)throw new Error('Subscription listing incomplete.');
}
const active=subscriptions.filter(s=>!['Cancelled','Expired','Failed'].includes(s.state));
if(active.length)throw new Error('Account has active or unknown subscriptions. Free-only billing condition cannot be proven; deployment stopped. No plan changed.');
const before=(await api('workers/scripts/threejs-game/deployments')).result;
const domain=(await api('workers/subdomain')).result?.subdomain;
if(typeof domain!=='string'||!/^[a-z0-9-]+$/.test(domain))throw new Error('Existing workers.dev subdomain unavailable; will not create one.');
console.log('Free-only preflight passed: complete account subscription list has no active subscriptions. Production snapshot recorded.');
execFileSync('npx',['--no-install','wrangler','deploy','--config','wrangler.beyblade.jsonc'],{stdio:'inherit',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account,CI:'true',WRANGLER_SEND_METRICS:'false'}});
const after=(await api('workers/scripts/threejs-game/deployments')).result;
if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Production snapshot changed. Investigate concurrent changes; do not claim isolation success.');
const base=`https://${worker}.${domain}.workers.dev`;
let ok=false;
for(let i=0;i<24;i++){
 try{const r=await fetch(`${base}/deployment.json?commit=${expected}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});const j=await r.json();if(r.ok&&j.commit===expected){const h=await fetch(`${base}/api/beyblade/health`,{signal:AbortSignal.timeout(10000)});if(h.ok&&(await h.json()).service==='beyblade-authoritative'){ok=true;break;}}}catch{}
 await new Promise(r=>setTimeout(r,5000));
}
if(!ok)throw new Error('Upload returned, but exact deployed SHA/health not verified. Do not repeat deploy blindly.');
writeFileSync('beyblade-release.json',JSON.stringify({commit:expected,playUrl:`${base}/beyblade/`,health:`${base}/api/beyblade/health`,productionUnchanged:true,freePlanEvidence:'Complete account subscriptions read: no active subscriptions',verifiedAt:new Date().toISOString()},null,2));
console.log(`Exact PR7 deployment verified: ${base}/beyblade/ (${expected}). Gameplay verification is separate.`);
