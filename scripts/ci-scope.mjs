// Classify the pushed changes, not the entire accumulated feature branch.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const head = process.env.CHECKED_OUT_SHA;
if (!/^[a-f0-9]{40}$/.test(head ?? '')) throw new Error('Invalid checkout SHA');
let base = event.before;
if (!/^[a-f0-9]{40}$/.test(base ?? '') || /^0+$/.test(base)) base = event.pull_request?.base?.sha;
let paths;
if (base && /^[a-f0-9]{40}$/.test(base)) {
  // Fail instead of silently skipping checks when the change range is unavailable.
  paths = execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).trim().split('\n');
} else paths = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n');
const changed = pattern => paths.some(path => pattern.test(path));
const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
const config = changed(/^(package(-lock)?\.json|tsconfig.*\.json|vite\.config\.ts)$/);
const game = config || changed(/^(src\/|public\/|index\.html$|wrangler\.jsonc$|scripts\/deploy-preview\.mjs$)/);
const signaling = manual || config || changed(/^apps\/signaling\//);
const network = manual || config || changed(/^(src\/networking\/|src\/platform\/network\.ts$|src\/simulation\/(session|protocol)\.ts$|apps\/(dedicated|signaling)\/|tests\/unit\/(dedicated|session)\.test\.ts$|tests\/e2e\/network\.spec\.ts$)/);
const host = manual || config || changed(/^(src\/networking\/|src\/platform\/network\.ts$|src\/simulation\/(session|protocol)\.ts$|apps\/signaling\/|tests\/e2e\/network\.spec\.ts$)/);
const checks = manual || game || signaling || network || changed(/^tests\/unit\//);
const patterns = new Set();
if (config || changed(/^(index\.html$|src\/main\.ts$|tests\/e2e\/game\.spec\.ts$)/)) patterns.add('core landscape');
if (changed(/^src\/(input\/|platform\/game\.ts$|physics\/character\.ts$)/)) { patterns.add('starts, moves'); patterns.add('two fingers'); }
if (changed(/^src\/(world\/|fluid\/|save\/|simulation\/(game-simulation|worker)\.ts$)/)) {patterns.add('water is always available');patterns.add('core landscape');patterns.add('renders equipped');}
if (changed(/^src\/(game\/|content\/|ui\/)/)) patterns.add('survival adventure');
if (changed(/^src\/rendering\//)) patterns.add('renders equipped');
const outputs = { game: manual || game, checks, signaling, network, host, browser: patterns.size > 0, browser_grep: [...patterns].join('|') };
for (const [key, value] of Object.entries(outputs)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
console.log(JSON.stringify({ changedFiles: paths.length, ...outputs }));
