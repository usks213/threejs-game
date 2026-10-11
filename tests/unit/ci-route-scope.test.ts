import {expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const moduleUrl=new URL('../../scripts/ci-route-scope.mjs',import.meta.url).href;
const {routeDiagnosticOnly,ROUTE_DIAGNOSTIC_GREP}=await import(moduleUrl) as {routeDiagnosticOnly:(paths:string[],manual?:boolean)=>boolean;ROUTE_DIAGNOSTIC_GREP:string};
const route='tests/e2e/vertical-navigation.spec.ts',doc='docs/adventure/vertical-navigation-oct09.md';
it.each([
 [route],['tests/helpers/vertical-route-driver.ts'],['tests/unit/vertical-route-driver.test.ts'],
 [route,doc], [route,'tests/helpers/vertical-route-driver.ts','tests/unit/vertical-route-driver.test.ts',doc],
])('selects the exact route for strictly allowlisted test-only changes: %j',(...paths:string[])=>{
 expect(routeDiagnosticOnly(paths)).toBe(true);
 expect(ROUTE_DIAGNOSTIC_GREP).toBe('voxel adventure continues by walking the ramp');
});
it.each([
 'src/game/traversal.ts','src/ui/adventure.ts','src/world/skybound-terrain.ts',
 'package.json','package-lock.json','playwright.config.ts','.github/workflows/ci.yml',
 'scripts/ci-scope.mjs','scripts/ci-route-scope.mjs','tests/unit/ci-route-scope.test.ts',
 'tests/e2e/vertical-journey-layout.spec.ts','tests/helpers/first-beacon-save.ts',
 'tests/e2e/unknown.spec.ts','docs/adventure/unknown.md','README.md','../'+doc,
])('retains broad checks when any source/config/unknown path accompanies the route: %s',path=>{
 expect(routeDiagnosticOnly([route,path])).toBe(false);
});
it('does not turn empty, documentation-only or manual runs into route acceptance',()=>{
 expect(routeDiagnosticOnly([])).toBe(false);
 expect(routeDiagnosticOnly([doc])).toBe(false);
 expect(routeDiagnosticOnly([route],true)).toBe(false);
 expect(routeDiagnosticOnly([route,doc],true)).toBe(false);
});

it.each([
 {paths:[route],targeted:true},
 {paths:[route,doc],targeted:true},
 {paths:['tests/helpers/vertical-route-driver.ts'],targeted:true},
 {paths:[route,'src/game/traversal.ts'],targeted:false},
 {paths:[route,'playwright.config.ts'],targeted:false},
 {paths:[route,'tests/helpers/unknown.ts'],targeted:false},
 {paths:['tests/helpers/first-beacon-save.ts'],targeted:false},
 {paths:['scripts/ci-route-scope.mjs'],targeted:false},
 {paths:[route],targeted:false,manual:true},
])('the real classifier keeps build/checks and the expected browser scope for $paths',({paths,targeted,manual})=>{
 const cwd=mkdtempSync(join(tmpdir(),'route-scope-test-'));
 const git=(...args:string[])=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init');git('-c','user.name=CI test','-c','user.email=ci@example.invalid','commit','--allow-empty','-m','baseline');
  const base=git('rev-parse','HEAD');
  for(const path of paths){const file=join(cwd,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'fixture\n');}
  git('add','.');git('-c','user.name=CI test','-c','user.email=ci@example.invalid','commit','-m','changed paths');
  const head=git('rev-parse','HEAD'),event=join(cwd,'event.json'),output=join(cwd,'output.txt');writeFileSync(event,JSON.stringify({before:base}));
  execFileSync(process.execPath,[fileURLToPath(new URL('../../scripts/ci-scope.mjs',import.meta.url))],{cwd,encoding:'utf8',env:{...process.env,GITHUB_EVENT_PATH:event,GITHUB_OUTPUT:output,CHECKED_OUT_SHA:head,GITHUB_EVENT_NAME:manual?'workflow_dispatch':'pull_request'}});
  const values=Object.fromEntries(readFileSync(output,'utf8').trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
  expect(values.game).toBe('true');expect(values.checks).toBe('true');expect(values.browser).toBe('true');
  if(targeted){expect(values.browser_grep).toBe(ROUTE_DIAGNOSTIC_GREP);expect(values.browser_scope).toBe('route-test-only; production unchanged');}
  else{expect(values.browser_grep).toContain('voxel adventure');expect(values.browser_grep).toContain('tutorial and collection rewards');expect(values.browser_scope).toBe('normal change-based checks');}
 }finally{rmSync(cwd,{recursive:true,force:true});}
});
