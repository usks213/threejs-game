import { shapeDescription } from '../data/physical-estimates';
import template from './template.html?raw';
import { parts, defaultBuild, profileFor, validateBuild, buildForBlade, selectableParts, requiredBuildKeys, ratingsFor, officialProducts } from '../data/catalog';
import { createBattle, stepBattle, STEP } from '../core/physics';
import { createMatch, scoreRound } from '../core/rules';
import { createArena } from '../rendering/arena';
import { ArenaClient } from '../network/client';
import type { StateMessage } from '../network/protocol';
import type { Battle, Build, Launch, PartCategory } from '../core/types';
const finishLabel={spin:'スピンフィニッシュ',over:'オーバーフィニッシュ',burst:'バーストフィニッシュ',xtreme:'エクストリームフィニッシュ',draw:'ドロー / リシュート'};
const escape=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function startArena(){
  const root=document.querySelector<HTMLElement>('#arena-app')!;
  root.innerHTML=template;
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const abort=new AbortController();const signal=abort.signal;
  let build:Build={...defaultBuild};
  let opponentBuild=buildForBlade(parts.find(p=>p.category==='blade'&&p.release==='released'&&p.id!==defaultBuild.blade)?.id??defaultBuild.blade);
  try{const saved=JSON.parse(localStorage.getItem('x-arena-build-v1')??'null');if(saved && validateBuild(saved).length===0)build=saved;}catch{/* unavailable storage */}
  let battle:Battle|null=null;let match=createMatch();let matchStarted=false;let client:ArenaClient|null=null;let networkState:StateMessage|null=null;let queuedOnConnect=false;let networkGeneration=0;let backendAvailable=false;let healthController:AbortController|null=null;let healthGeneration=0;let running=false;let countdown=0;let mode:'local'|'online'='local';let disposed=false;let last=0;let accumulator=0;let lastHud=0;let frame=0;
  const arena=createArena(el<HTMLCanvasElement>('arena-canvas'),message=>{el('arena-error').hidden=false;el('arena-error').textContent=message;});
  const setMessage=(message:string)=>{el('message').textContent=message;};
  const launchInput=():Launch=>({power:Number(el<HTMLInputElement>('power').value)/100,angle:Number(el<HTMLInputElement>('angle').value)*Math.PI/180,tilt:Number(el<HTMLInputElement>('tilt').value)*Math.PI/180});
  const categories: [keyof Build,PartCategory,string][]=[['blade','blade','BLADE / ブレード'],['lock_chip','lock_chip','LOCK CHIP / ロックチップ'],['main_blade','main_blade','MAIN BLADE / メインブレード'],['metal_blade','metal_blade','METAL / メタルブレード'],['assist_blade','assist_blade','ASSIST / アシストブレード'],['over_blade','over_blade','OVER / オーバーブレード'],['ratchet','ratchet','RATCHET / ラチェット'],['bit','bit','BIT / ビット']];
  function updateBuild(){
    const blade=parts.find(p=>p.id===build.blade)!;
    el('build-name').textContent=blade.name;el('your-name').textContent=blade.name;el('build-subtitle').textContent=`${blade.type.toUpperCase()} TYPE / ${blade.spin===-1?'LEFT':'RIGHT'} SPIN${blade.spinVerification==='unverified_model_default'?' · 回転方向未確認':''}`;
    const keys=requiredBuildKeys(build);
    const wanted=categories.filter(([key])=>keys.includes(key));
    el('part-selects').innerHTML=wanted.map(([key,,label])=>{const options=selectableParts(key,build);return `<label class="part-select"><span>${label}</span><select data-part="${key}" aria-label="${label}" ${matchStarted||running||countdown?'disabled':''}>${options.map(p=>`<option value="${escape(p.id)}" ${p.id===build[key]?'selected':''}>${escape(p.name)}</option>`).join('')}</select></label>`;}).join('');
    for(const [key,id] of [['bladeMode',build.blade],['bitMode',build.bit]] as const){const part=parts.find(p=>p.id===id);if(part?.modes?.length)el('part-selects').insertAdjacentHTML('beforeend',`<label class="part-select"><span>${key==='bladeMode'?'ブレード':'ビット'} / モード</span><select data-part="${key}" aria-label="${key}" ${matchStarted?'disabled':''}>${part.modes.map(m=>`<option ${m.name===build[key]?'selected':''} value="${escape(m.name)}">${escape(m.name)}</option>`).join('')}</select></label>`);}
    const cpuOptions=selectableParts('blade',opponentBuild);el('cpu-blade').innerHTML=cpuOptions.map(p=>`<option value="${escape(p.id)}" ${p.id===opponentBuild.blade?'selected':''}>${escape(p.name)}</option>`).join('');el<HTMLSelectElement>('cpu-blade').disabled=matchStarted;el('other-name').textContent=parts.find(p=>p.id===opponentBuild.blade)?.name??'CPU';
    el('shape-description').textContent=shapeDescription(blade.canonicalId??blade.name,blade.type)+(blade.modes?.length||parts.find(p=>p.id===build.bit)?.modes?.length?'。モードによる実機の変形動作は未実装です。':'');
    const currentRatings=ratingsFor(blade,blade.spin??1,build.bladeMode);
    el('ratings').innerHTML=([['attack','攻撃'],['defense','防御'],['stamina','持久']] as const).map(([key,label])=>`<div class="stat"><span>${label}</span><div class="bar"><i style="width:${currentRatings?.[key]??0}%"></i></div><b>${currentRatings?.[key]??'—'}</b></div>`).join('');
    const errors=validateBuild(build);el('build-error').textContent=errors.join(' / ');el<HTMLButtonElement>('launch').disabled=errors.length>0||!arena||running||countdown>0||(mode==='online'&&!['ready','round-end'].includes(networkState?.phase??''));
    if(!errors.length){arena?.setProfiles([profileFor(build),profileFor(opponentBuild,0xf5785a)]);try{localStorage.setItem('x-arena-build-v1',JSON.stringify(build));}catch{/* optional persistence */}}
  }
  function scoreHud(){el('score-you').textContent=String(match.scores[0]);el('score-other').textContent=String(match.scores[1]);el('round-label').textContent=match.winner===null?`ROUND ${match.round} · FIRST TO 4`:match.winner===0?'YOU WIN':'CPU WINS';}
  function renderCatalog(){const query=el<HTMLInputElement>('catalog-search').value.toLowerCase();const found=parts.filter(p=>`${p.name} ${p.category} ${p.family}`.toLowerCase().includes(query));el('catalog-count').textContent=`${found.length} PARTS`;el('catalog-body').innerHTML=found.map(p=>`<tr><td>${escape(p.name)}</td><td>${escape(p.sourceCategory??p.category)}</td><td>${p.family}</td>${['attack','defense','stamina','dash','burst_resistance','height'].map(k=>`<td>${p.ratings?.[k as keyof typeof p.ratings]??'未確認'}</td>`).join('')}<td class="rating-note">${escape(p.ratingScope??'')} ${escape(p.notes??'')}${p.ratingsVariants?.length?`<br>${p.ratingsVariants.map(v=>escape(`${v.condition}: ATK ${v.ratings.attack??'—'} / DEF ${v.ratings.defense??'—'} / STA ${v.ratings.stamina??'—'}`)).join('<br>')}`:''}${p.modes?.length?`<br>${p.modes.map(m=>escape(`${m.name}: ATK ${m.ratings.attack??'—'} / DEF ${m.ratings.defense??'—'} / STA ${m.ratings.stamina??'—'}`)).join('<br>')}`:''}</td><td>${p.release==='released'?'発売済':p.release==='upcoming'?'発売予定':'発売未確認'}</td><td><a href="${escape(p.source)}" target="_blank" rel="noreferrer">公式 ↗</a></td></tr>`).join('');}
  el('part-selects').addEventListener('change',e=>{const select=e.target as HTMLSelectElement;if(!select.dataset.part||running||countdown||matchStarted)return;if(select.dataset.part==='blade')build=buildForBlade(select.value,build);else {build={...build,[select.dataset.part]:select.value};if(select.dataset.part==='bit')build=buildForBlade(build.blade,build);}updateBuild();},{signal});
  el('cpu-blade').addEventListener('change',()=>{if(matchStarted)return;opponentBuild=buildForBlade(el<HTMLSelectElement>('cpu-blade').value,opponentBuild);updateBuild();},{signal});
  for(const name of ['power','angle','tilt'])el(name).addEventListener('input',()=>{el(`${name}-value`).textContent=`${el<HTMLInputElement>(name).value}${name==='power'?'%':'°'}`;},{signal});
  function reset(){running=false;matchStarted=false;countdown=0;accumulator=0;battle=null;match=createMatch();scoreHud();updateBuild();el('launch').textContent='3, 2, 1 — GO SHOOT!';el('phase').textContent='● READY TO LAUNCH';setMessage('新しい試合。カスタマイズとシュートを調整できます。');}
  function launchLocal(){if(running||countdown||validateBuild(build).length)return;if(match.winner!==null)reset();matchStarted=true;countdown=3;el('arena-canvas').closest('.stage')?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});el<HTMLButtonElement>('launch').disabled=true;setMessage('3, 2, 1… GO SHOOT!');el('phase').textContent='● LAUNCH COUNTDOWN';updateBuild();}
  el('launch').addEventListener('click',()=>{if(mode==='local')launchLocal();else if(networkState?.phase==='ready'){if(client?.launch(launchInput()))el<HTMLButtonElement>('launch').disabled=true;}else if(networkState?.phase==='round-end'){if(client?.next())el<HTMLButtonElement>('launch').disabled=true;}else setMessage('先に対戦相手と接続してください。');},{signal});
  el('reset-match').addEventListener('click',()=>{if(mode==='online'){client?.cancel();networkState=null;}reset();},{signal});
  el('local-tab').addEventListener('click',()=>setMode('local'),{signal});el('online-tab').addEventListener('click',()=>setMode('online'),{signal});
  async function checkBackend(){
    const generation=++healthGeneration;healthController?.abort();backendAvailable=false;
    if(mode!=='online'||el<HTMLInputElement>('server-url').value.trim())return;
    const controller=new AbortController();healthController=controller;const timeout=setTimeout(()=>controller.abort(),3000);
    el<HTMLButtonElement>('queue').disabled=true;el('connection').textContent='オンライン対戦の公開状態を確認しています…';
    try{const response=await fetch('/api/beyblade/health',{cache:'no-store',signal:controller.signal});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('no service');const status=await response.json() as {service?:string;online?:boolean};if(status.service!=='beyblade-authoritative'||status.online!==true)throw new Error('wrong service');if(generation!==healthGeneration||mode!=='online'||disposed)return;backendAvailable=true;el<HTMLButtonElement>('queue').disabled=false;el('connection').textContent='オンライン対戦サーバーを利用できます。';}
    catch{if(generation!==healthGeneration||mode!=='online'||disposed)return;const message='この公開版ではオンライン対戦はまだ利用できません。CPU戦を利用できます。';el('connection').textContent=message;setMessage(message);el<HTMLButtonElement>('queue').disabled=true;}
    finally{clearTimeout(timeout);}
  }
  el('server-url').addEventListener('input',()=>{healthGeneration++;healthController?.abort();if(el<HTMLInputElement>('server-url').value.trim()){el<HTMLButtonElement>('queue').disabled=false;el('connection').textContent='開発用サーバーを指定しました。';}else void checkBackend();},{signal});
  function setMode(next:'local'|'online'){if(mode===next)return;healthGeneration++;healthController?.abort();networkGeneration++;client?.cancel();client?.dispose();client=null;networkState=null;mode=next;reset();el('online-panel').hidden=mode!=='online';el('cpu-picker').hidden=mode==='online';for(const id of ['local','online']){el(`${id}-tab`).classList.toggle('selected',id===mode);el(`${id}-tab`).setAttribute('aria-selected',String(id===mode));}el('opponent-label').textContent=mode==='local'?'CPU / CORAL':'OPPONENT / CORAL';setMessage(mode==='local'?'練習モード。シュートを調整してバトル。':'対戦サーバーの公開状態を確認します。');if(mode==='online')void checkBackend();}
  el('arena-focus').addEventListener('click',()=>{const expanded=el('arena-canvas').closest('.stage')!.classList.toggle('focused');el('arena-focus').setAttribute('aria-pressed',String(expanded));el('arena-focus').textContent=expanded?'通常の表示':'アリーナを拡大';},{signal});
  el('catalog-link').addEventListener('click',()=>el('catalog').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}),{signal});el('catalog-search').addEventListener('input',renderCatalog,{signal});
  function onNetwork(state:StateMessage){
    networkState=state;running=false;countdown=0;matchStarted=!['idle'].includes(state.phase);if(state.phase==='idle'||state.phase==='queued'){match=createMatch();battle=null;scoreHud();}
    const player=state.player??0,other=player===0?1:0;
    if(state.match){match={...state.match,scores:[state.match.scores[player],state.match.scores[other]],winner:state.match.winner===null?null:state.match.winner===player?0:1};scoreHud();}
    if(state.battle){battle={...state.battle,tops:[state.battle.tops[player],state.battle.tops[other]]};arena?.setProfiles([{...battle.tops[0].profile,color:0x335dff},{...battle.tops[1].profile,color:0xf5785a}]);el('other-name').textContent=battle.tops[1].profile.name;}
    const text:Record<StateMessage['phase'],string>={idle:'接続完了。対戦相手を探せます。',queued:'対戦相手を探しています… 別のプレイヤーの参加を待っています。',ready:'マッチ成立！ シュート準備を送信してください。',countdown:'両者の準備完了。3, 2, 1…',battle:'オンライン対戦中 · サーバーが物理と得点を計算しています。','round-end':'ラウンド終了。両者が「次のラウンド」で再開します。','match-end':`試合終了 · ${match.winner===0?'あなたの勝利':'相手の勝利'}`,'opponent-disconnected':'相手の接続が中断。再接続を待っています。'};
    let message=text[state.phase];if(state.phase==='round-end'&&state.battle?.result){const r=state.battle.result;message=`${finishLabel[r.finish]} · ${r.winner===null?'再シュート':`${r.winner===player?'YOU':'OPPONENT'} +${r.points} pt`} — 次のラウンドへ`;}
    setMessage(state.reason?`${message} (${state.reason})`:message);el('connection').textContent=`接続中 / ${state.phase}`;el('phase').textContent=`● ONLINE ${state.phase.toUpperCase()}`;
    el('launch').textContent=state.phase==='round-end'?'次のラウンドへ':state.phase==='ready'?'シュート準備を送信':'相手を待っています';
    el<HTMLButtonElement>('launch').disabled=!['ready','round-end'].includes(state.phase)||state.ready[player];
    el<HTMLButtonElement>('queue').disabled=!['idle','match-end'].includes(state.phase);
    el('part-selects').querySelectorAll('select').forEach(select=>select.disabled=matchStarted);
  }
  el('queue').addEventListener('click',()=>{
    if(validateBuild(build).length)return;
    if(!el<HTMLInputElement>('server-url').value.trim()&&!backendAvailable){setMessage('この公開版ではオンライン対戦はまだ利用できません。CPU戦を利用できます。');return;}
    if(client&&networkState?.phase==='idle'){client.queue(build);return;}
    client?.cancel();client?.dispose();networkState=null;queuedOnConnect=true;
    const entered=el<HTMLInputElement>('server-url').value.trim();const endpoint=entered||`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/beyblade`;
    try{const url=new URL(endpoint);if(!['ws:','wss:','https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('URL形式が正しくありません');const generation=++networkGeneration;client=new ArenaClient(endpoint,msg=>{if(disposed||mode!=='online'||generation!==networkGeneration)return;if(msg.type==='hello'){el('connection').textContent='接続完了';if(queuedOnConnect){queuedOnConnect=false;client?.queue(build);}}else if(msg.type==='state')onNetwork(msg);else if(msg.type==='error'){const unavailable=!el<HTMLInputElement>('server-url').value.trim()&&msg.message.includes('サーバーに接続できません');const message=unavailable?'この公開版ではオンライン対戦はまだ利用できません。CPU戦を利用できます。':msg.message;el('connection').textContent=message;setMessage(message);el<HTMLButtonElement>('queue').disabled=unavailable;}});client.connect();el('connection').textContent='接続しています…';el<HTMLButtonElement>('queue').disabled=true;}catch{el('connection').textContent='有効な ws:// または wss:// サーバーURLを入力してください。';el<HTMLButtonElement>('queue').disabled=false;}
  },{signal});
  el('cancel-queue').addEventListener('click',()=>{queuedOnConnect=false;networkGeneration++;client?.cancel();client?.dispose();client=null;networkState=null;reset();el('connection').textContent='接続を終了しました。';el<HTMLButtonElement>('queue').disabled=!backendAvailable&&!el<HTMLInputElement>('server-url').value.trim();},{signal});
  function animate(now:number){if(disposed)return;const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(countdown>0){countdown-=dt;if(countdown<=0){countdown=0;battle=createBattle([profileFor(build),profileFor(opponentBuild,0xf5785a)],[launchInput(),{power:.76,angle:-.12,tilt:.11}]);running=true;accumulator=0;el('phase').textContent='● BATTLE LIVE';setMessage('自転・摩擦・衝突から軌道を計算中。操作はシュート時のみ。');}}
    if(running&&battle){accumulator+=dt;while(accumulator>=STEP&&!battle.result){stepBattle(battle,STEP);accumulator-=STEP;}if(battle.result){running=false;match=scoreRound(match,battle.result);scoreHud();const r=battle.result;setMessage(`${finishLabel[r.finish]}${r.winner===null?'':` · ${r.winner===0?'YOU':'CPU'} +${r.points} pt`}${match.winner!==null?' — 試合終了':''}`);el('phase').textContent='● ROUND COMPLETE';el<HTMLButtonElement>('launch').disabled=false;el('launch').textContent=match.winner!==null?'もう一度対戦する':'次のラウンドへ';updateBuild();}}
    arena?.draw(battle,now/1000);if(now-lastHud>100){lastHud=now;el('rpm').textContent=battle?`BLUE ${Math.round(Math.abs(battle.tops[0].omega)*60/(2*Math.PI))} rpm / CORAL ${Math.round(Math.abs(battle.tops[1].omega)*60/(2*Math.PI))} rpm`:'BLUE — rpm / CORAL — rpm';el('sim-time').textContent=`SIM ${((battle?.tick??0)*STEP).toFixed(2)}s`;if(battle){const t=battle.tops[0],events=battle.events.filter(e=>battle!.tick-e.tick<240);const action=events.some(e=>e.kind==='dash')?'X DASH · ギア接触からの射出':events.some(e=>e.kind==='rail-engage')?'GEAR CONTACT · レール噛み合い':events.some(e=>e.kind==='collision')?'CONTACT · 衝突 / 反動':'6DOF · 自転 / 歳差';el('motion-state').textContent=`${action} | ${Math.hypot(t.vx,t.vy??0,t.vz).toFixed(2)} m/s · 傾き ${(t.tilt*180/Math.PI).toFixed(0)}°`;}else el('motion-state').textContent='6DOF · 3次元の姿勢と接触を計算';}
    frame=requestAnimationFrame(animate);
  }
  el('product-count').textContent=`公式掲載商品 ${officialProducts.length} 件（発売予定を含む）`;
  el('product-body').innerHTML=officialProducts.map(p=>`<tr><td>${escape(p.name_ja)}</td><td>${escape(p.release_date??'未確認')}</td><td>${p.date_status==='upcoming'?'発売予定':p.date_status==='dated_on_or_before_cutoff'?'発売済':'発売日未確認'}</td><td><a href="${escape(p.source_url)}" target="_blank" rel="noreferrer">公式 ↗</a></td></tr>`).join('');
  updateBuild();renderCatalog();scoreHud();frame=requestAnimationFrame(animate);
  return()=>{disposed=true;healthGeneration++;healthController?.abort();client?.dispose();abort.abort();cancelAnimationFrame(frame);arena?.dispose();};
}
