// CI/local-runner only: actual workerd, isolated storage, no login/upload/deploy.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const storage=await mkdtemp(join(tmpdir(),'beyblade-workerd-'));
const checkpoint=join(storage,'restart-checkpoint.json');const port=18790;const origin=`http://127.0.0.1:${port}`;
let worker=null;let exited=true;
async function start(){
  worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config','wrangler.beyblade.jsonc','--ip','127.0.0.1','--port',String(port),'--persist-to',storage,'--show-interactive-dev-session=false'],{stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});exited=false;worker.on('exit',()=>{exited=true;});worker.stdout.pipe(process.stdout);worker.stderr.pipe(process.stderr);
  const deadline=Date.now()+45_000;while(true){if(exited)throw new Error('Local workerd exited before becoming ready');try{const response=await fetch(`${origin}/api/beyblade/health`);if(response.ok)break;}catch{/* boot in progress */}if(Date.now()>deadline)throw new Error('Timed out starting local workerd');await new Promise(resolve=>setTimeout(resolve,250));}
}
async function stop(){if(worker&&!exited){worker.kill('SIGTERM');await Promise.race([new Promise(resolve=>worker.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);if(!exited){worker.kill('SIGKILL');await new Promise(resolve=>worker.once('exit',resolve));}}}
async function smoke(restart=false){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','server/beyblade/smoke.ts',...(restart?['--restart-check']:[])],{stdio:'inherit',env:{...process.env,BEYBLADE_SMOKE_URL:origin,BEYBLADE_RESTART_CHECKPOINT:checkpoint}});const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('workerd smoke exceeded 150 seconds'));},150_000);child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error(`workerd smoke exit ${code}`));});});}
try{await start();await smoke();await stop();await start();await smoke(true);}finally{await stop();await rm(storage,{recursive:true,force:true});}
