import {CoopFrameDecoder} from '../src/networking/coop-frame-decoder.ts';
import {COOP_PROTOCOL} from '../src/networking/coop-protocol.ts';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
const base=process.env.E2E_BASE_URL;if(!base)throw Error('E2E_BASE_URL required');const room=crypto.randomUUID().replaceAll('-','').padEnd(48,'0');
const keys=[crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')],ids=['',''];let clients=[];
const wait=async(predicate,label)=>{const end=Date.now()+20000;while(!predicate()){const failure=clients.find(c=>c.error);if(failure)throw failure.error;if(Date.now()>end)throw Error('Public authority timeout: '+label);await new Promise(r=>setTimeout(r,40));}};
const connect=async(index)=>{
 const url=new URL('/coop/'+room,base);url.protocol='wss:';const socket=new WebSocket(url),result={socket,state:null,frames:0,notices:[],error:null},decoder=new CoopFrameDecoder(token=>socket.send(JSON.stringify({type:'delivery',token})));
 const opened=new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);setTimeout(()=>reject(Error('WebSocket open timeout')),15000).unref();});
 socket.on('message',data=>{let p;try{p=decoder.accept(JSON.parse(String(data)));}catch(error){result.error=error;return;}if(p.type==='welcome'||p.type==='frame'){result.state=p.state;result.frames++;if(p.type==='welcome')ids[index]=p.playerId;}if(p.type==='notice'||p.type==='ack')result.notices.push(p.message);});
 await opened;socket.send(JSON.stringify({type:'hello',protocol:COOP_PROTOCOL,resumeKey:keys[index]}));await wait(()=>{if(result.error)throw result.error;return result.state;},'welcome');return result;
};
try{
 clients=[await connect(0),await connect(1)];console.log('PUBLIC_COOP joined two independent real WebSockets');
 await wait(()=>clients.every(c=>c.state.peers?.length===1),'peer convergence');const start=clients[0].state.player.x;
 for(let sequence=1;sequence<=20;sequence++){clients[0].socket.send(JSON.stringify({type:'input',sequence,input:{x:1,z:0,jump:false}}));await new Promise(r=>setTimeout(r,40));}
 await wait(()=>clients[0].state.player.x>start+.3&&clients[1].state.peers.some(p=>p.id===ids[0]&&p.player.x>start+.3),'remote movement');console.log('PUBLIC_COOP authority and remote movement verified');
 const p=clients[0].state.player;clients[0].socket.send(JSON.stringify({type:'action',commandId:'dig-public',message:{type:'action',tool:'dig',expectedRevision:clients[0].state.edits,target:{x:p.x,y:p.y-.2,z:p.z+1}}}));
 await wait(()=>clients.every(c=>c.state.edits===1),'shared edit');clients[1].socket.close();await new Promise(r=>setTimeout(r,300));clients[1]=await connect(1);assert.equal(clients[1].state.edits,1);console.log('PUBLIC_COOP shared edit and reconnect verified');
 console.log('PUBLIC_COOP PASS '+JSON.stringify({clients:2,minimumFrames:Math.min(...clients.map(c=>c.frames)),edits:clients[1].state.edits}));
}finally{for(const c of clients)c.socket.terminate();}
