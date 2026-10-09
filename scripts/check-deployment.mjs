// Run in GitHub Actions after main's CI. No Cloudflare token is needed.
const base = new URL('https://threejs-game.usks213.workers.dev');
const expected = process.env.GITHUB_SHA;
if (!expected || !/^[a-f0-9]{40}$/.test(expected)) {
  throw new Error('GITHUB_SHA must identify the exact expected source commit.');
}
let detail = 'No response received';
for (let attempt = 1; attempt <= 40; attempt++) {
  try {
    const manifest = new URL('/deployment.json', base);
    manifest.searchParams.set('commit', expected);
    const response = await fetch(manifest, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Version endpoint returned HTTP ${response.status}`);
    const version = await response.json();
    if (version.application !== 'threejs-game' || version.commit !== expected) {
      throw new Error(`Expected ${expected}, received ${version.commit ?? 'unknown version'}`);
    }
    const page = await fetch(base, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!page.ok) throw new Error(`Game page returned HTTP ${page.status}`);
    const html = await page.text();
    if (!html.includes('id="game"') || !html.includes('id="move-pad"')) {
      throw new Error('The deployed page does not contain the game and touch controls.');
    }
    console.log(`Verified deployed commit ${expected} at ${base.origin}`);
    process.exit(0);
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
    console.log(`Deployment check ${attempt}/40: ${detail}`);
  }
  if (attempt < 40) await new Promise(resolve => setTimeout(resolve, 15000));
}
throw new Error(`Deployment was not verified. Check Cloudflare Git connection, branch main, build command npm run build, and deploy command npx wrangler deploy. Last result: ${detail}`);
