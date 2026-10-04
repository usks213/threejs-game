// Publish an isolated game + authoritative SQLite room. Never touches PR3/4 services.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const pr=process.env.PR_NUMBER,expected=process.env.EXPECTED_COMMIT;
if(!process.env.CLOUDFLARE_API_TOKEN)throw new Error('Existing Cloudflare deployment credential is unavailable');
if(process.env.CLOUDFLARE_ACCOUNT_ID!=='c3ca485329f03044432fbd5164083278'||!/^\d+$/.test(pr??'')||Number(pr)<5||!/^[a-f0-9]{40}$/.test(expected??''))throw new Error('Invalid isolated deployment context');
const manifest=JSON.parse(readFileSync('dist/deployment.json','utf8'));if(manifest.commit!==expected)throw new Error('Build does not match commit');
const name=`pr-${pr}-voxel-coop-adventure`;
const result=spawnSync('npx',['--yes','wrangler@4.147.0','deploy','--config','apps/coop/wrangler.jsonc','--name',name],{encoding:'utf8',timeout:300000,maxBuffer:5*1024*1024,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
if(result.error||result.status!==0){console.error(result.stderr||result.stdout);throw new Error('Authoritative preview deployment failed');}
const urls=(result.stdout.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/g)??[]).filter(value=>new URL(value).hostname===`${name}.usks213.workers.dev`);
if(!urls.length){console.error(result.stdout);throw new Error('Deployment did not return the expected isolated URL');}
const url=urls[0];let confirmed=false;
for(let i=0;i<12;i++){try{const response=await fetch(`${url}/deployment.json?commit=${expected}`,{signal:AbortSignal.timeout(10000),cache:'no-store'}),health=await fetch(`${url}/coop/health`,{signal:AbortSignal.timeout(10000)});if(response.ok&&health.ok&&(await response.json()).commit===expected&&(await health.json()).service==='voxel-coop-authority'){confirmed=true;break;}}catch{}if(i<11)await new Promise(r=>setTimeout(r,5000));}
if(!confirmed)throw new Error('Public build or authoritative service did not match');
writeFileSync('preview-release.json',JSON.stringify({url,commit:expected,pullRequest:Number(pr),authority:'cloudflare-sqlite'}));console.log(`Preview URL: ${url}\nPublished commit: ${expected}`);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Isolated cooperative adventure\n[Play](${url})\n\nCommit: ${expected}\n\nAuthoritative room health verified; browser acceptance runs separately.\n`);
