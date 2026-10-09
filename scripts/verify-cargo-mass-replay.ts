/** Validate the composed socket replay and its measured loaded/unloaded response.
 * Reuses the frozen exact-world checkpoint verifier without changing its file. */
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {validateCheckpoint} from '../src/save/checkpoint';
const composed=resolve(process.argv[2]??'/tmp/voxel-cargo-mass-composed-01'),replay=resolve(process.argv[3]??'/tmp/voxel-cargo-mass-socket-01');
const check=spawnSync(process.execPath,['--import','tsx',resolve('scripts/verify-vehicle-journey-replay.ts'),composed,replay],{encoding:'utf8'});
if(check.status!==0)throw Error('Exact checkpoint verification failed: '+check.stdout+check.stderr);
const verified=JSON.parse(readFileSync(join(replay,'vehicle-journey-verification.json'),'utf8'));
const states=['cargo-empty-throw','cargo-loaded-throw','cargo-unloaded-throw'].map((stage,index)=>{
 const files=readdirSync(replay).filter(file=>file.endsWith('-'+stage+'.checkpoint.json'));if(files.length!==1)throw Error('Missing cargo checkpoint '+stage);
 const world=validateCheckpoint(JSON.parse(readFileSync(join(replay,files[0]),'utf8'))).world,parts=world.skybound?.parts??[],crate=parts.find(part=>part.kind==='storage');
 if(!crate||parts.length!==4)throw Error('Expected the same four-part storage assembly');
 const mass=parts.reduce((sum,part)=>sum+part.mass,0),cargo=world.skybound?.storage?.[crate.id]?.stone??0;
 const stoneTotal=(world.members??[]).reduce((sum,member)=>sum+(member.adventure.inventory.stone??0),0)+cargo;
 if(mass!==(index===1?40:24)||cargo!==(index===1?8:0)||stoneTotal!==8)throw Error('Mass/cargo conservation mismatch at '+stage);
 return {stage,mass,cargo,stoneTotal,rootVelocity:{...parts.find(part=>part.id===1)!.velocity},partIds:parts.map(part=>part.id)};
});
const [empty,loaded,unloaded]=states;
if(Math.abs(loaded.rootVelocity.z/empty.rootVelocity.z-.6)>1e-9||Math.abs(unloaded.rootVelocity.z-empty.rootVelocity.z)>1e-9)throw Error('The actual socket checkpoint does not preserve inverse-mass response and restoration');
const result={...verified,harness:'actual-input-cargo-mass-exact-socket-checkpoints',physicsComparisons:states,loadedResponseRatio:loaded.rootVelocity.z/empty.rootVelocity.z,limits:['deterministic clock, not wall-clock performance','short collision-free throw comparison; cargo buoyancy and long drives not tested','Node sockets, not browser/device/public transport']};
writeFileSync(join(replay,'cargo-mass-verification.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify({status:result.status,sourceHash:result.sourceHash,actions:result.actions,steps:result.steps,frameChecks:result.frameChecks,waterChecks:result.waterChecks,physicsComparisons:states,clockNormalizations:result.clockNormalizations.length},null,2)+'\n');
