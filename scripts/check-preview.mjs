// GitHub Actions only: discover the actual Cloudflare bot URL, then match source SHA.
import { appendFileSync } from 'node:fs';
const repo = process.env.GITHUB_REPOSITORY;
const pr = process.env.PR_NUMBER;
const expected = process.env.EXPECTED_COMMIT;
if (repo !== 'usks213/threejs-game' || !/^\d+$/.test(pr ?? '') || !/^[a-f0-9]{40}$/.test(expected ?? '') || !process.env.GITHUB_TOKEN || !process.env.GITHUB_ENV) throw new Error('Missing or invalid preview verification context');
for (let attempt = 1; attempt <= 40; attempt++) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=100`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Comment lookup returned ${response.status}`);
    const comments = await response.json();
    const candidates = [];
    for (const comment of comments) {
      if (comment.user?.login !== 'cloudflare-workers-and-pages[bot]') continue;
      const links = String(comment.body).match(/https:\/\/[a-z0-9-]+\.usks213\.workers\.dev/g) ?? [];
      for (const link of links) {
        const url = new URL(link);
        if (url.hostname.endsWith('-threejs-game.usks213.workers.dev') && !candidates.includes(url.origin)) candidates.push(url.origin);
      }
    }
    for (const origin of candidates.reverse()) {
      const response = await fetch(`${origin}/deployment.json?commit=${expected}`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!response.ok) continue;
      const manifest = await response.json();
      if (manifest.application === 'threejs-game' && manifest.commit === expected) {
        appendFileSync(process.env.GITHUB_ENV, `E2E_BASE_URL=${origin}\n`);
        console.log(`Verified Preview ${origin} at commit ${expected}`); process.exit(0);
      }
    }
    console.log(`Preview check ${attempt}/40: waiting for the exact commit`);
  } catch (error) { console.log(`Preview check ${attempt}/40: ${error instanceof Error ? error.message : String(error)}`); }
  if (attempt < 40) await new Promise(resolve => setTimeout(resolve, 15000));
}
throw new Error('Cloudflare Preview for this PR commit was not verified');
