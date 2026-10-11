import { expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDedicated } from '../../apps/dedicated/server';
import { playerIdentity } from '../../apps/dedicated/identity';
import { SessionAuthority } from '../../src/simulation/session';
import { newMeadows } from '../../src/game/meadows/state';
import { legacySimulation } from '../helpers/legacy';
import type { Snapshot } from '../../src/simulation/protocol';
it('completes a held revive between two real clients without duplicating or dropping the downed inventory', async () => {
 const directory=await mkdtemp(join(tmpdir(),'coop-revive-')),old=process.env.GAME_SAVE_DIRECTORY;
 const save=legacySimulation().save();save.generator=4;save.adventure!.meadows=newMeadows();save.adventure!.resources=[];save.adventure!.enemies=[];
 const seed=new SessionAuthority(save,true),tokens=['c'.repeat(64),'d'.repeat(64)];
 for(let i=0;i<2;i++){const actor=seed.join(playerIdentity(tokens[i],''));Object.assign(actor.player,{x:i,y:seed.sim.groundAt(i,8),z:8});if(i===1){actor.adventure.state.inventory.wood=17;actor.adventure.hurtPlayer(1000,'physical',actor.player);}}
 await writeFile(join(directory,'world.json'),JSON.stringify(seed.save()));process.env.GAME_SAVE_DIRECTORY=directory;
 const port=32500+Math.floor(Math.random()*400),server=await startDedicated(port);
 const clients:Awaited<ReturnType<Client['joinOrCreate']>>[]=[],states=new Map<number,Snapshot>(),notices:string[]=[];
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 try{
  for(let i=0;i<2;i++){const room=await new Client('http://127.0.0.1:'+port).joinOrCreate('survival',{playerToken:tokens[i]});room.onMessage('welcome',()=>{});room.onMessage('snapshot',(state:Snapshot)=>states.set(i,state));room.onMessage('notice',(text:string)=>notices.push(text));room.onMessage('edits',()=>{});clients.push(room);}
  const until=async(check:()=>boolean)=>{const limit=performance.now()+6500;while(!check()){if(performance.now()>limit)throw Error('Revive did not converge: '+notices.join(' / '));await new Promise(resolve=>setTimeout(resolve,30));}};
  await until(()=>states.size===2);expect(states.get(1)!.adventure.coop!.downedSeconds).toBeGreaterThan(0);
  let sequence=0;heartbeat=setInterval(()=>{for(const client of clients)client.send('input',{input:{x:0,z:0,jump:false},sequence:++sequence});},60);
  clients[0].send('action',{type:'game-action',action:'revive',id:playerIdentity(tokens[1],''),aim:{x:1,y:0,z:0}});
  await until(()=>!!states.get(1)!.adventure.coop?.beingRevived);
  await until(()=>states.get(1)!.adventure.health>0);
  expect(states.get(1)!.adventure.inventory.wood).toBe(17);expect(states.get(0)!.adventure.inventory.wood??0).toBe(0);expect(states.get(1)!.adventure.death).toBeNull();
 }finally{
  clearInterval(heartbeat);await Promise.all(clients.map(client=>client.leave()));await server.gracefullyShutdown(false);
  if(old===undefined)delete process.env.GAME_SAVE_DIRECTORY;else process.env.GAME_SAVE_DIRECTORY=old;await rm(directory,{recursive:true,force:true});
 }
},15000);
