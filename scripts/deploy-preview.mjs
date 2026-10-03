// GitHub Actions: deploy the already verified artifact; never log credentials.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const pr = process.env.PR_NUMBER;
const expected = process.env.EXPECTED_COMMIT;
if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('Add CLOUDFLARE_API_TOKEN to this repository Actions secrets, then rerun only deploy-preview.');
if (process.env.CLOUDFLARE_ACCOUNT_ID !== 'c3ca485329f03044432fbd5164083278' || !/^\d+$/.test(pr ?? '') || !/^[a-f0-9]{40}$/.test(expected ?? '')) throw new Error('Invalid deployment context');
const manifest = JSON.parse(readFileSync('dist/deployment.json', 'utf8'));
if (manifest.application !== 'threejs-game' || manifest.commit !== expected) throw new Error('Build artifact does not match the requested commit');
const result = spawnSync('npx', ['--yes', 'wrangler@4.147.0', 'preview', '--name', `pr-${pr}`, '--json'], { encoding: 'utf8', timeout: 300000, maxBuffer: 5 * 1024 * 1024, env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' } });
if (result.error || result.status !== 0) {
  console.error(result.stderr || result.stdout || result.error?.message);
  throw new Error('Cloudflare Preview deployment failed');
}
// Wrangler may print asset-upload progress before its JSON result.
function parseRelease(output) {
  for (let start = output.indexOf('{'); start >= 0; start = output.indexOf('{', start + 1)) {
    let depth = 0, quoted = false, escaped = false;
    for (let end = start; end < output.length; end++) {
      const ch = output[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === String.fromCharCode(92)) escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          const value = JSON.parse(output.slice(start, end + 1));
          if (Array.isArray(value.preview?.urls)) return value;
        } catch { /* Progress output is not JSON. */ }
        break;
      }
    }
  }
  console.error(output);
  throw new Error('Wrangler did not return a readable Preview release');
}
const release = parseRelease(result.stdout);
const candidate = release.preview?.urls?.[0];
if (typeof candidate !== 'string') throw new Error('Wrangler did not return a Preview URL');
const url = new URL(candidate);
if (url.protocol !== 'https:' || !url.hostname.endsWith('-threejs-game.usks213.workers.dev') || url.username || url.password) throw new Error('Unexpected Cloudflare Preview origin');
let confirmed = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await fetch(`${url.origin}/deployment.json?commit=${expected}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const deployed = await response.json();
      if (deployed.application === 'threejs-game' && deployed.commit === expected) { confirmed = true; break; }
    }
  } catch { /* Short propagation delay; deployment errors still fail below. */ }
  if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 5000));
}
if (!confirmed) throw new Error('The Preview URL did not serve the requested commit');
const record = { url: url.origin, commit: expected, pullRequest: Number(pr) };
writeFileSync('preview-release.json', JSON.stringify(record));
console.log(`Preview URL: ${url.origin}`);
console.log(`Published commit: ${expected}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Play this Preview\n\n[Open game](${url.origin})\n\nSource: ${expected}\n`);
