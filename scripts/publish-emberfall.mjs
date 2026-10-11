// Upload a version of the EXISTING static Worker. Never switch production traffic.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const sha = process.env.EXPECTED_COMMIT;
if (account !== 'c3ca485329f03044432fbd5164083278' || process.env.PR_NUMBER !== '6' || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Unexpected preview context');
if (!token) throw new Error('Existing CLOUDFLARE_API_TOKEN is unavailable; no login or new resource will be created.');
const manifest = JSON.parse(readFileSync('dist/deployment.json', 'utf8'));
if (manifest.application !== 'threejs-game' || manifest.commit !== sha) throw new Error('Artifact SHA mismatch');
const config = JSON.parse(readFileSync('wrangler.emberfall.jsonc', 'utf8'));
if (config.name !== 'threejs-game' || Object.keys(config).some(k => !['name','compatibility_date','assets'].includes(k))) throw new Error('Only existing static Worker is allowed');
const deploymentsUrl = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/threejs-game/deployments`;
async function production() {
  const response = await fetch(deploymentsUrl, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Cannot verify current production deployment (${response.status}); upload stopped.`);
  const result = await response.json();
  if (!result.success || (!Array.isArray(result.result?.deployments) || result.result.deployments.length === 0)) throw new Error('Unexpected production deployment response');
  return JSON.stringify(result.result.deployments.map(d => ({ id: d.id, versions: d.versions })).sort((a,b) => String(a.id).localeCompare(String(b.id))));
}
const before = await production();
const output = spawnSync('npx', ['--yes','wrangler@4.147.0','versions','upload','--config','wrangler.emberfall.jsonc','--preview-alias','pr-6-emberfall','--keep-vars','--strict'], { encoding:'utf8', timeout:300000, maxBuffer:5*1024*1024, env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'} });
if (output.error || output.status !== 0) { console.error(output.stderr || output.stdout || output.error?.message); throw new Error('Existing Worker version upload failed'); }
const after = await production();
if (before !== after) throw new Error('Production deployment changed during upload; investigate before claiming isolation.');
const urls = [...(output.stdout.match(/https:\/\/[-a-z0-9.]+\.workers\.dev/g) ?? [])];
const candidates = [...new Set(urls)].filter(value => { const url = new URL(value); return url.protocol === 'https:' && url.hostname.endsWith('-threejs-game.usks213.workers.dev'); });
const url = candidates.find(u => u.includes('pr-6-emberfall-')) ?? candidates[0];
if (!url) { console.error(output.stdout); throw new Error('Wrangler returned no existing-Worker version URL; no URL was guessed.'); }
let verified = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try { const r = await fetch(`${url}/deployment.json?sha=${sha}`, { cache:'no-store', signal:AbortSignal.timeout(10000) }); const body = await r.json(); if (r.ok && body.commit === sha && body.application === 'threejs-game') { verified = true; break; } } catch { /* wait for asset propagation */ }
  await new Promise(resolve => setTimeout(resolve,5000));
}
if (!verified) throw new Error('Uploaded URL does not serve expected SHA');
const html = await fetch(url, { signal:AbortSignal.timeout(10000) }).then(r => r.text());
if (!html.includes('Emberfall') || !html.includes('type="module"')) throw new Error('Published game HTML missing');
writeFileSync('preview-release.json', JSON.stringify({ url, commit:sha, pullRequest:6, worker:'threejs-game', mode:'version-upload-only', productionUnchanged:true }));
console.log(`Preview URL: ${url}\nPublished commit: ${sha}\nProduction deployment unchanged.`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Emberfall preview\n\n[Play](${url})\n\nVerified SHA: ${sha}\n\nProduction deployment unchanged.\n`);
