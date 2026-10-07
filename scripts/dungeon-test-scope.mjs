// A narrow optimization, never a passing substitute for skipped historical tests.
import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
let legacy=true,cooperative=true,reason='Main, manual, initial PR, or unavailable base: full legacy acceptance';
if(process.env.GITHUB_EVENT_NAME==='pull_request'&&event.action==='synchronize'&&/^[a-f0-9]{40}$/.test(event.before??'')){
 try{
  const changed=execFileSync('git',['diff','--name-only',event.before,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const isolated=path=>/^tests\/e2e\/helpers\/dungeon[^/]*\.ts$/.test(path)||/^(src\/dungeon\/|docs\/|tests\/unit\/dungeon[^/]*\.test\.ts$|tests\/e2e\/dungeon[^/]*\.spec\.ts$|tests\/webkit\/dungeon[^/]*\.spec\.ts$)/.test(path)||['tests/unit/browser-acceptance-groups.test.ts','README.md','AGENTS.md','src/main.ts','index.html','vite.config.ts','.github/workflows/ci.yml','scripts/dungeon-test-scope.mjs','scripts/deploy-preview.mjs'].includes(path)||path.startsWith('apps/campaign-room/');
  legacy=changed.some(path=>!isolated(path));
  cooperative=legacy||changed.some(path=>path.startsWith('apps/campaign-room/')||path==='scripts/deploy-preview.mjs');
  reason=legacy?'Shared campaign/engine/save/test files changed: full legacy acceptance':'Isolated dungeon delta: preserve full units/build, legacy launch/save isolation smoke and new dungeon acceptance';
 }catch{reason='Could not establish previous head: full legacy acceptance';}
}
appendFileSync(process.env.GITHUB_OUTPUT,`legacy=${legacy}\ncooperative=${cooperative}\n`);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`Test scope: ${reason}. Skipped historical tests are not newly verified or repaired. Manual dispatch and main always retain the full matrix.\n`);
console.log(reason);
