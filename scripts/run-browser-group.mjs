import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [project,group,...flags]=process.argv.slice(2),platform=project?.split('-')[0];
const allowedFlags=project==='desktop-chromium'?['--list','--headed','--workers=1','--retries=0']:['--list'];
if(!['desktop-chromium','android-chromium'].includes(project)||!group?.startsWith(platform+'-')||flags.some(f=>!allowedFlags.includes(f)))throw Error('Unknown browser acceptance selection');
const groups=JSON.parse(readFileSync(new URL('./browser-acceptance-groups.json',import.meta.url),'utf8')),entry=groups[group.slice(platform.length+1)];
if(!entry||!Array.isArray(entry.files)||entry.files.length===0)throw Error('Unknown or empty browser group');
const files=entry.files.map(file=>{if(!/^[a-z-]+\.spec\.ts$/.test(file))throw Error('Invalid spec path');const path=fileURLToPath(new URL('../tests/e2e/'+file,import.meta.url));if(!existsSync(path))throw Error('Missing browser spec: '+file);return path;});
// Explicit files prevent a generic title like "desktop" from picking unrelated
// campaign routes, while every defined case retains its original assertions.
const result=spawnSync('npx',['playwright','test',...files,'--project='+project,...(entry.grep?['--grep='+entry.grep]:[]),...flags],{stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
