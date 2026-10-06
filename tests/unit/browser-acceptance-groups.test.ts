import {it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const groups=JSON.parse(readFileSync('scripts/browser-acceptance-groups.json','utf8')) as Record<string,{files:string[];grep?:string}>;
const matrix=[...readFileSync('.github/workflows/ci.yml','utf8').matchAll(/^ {12}group: (.+)$/gm)].map(m=>m[1]);
it('routes each non-prototype browser file exactly once per platform, including independently gated paths',()=>{const files=readdirSync('tests/e2e').filter(f=>f.endsWith('.spec.ts'));for(const platform of ['desktop','android']){const selected=matrix.filter(g=>g.startsWith(platform+'-')).map(g=>groups[g.slice(platform.length+1)]);expect(selected.every(Boolean)).toBe(true);for(const file of files){if(file==='prototype.spec.ts')continue;const count=selected.filter(g=>g.files.includes(file)).length;expect(count,file+' / '+platform).toBe(['campaign-progression.spec.ts','campaign-regional-playthrough.spec.ts','campaign-touch-controls.spec.ts','campaign-combat-builds.spec.ts','streamed-campaign.spec.ts','cooperation.spec.ts','native-pointer.spec.ts'].includes(file)?0:1);}}});
it('covers every prototype title once without matching campaign titles containing desktop or landscape',()=>{const titles=[...readFileSync('tests/e2e/prototype.spec.ts','utf8').matchAll(/^test\('([^']+)'/gm)].map(m=>m[1]);for(const platform of ['desktop','android'])for(const title of titles){const count=matrix.filter(g=>g.startsWith(platform+'-')).map(g=>groups[g.slice(platform.length+1)]).filter(g=>g.files.includes('prototype.spec.ts')&&(!g.grep||new RegExp(g.grep).test(title))).length;expect(count,platform+' / '+title).toBe(1);}expect(groups.chromium.files).toEqual(['prototype.spec.ts']);});

it('runs each long ranged build in an independent job without sharing one job deadline',()=>{const workflow=readFileSync('.github/workflows/ci.yml','utf8');expect(workflow).toContain('build: [bow, staff]');expect(workflow).toContain('tests/e2e/campaign-combat-builds.spec.ts --project=');expect(workflow).toContain('--grep="Q03 ${{ matrix.build }}:"');});

it('runs the Android contact preflight before its independent full campaign route',()=>{const workflow=readFileSync('.github/workflows/ci.yml','utf8'),job=workflow.split('  regional-campaign-android-browser:')[1]?.split('  streamed-world-browser:')[0];expect(job).toBeTruthy();const preflight=job.indexOf('tests/e2e/campaign-touch-controls.spec.ts --project=android-chromium'),campaign=job.indexOf('tests/e2e/campaign-regional-playthrough.spec.ts --project=android-chromium');expect(preflight).toBeGreaterThanOrEqual(0);expect(campaign).toBeGreaterThan(preflight);expect(job).not.toContain('continue-on-error');});

it('routes native pointer acceptance once to an isolated headed desktop job',()=>{
 const workflow=readFileSync('.github/workflows/ci.yml','utf8'),job=workflow.match(/^  native-pointer-browser:\n([\s\S]*?)(?=^  [a-z][a-z-]*:|$(?![\s\S]))/m)?.[1];
 expect(job).toBeDefined();expect(job).toContain('needs: verify');expect(job).toContain("E2E_NATIVE_MOUSE: '1'");
 expect(job).toContain('xvfb-run --auto-servernum');expect(job).toContain('xdpyinfo -queryExtensions | grep -w XTEST');
 expect(job).toContain('tests/e2e/native-pointer.spec.ts --project=desktop-chromium --headed --workers=1 --retries=0');
 expect(workflow.match(/tests\/e2e\/native-pointer\.spec\.ts/g)).toHaveLength(1);
 expect(workflow.match(/E2E_NATIVE_MOUSE:/g)).toHaveLength(1);
});
