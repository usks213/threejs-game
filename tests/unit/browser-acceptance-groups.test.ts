import {it,expect} from 'vitest';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {delimiter,join} from 'node:path';
const groups=JSON.parse(readFileSync('scripts/browser-acceptance-groups.json','utf8')) as Record<string,{files:string[];grep?:string}>;
const matrix=[...readFileSync('.github/workflows/ci.yml','utf8').matchAll(/^ {12}group: (.+)$/gm)].map(m=>m[1]);
it('routes each non-prototype browser file exactly once per platform, including independently gated paths',()=>{const files=readdirSync('tests/e2e').filter(f=>f.endsWith('.spec.ts'));for(const platform of ['desktop','android']){const selected=matrix.filter(g=>g.startsWith(platform+'-')).map(g=>groups[g.slice(platform.length+1)]);expect(selected.every(Boolean)).toBe(true);for(const file of files){if(file==='prototype.spec.ts')continue;const count=selected.filter(g=>g.files.includes(file)).length;expect(count,file+' / '+platform).toBe(['campaign-progression.spec.ts','campaign-regional-playthrough.spec.ts','campaign-touch-controls.spec.ts','campaign-combat-builds.spec.ts','streamed-campaign.spec.ts','cooperation.spec.ts','native-pointer.spec.ts','dungeon.spec.ts','dungeon-input.spec.ts','dungeon-resupply.spec.ts','dungeon-raid.spec.ts','dungeon-pending-return.spec.ts'].includes(file)?0:1);}}});
it('covers every prototype title once without matching campaign titles containing desktop or landscape',()=>{const titles=[...readFileSync('tests/e2e/prototype.spec.ts','utf8').matchAll(/^test\('([^']+)'/gm)].map(m=>m[1]);for(const platform of ['desktop','android'])for(const title of titles){const count=matrix.filter(g=>g.startsWith(platform+'-')).map(g=>groups[g.slice(platform.length+1)]).filter(g=>g.files.includes('prototype.spec.ts')&&(!g.grep||new RegExp(g.grep).test(title))).length;expect(count,platform+' / '+title).toBe(1);}expect(groups.chromium.files).toEqual(['prototype.spec.ts']);});

it('runs each long ranged build in an independent job without sharing one job deadline',()=>{const workflow=readFileSync('.github/workflows/ci.yml','utf8');expect(workflow).toContain('build: [bow, staff]');expect(workflow).toContain('tests/e2e/campaign-combat-builds.spec.ts --project=');expect(workflow).toContain('--grep="Q03 ${{ matrix.build }}:"');});

it('runs the Android contact preflight before its independent full campaign route',()=>{const workflow=readFileSync('.github/workflows/ci.yml','utf8'),job=workflow.split('  regional-campaign-android-browser:')[1]?.split('  streamed-world-browser:')[0];expect(job).toBeTruthy();const preflight=job.indexOf('tests/e2e/campaign-touch-controls.spec.ts --project=android-chromium'),campaign=job.indexOf('tests/e2e/campaign-regional-playthrough.spec.ts --project=android-chromium');expect(preflight).toBeGreaterThanOrEqual(0);expect(campaign).toBeGreaterThan(preflight);expect(job).not.toContain('continue-on-error');});

const workflow=readFileSync('.github/workflows/ci.yml','utf8');
function jobSteps(name:string){
 const job=workflow.match(new RegExp('^  '+name+':\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:|$(?![\\s\\S]))','m'))?.[1];
 expect(job,name).toBeDefined();
 return {job:job!,steps:job!.split(/^      - /m).slice(1)};
}

it('routes each desktop acceptance job through one isolated native browser runner',()=>{
 const jobs={browser:20,'native-pointer-browser':8,'first-chapter-browser':40,'combat-build-browser':40,'regional-campaign-browser':100,'streamed-world-browser':40};
 for(const [name,minutes] of Object.entries(jobs)){
  const {job,steps}=jobSteps(name),native=steps.filter(step=>step.includes('run: bash scripts/run-native-browser.sh ')),packages=steps.filter(step=>step.includes('run: sudo apt-get install --yes --no-install-recommends xdotool xvfb xauth x11-utils'));
  expect(job).toContain('needs: verify');
  if(name==='browser'){
   expect(job).toContain("timeout-minutes: ${{ (matrix.group == 'desktop-player-rest' || matrix.group == 'android-player-rest') && 25 || 20 }}");
   expect(readFileSync('tests/e2e/campaign-player-rest.spec.ts','utf8')).toContain('test.setTimeout(1200000)');
  }else expect(job).toContain('timeout-minutes: '+minutes);
  expect(native,name).toHaveLength(1);expect(packages,name).toHaveLength(1);
  expect(job).not.toContain('continue-on-error');
  if(['browser','first-chapter-browser','combat-build-browser','streamed-world-browser'].includes(name)){
   expect(native[0]).toContain("if: matrix.project == 'desktop-chromium'");
   expect(packages[0]).toContain("if: matrix.project == 'desktop-chromium'");
   const android=steps.filter(step=>step.includes("if: matrix.project == 'android-chromium'"));
   expect(android,name).toHaveLength(1);expect(android[0]).not.toContain('run-native-browser');
   expect(android[0]).not.toMatch(/E2E_NATIVE_MOUSE|--headed|--workers|--retries/);
  }
 }
 expect(workflow.match(/run: bash scripts\/run-native-browser\.sh /g)).toHaveLength(6);
 expect(workflow.match(/tests\/e2e\/native-pointer\.spec\.ts/g)).toHaveLength(1);
 expect(jobSteps('native-pointer-browser').job).toContain('tests/e2e/native-pointer.spec.ts --project=desktop-chromium');
 for(const name of ['regional-campaign-android-browser','cooperative-browser']){
  expect(jobSteps(name).job).not.toMatch(/run-native-browser|xdotool|xvfb|E2E_NATIVE_MOUSE|--headed|--workers|--retries/);
 }
});

function withMockCommands(run:(directory:string,env:NodeJS.ProcessEnv)=>void){
 const directory=mkdtempSync(join(tmpdir(),'browser-routing-'));
 const env:NodeJS.ProcessEnv={...process.env,PATH:directory+delimiter+(process.env.PATH??'')};
 delete env.E2E_NATIVE_MOUSE;
 try{
  const commands={
   'xvfb-run':'printf "XVFB_ARGS=%s|%s\\n" "$1" "$2"\nshift 2\nexec "$@"',
   xdpyinfo:'printf "%s\\n" "${MOCK_X11_EXTENSION:-XTEST}"',
   xdotool:'printf "XDOTOOL=%s\\n" "$1"',
  };
  for(const [name,body] of Object.entries(commands))writeFileSync(join(directory,name),'#!/bin/sh\n'+body+'\n',{mode:0o755});
  writeFileSync(join(directory,'capture.mjs'),'console.log(JSON.stringify({args:process.argv.slice(2),native:process.env.E2E_NATIVE_MOUSE??null}));process.exit(Number(process.env.MOCK_EXIT??0));');
  run(directory,env);
 }finally{rmSync(directory,{recursive:true,force:true});}
}

it('passes quoted arguments and native flags through one Xvfb and preserves test failures',()=>{
 withMockCommands((directory,env)=>{
  const result=spawnSync('bash',['scripts/run-native-browser.sh',process.execPath,join(directory,'capture.mjs'),'--grep=Q03 bow:','a literal $value'],{env:{...env,MOCK_EXIT:'7'},encoding:'utf8'});
  expect(result.stderr).toBe('');expect(result.status).toBe(7);
  expect(result.stdout).toContain('Native desktop acceptance: headed Chromium, isolated Xvfb, one worker, zero retries.');
  expect(result.stdout.match(/XVFB_ARGS=/g)).toHaveLength(1);
  expect(result.stdout).toContain('XVFB_ARGS=--auto-servernum|--server-args=-screen 0 1920x1080x24');
  expect(result.stdout).toContain('XTEST\nXDOTOOL=version');
  expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({args:['--grep=Q03 bow:','a literal $value','--headed','--workers=1','--retries=0'],native:'1'});
 });
});

it('fails before running tests when the display lacks native input support',()=>{
 withMockCommands((directory,env)=>{
  const result=spawnSync('bash',['scripts/run-native-browser.sh',process.execPath,join(directory,'capture.mjs')],{env:{...env,MOCK_X11_EXTENSION:'RENDER'},encoding:'utf8'});
  expect(result.status).not.toBe(0);expect(result.stdout).not.toContain('XDOTOOL=');expect(result.stdout).not.toContain('"args"');
 });
});

it('allows list-only discovery without X11 or native input flags',()=>{
 withMockCommands((directory,env)=>{
  // If the wrapper tries Xvfb, fail instead of listing tests.
  writeFileSync(join(directory,'xvfb-run'),'#!/bin/sh\nexit 99\n',{mode:0o755});
  const result=spawnSync('bash',['scripts/run-native-browser.sh',process.execPath,join(directory,'capture.mjs'),'--list'],{env,encoding:'utf8'});
  expect(result.status).toBe(0);expect(JSON.parse(result.stdout)).toEqual({args:['--list'],native:null});
 });
});

it('accepts bounded native desktop flags while preserving headless group discovery',()=>{
 withMockCommands((directory,env)=>{
  writeFileSync(join(directory,'npx'),'#!/bin/sh\nexec "$MOCK_NODE" "$MOCK_CAPTURE" "$@"\n',{mode:0o755});
  const groupEnv={...env,MOCK_NODE:process.execPath,MOCK_CAPTURE:join(directory,'capture.mjs')};
  for(const [project,group,flags] of [
   ['desktop-chromium','desktop-input',['--headed','--workers=1','--retries=0']],
   ['desktop-chromium','desktop-input',['--list']],
   ['android-chromium','android-chromium',['--list']],
  ] as const){
   const result=spawnSync(process.execPath,['scripts/run-browser-group.mjs',project,group,...flags],{env:groupEnv,encoding:'utf8'});
   expect(result.status,result.stderr).toBe(0);
   const captured=JSON.parse(result.stdout) as {args:string[];native:null};
   expect(captured.args.slice(0,2)).toEqual(['playwright','test']);expect(captured.args).toContain('--project='+project);
   expect(captured.args.slice(-flags.length)).toEqual(flags);expect(captured.native).toBeNull();
  }
  for(const [project,group,flag] of [
   ['android-chromium','android-chromium','--headed'],
   ['desktop-chromium','desktop-input','--workers=2'],
   ['desktop-chromium','desktop-input','--retries=1'],
  ]){
   const result=spawnSync(process.execPath,['scripts/run-browser-group.mjs',project,group,flag],{env:groupEnv,encoding:'utf8'});
   expect(result.status).not.toBe(0);expect(result.stderr).toContain('Unknown browser acceptance selection');expect(result.stdout).toBe('');
  }
 });
});

 it('routes dungeon acceptance independently on both Chromium platforms and WebKit without masking failures',()=>{const {job}=jobSteps('dungeon-browser');expect(job).toContain('project: [desktop-chromium, android-chromium]');expect(job).toContain('tests/e2e/dungeon.spec.ts tests/e2e/dungeon-input.spec.ts tests/e2e/dungeon-resupply.spec.ts --project=');expect(job).toContain("E2E_DUNGEON: '1'");expect(job).toContain('needs: [verify, deploy-preview]');expect(job).not.toContain('continue-on-error');const webkit=jobSteps('dungeon-webkit-browser').job;expect(webkit).toContain('tests/webkit/dungeon.spec.ts');expect(webkit).not.toContain('continue-on-error');});

 it('runs the complete dungeon PvPvE browser route as its own exact-SHA public gate',()=>{const {job}=jobSteps('dungeon-raid-browser');expect(job).toContain('needs: [verify, deploy-preview]');expect(job).toContain('tests/e2e/dungeon-raid.spec.ts --project=desktop-chromium');expect(job).toContain("E2E_DUNGEON: '1'");expect(job).toContain('EXPECTED_COMMIT: ${{ github.event.pull_request.head.sha }}');expect(job).not.toContain('continue-on-error');});


it('runs full-stash public acceptance independently without relaxing the existing raid gate',()=>{
 const {job}=jobSteps('dungeon-return-browser');
 expect(job).toContain('project: [desktop-chromium, android-chromium]');
 expect(job).toContain('tests/e2e/dungeon-pending-return.spec.ts --project=');
 expect(job).toContain('needs: [verify, deploy-preview]');
 expect(job).toContain('EXPECTED_COMMIT: ${{ github.event.pull_request.head.sha }}');
 expect(job).toContain('timeout-minutes: 20');
 expect(job).not.toContain('continue-on-error');
 expect(jobSteps('dungeon-raid-browser').job).toContain('timeout-minutes: 12');
 expect(readFileSync('tests/e2e/helpers/dungeon-raid-controls.ts','utf8')).toContain('readonly routeBudget = 240');
});
