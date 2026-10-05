import {ReplicaBridge} from './replica-bridge';
import {SITES} from '../content/adventure-sites';
import {rescueUI} from '../ui/expeditions';
import {companionsUI} from '../ui/companions';
import {assistRangedAim} from '../game/combat/aim-assist';
import { dialogueUI } from '../ui/dialogue';
import { GUIDES, TRIALS } from '../content/adventure-trials';
import { coopUI } from '../ui/coop';
import { accessibilityUI } from '../ui/accessibility';
import { powersUI } from '../ui/powers';
import {probeWaterLighting} from '../rendering/water/lighting-probe';
import {liveDiagnostics} from './live-diagnostics';
import {createFieldTerrain} from '../rendering/voxel/field-terrain';
import { FrameTimings } from './frame-timings';
import { TerrainQueue } from './terrain-queue';
import { objectOcclusion } from '../game/voxel/occlusion';
import { configureLandscape,landscapeSize,viewportSize } from './viewport/landscape';
import { mouseActions } from '../input/mouse/actions';
import { interactionTarget,type InteractionTarget } from '../game/interaction/target';
import { reconcileSlots } from '../game/meadows/inventory-layout';
import { FOODS } from '../content/meadows/data';
import { meadowBuilding } from '../content/meadows/recipes';
import { createPipeline } from '../rendering/postprocessing/pipeline';
import { disposeSurfaceMaps } from '../rendering/materials/pbr';
import { BUILDINGS,WEAPONS } from '../content/catalog';
import { placementIssue, snapBuilding } from '../game/placement';
import { itemIcon } from '../ui/icons/item';
import { gameShell } from '../ui/shell';
import { holdAction } from '../input/touch/hold';
import { gameSound } from '../audio/sound';
import { networkUI } from './network';
import { adventureUI } from '../ui/adventure';
import type { GameAction } from '../game/types';
import * as THREE from 'three';
import type { Axis } from '../core/player';
import { keyboardInput } from '../input/keyboard/keyboard';
import { touchInput } from '../input/touch/stick';
import { cameraInput, DEFAULT_CAMERA_PITCH, DEFAULT_CAMERA_DISTANCE } from '../input/touch/look';
import { actionInput } from '../input/touch/action';
import { createCameraBoom, orbitPose } from '../rendering/camera/follow';
import { aimFromReticle, reticleObjectDistance, RETICLE_DISTANCE } from '../rendering/camera/aim';
import { ATTACK_ORIGIN_HEIGHT } from '../game/combat/direction';
import { createWorld } from '../rendering/scene/world';
import { createTerrain } from '../rendering/voxel/terrain';
import { persistenceUI } from '../ui/persistence';
import { terrainHeight } from '../world/density';
import type { ClientMessage, Snapshot, Tool } from '../simulation/protocol';
import type {SimulationClientMessage,SimulationWorkerMessage as WorkerMessage} from '../simulation/local-protocol';
import type { Vec3,MeshData } from '../world/types';
export function startGame() {
  const controller = new AbortController(), { signal } = controller;
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!, app = document.querySelector<HTMLElement>('#app')!;
  const status = document.querySelector<HTMLElement>('#status')!, error = document.querySelector<HTMLElement>('#error')!;
  configureLandscape(app,signal);gameShell(signal);const preferences=accessibilityUI(signal);const diagnostics=liveDiagnostics(app,signal);
  const sound = gameSound(signal);sound.setMix(preferences.audioMix);for(const id of['music-volume','environment-volume','effects-volume'])document.querySelector('#'+id)!.addEventListener('input',()=>sound.setMix(preferences.audioMix),{signal});sound.setVolume(Number(document.querySelector<HTMLInputElement>('#sound-volume')!.value));document.querySelector<HTMLInputElement>('#sound-volume')!.addEventListener('input',e=>sound.setVolume(Number((e.target as HTMLInputElement).value)),{signal});
  document.querySelector('#sound-toggle')!.addEventListener('click', () => { document.querySelector('#sound-toggle')!.textContent = sound.toggle() ? '音 OFF' : '音 ON'; }, { signal });
  let noticeTimer: ReturnType<typeof setTimeout> | undefined, lastNotice = 0;
  const notice = (message: string) => { const el = document.querySelector<HTMLElement>('#notice')!; if (el.textContent === message && performance.now()-lastNotice<900) return; lastNotice=performance.now(); el.textContent=message; el.classList.add('visible'); clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>el.classList.remove('visible'),2200); sound.effect(message); };
  signal.addEventListener('abort',()=>clearTimeout(noticeTimer),{once:true});
  let photoNext=false;
  let stopped = false, frame = 0, worker: Worker | undefined;
  const terrainQueue=new TerrainQueue();let terrainEpoch=-1,awaitTerrainReset=true,readyPending=false;let readyFence:ReadonlySet<string>=new Set();
  let loadingStarted=performance.now(),streamLog=0,receivedMeshes=0,submittedMeshes=0,uploadMs=0,nearReadyMs=-1,draws=0;
  const acknowledgeMeshes=(count:number)=>{if(count>0&&terrainEpoch>=0)worker?.postMessage({type:'mesh-ack',epoch:terrainEpoch,count} satisfies SimulationClientMessage);};
  const fail = (message: string) => { diagnostics.error(message); stopped = true; cancelAnimationFrame(frame); worker?.terminate(); error.hidden = false; error.textContent = message; status.textContent = '起動エラー'; app.dataset.state = 'error'; };
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); }
  catch { fail('WebGLを起動できませんでした。ブラウザを更新し、ハードウェアアクセラレーションを確認してください。'); return () => controller.abort(); }
  if(!renderer.extensions.has('EXT_color_buffer_float')){fail('この端末ではHDR描画に必要なWebGL機能を利用できません。Chromeを更新してください。');renderer.dispose();return ()=>controller.abort();}
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{console.error('WebGL shader compilation failed',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));fail('GPUシェーダーの起動に失敗しました。ブラウザを更新して再読み込みしてください。');};
  renderer.info.autoReset=false;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  const direct=new URLSearchParams(location.search).get('terrain')!=='mesh';
  const world = createWorld(renderer,direct),field=direct?createFieldTerrain(world.scene):null;
  const terrain=field?{...field,update:(data:MeshData,r:THREE.WebGLRenderer)=>{if(data.field)field.update(data.field,r);}}:createTerrain(world.scene);
  app.dataset.terrainMode=direct?'direct-field':'surface-mesh';if(direct)renderer.shadowMap.enabled=false;
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, direct?110:80);
  const pipeline=createPipeline(renderer,world.scene,camera,world.atmosphere);
  const readKeyboard = keyboardInput(signal,preferences.boundCode,()=>sendMotion()), touch = touchInput(document.querySelector('#stick')!, document.querySelector('#knob')!, signal), view = cameraInput(canvas, signal);preferences.bindView(view);
  let waterProbeStarted=false;const probeWater=direct&&new URLSearchParams(location.search).has('waterProbe');
  const input: Axis = { x: 0, z: 0 };
  const raycaster = new THREE.Raycaster(), center = new THREE.Vector2(0, 0), normal = new THREE.Vector3(), markerAxis = new THREE.Vector3(0, 0, 1);
  const cameraPosition = new THREE.Vector3(), focus = new THREE.Vector3(), orbit = new THREE.Vector3(), lookTarget = new THREE.Vector3(), projectedHead = new THREE.Vector3();
  const reticlePoint = new THREE.Vector3(), aimOrigin = new THREE.Vector3(); let reticleAim: Vec3 = { x: 0, y: 0, z: -1 }, cameraDistance = DEFAULT_CAMERA_DISTANCE;
  const obstruction = new THREE.Raycaster();
  let buildHeight=0,freePlacement=false;let building = '', buildRotation=0, placement:Vec3|null=null, spell = 'ember';
  const buildControls=document.querySelector<HTMLElement>('#build-controls')!;
  document.querySelector('#build-rotate')!.addEventListener('click',()=>{buildRotation+=Math.PI/2;},{signal});
  for(const [id,delta]of [['build-up',.5],['build-down',-.5]] as const)document.querySelector('#'+id)!.addEventListener('click',()=>{buildHeight=Math.max(-2,Math.min(6,buildHeight+delta));},{signal});
  document.querySelector('#build-snap')!.addEventListener('click',e=>{freePlacement=!freePlacement;(e.currentTarget as HTMLButtonElement).textContent=freePlacement?'自由配置':'接続配置';},{signal});
  document.querySelector('#build-cancel')!.addEventListener('click',()=>{building='';app.dataset.building='false';app.dataset.sandbox='false';buildControls.hidden=true;use.textContent=names[tool];},{signal});
  for(const [id,property] of [['camera-distance','distance'],['camera-sensitivity','sensitivity']] as const)document.querySelector<HTMLInputElement>('#'+id)!.addEventListener('input',e=>{view[property]=Number((e.target as HTMLInputElement).value);},{signal});
  document.querySelector<HTMLInputElement>('#shadows-enabled')!.addEventListener('change',e=>{renderer.shadowMap.enabled=(e.target as HTMLInputElement).checked;renderer.shadowMap.needsUpdate=true;},{signal});
  let first=true,dirtyWorld=false;
  let contextual:InteractionTarget|null=null;
  let guardHeld = false, lastGuardAim = 0, lastRayYaw = NaN, lastRayPitch = NaN;
  const interactButton=document.querySelector<HTMLButtonElement>('#interact')!;
  let state: Snapshot | null = null, tool: Tool = 'dig', jump = false, target: Vec3 | null = null, lastInput = 0, lastRay = 0, lastUI = 0;
  // A removed surface remains a valid fill location while the player aims at the hole.
  const editedPoint = new THREE.Vector3(); let hasEditedPoint = false;
  const names: Record<Tool, string> = { dig: '掘る', add: '盛る', water: '水を流す', rock: '岩を落とす' };
  const acceptSnapshot=(next:Snapshot,motionOnly=false)=>{diagnostics.snapshot();state=next;if(!motionOnly)dirtyWorld=true;if(first){world.player.position.set(next.player.x,next.player.y,next.player.z);first=false;}};
  const replicaBridge=new ReplicaBridge(message=>worker?.postMessage(message),acceptSnapshot);
  const post = (message: ClientMessage) => { if(message.type==='replica-state'){replicaBridge.offer(message.state,message.edits);return;} if(message.type==='init'||message.type==='replica-init'){replicaBridge.reset();loadingStarted=performance.now();receivedMeshes=0;submittedMeshes=0;uploadMs=0;nearReadyMs=-1;draws=0;app.dataset.state='loading';status.textContent='ワールドを準備中…';awaitTerrainReset=true;readyPending=false;terrainQueue.clear();world.resetWater();delete app.dataset.tick;state=null;first=true;hasEditedPoint=false;target=null;contextual=null;guardHeld=false;} if (!stopped) worker?.postMessage(message.type==='init'||message.type==='replica-init'?{...message,direct}:message); };
  const photo=document.createElement('button');photo.id='photo';photo.textContent='風景をPNGで保存 [P]';document.querySelector('#system-panel')!.append(photo);photo.addEventListener('click',()=>{if(app.dataset.state!=='running'){notice('ワールドの準備ができてから写真を撮ってください');return;}photoNext=true;document.querySelectorAll<HTMLElement>('[role=dialog]').forEach(p=>p.hidden=true);},{signal});signal.addEventListener('abort',()=>photo.remove(),{once:true});
  const network = networkUI(signal, post, notice,{loadPersonal:()=>persistence.load(),exported:save=>persistence.exportSave(save)});
  const send = (message: ClientMessage) => { if(message.type==='input')diagnostics.input(message.input);if (!network.forward(message)) post(message); };
  // Input must reach the authority on contact/release even if drawing is slow.
  // The short heartbeat also renews held input before the server's idle timeout.
  const sendMotion=(forceIdle=false)=>{
    if(stopped)return;
    readKeyboard(input);if(touch.x||touch.z){input.x=touch.x;input.z=touch.z;}
    if(forceIdle||document.hidden||app.dataset.state!=='running'||document.querySelector('[role=dialog]:not([hidden])')){input.x=0;input.z=0;jump=false;}
    const sin=Math.sin(view.yaw),cos=Math.cos(view.yaw);
    send({type:'input',input:{x:input.x*cos+input.z*sin,z:input.z*cos-input.x*sin,jump}});jump=false;lastInput=performance.now();
  };
  const inputHeartbeat=setInterval(()=>sendMotion(),100);signal.addEventListener('abort',()=>clearInterval(inputHeartbeat),{once:true});
  const persistence = persistenceUI(send, signal, notice,{active:()=>network.guest,exportWorld:()=>network.exportWorld()});
  const resolveCamera = createCameraBoom((origin, direction, limit) => {
    obstruction.set(origin, direction); obstruction.far = limit;
    const distance = terrain.raycast(obstruction)?.distance ?? limit;
    return state ? objectOcclusion(state.adventure, origin, direction, distance) : distance;
  });
  const sampleReticle = () => {
    raycaster.setFromCamera(center, camera); raycaster.far = RETICLE_DISTANCE;
    const hit = terrain.raycast(raycaster);
    let interaction = state ? interactionTarget(state.adventure, state.player, raycaster.ray.origin, raycaster.ray.direction, hit?.distance) : null;
    let distance = Math.min(hit?.distance ?? RETICLE_DISTANCE, interaction?.distance ?? RETICLE_DISTANCE);
    if (state) distance = reticleObjectDistance(state.adventure, raycaster.ray.origin, raycaster.ray.direction, distance, state.bodies);
    if (interaction && distance < interaction.distance - .06) interaction = null;
    raycaster.ray.at(distance, reticlePoint);
    const player = state?.player ?? world.player.position;
    aimOrigin.set(player.x, player.y + ATTACK_ORIGIN_HEIGHT, player.z);
    reticleAim = aimFromReticle(player, raycaster.ray.origin, raycaster.ray.direction, distance);
    return { hit, interaction, distance };
  };
  const gameAction = (action: GameAction, id?: string) => {
    if (action === 'guard') { guardHeld = id !== 'off'; lastGuardAim = performance.now(); }
    if(action==='equip'){building='';app.dataset.building='false';app.dataset.sandbox='false';buildControls.hidden=true;}if(action==='spell'&&id)spell=id;
    sampleReticle(); let aim = { ...reticleAim };
    if(action==='attack'&&state&&preferences.aimAssist&&WEAPONS[state.adventure.equipment]?.ranged){const origin={x:state.player.x,y:state.player.y+ATTACK_ORIGIN_HEIGHT,z:state.player.z};aim=assistRangedAim(origin,aim,state.adventure.enemies,(from,to)=>{const delta=new THREE.Vector3(to.x-from.x,to.y-from.y,to.z-from.z),distance=delta.length();obstruction.set(new THREE.Vector3(from.x,from.y,from.z),delta.normalize());obstruction.far=distance;const hit=terrain.raycast(obstruction)?.distance??distance;return hit<distance-.2||objectOcclusion(state!.adventure,from,delta,distance)<distance-.2;});}

    if(action==='build')aim={x:Math.sin(buildRotation),y:0,z:Math.cos(buildRotation)};
    if(action==='dodge'&&(input.x||input.z)){const sin=Math.sin(view.yaw),cos=Math.cos(view.yaw),length=Math.hypot(input.x,input.z);aim={x:(input.x*cos+input.z*sin)/length,y:0,z:(input.z*cos-input.x*sin)/length};}
    send({type:'game-action',action,id,target:action==='build'?placement??undefined:(action==='repairBuilding'||action==='remove')&&contextual?.id==='b:'+id?contextual.point:target??undefined,aim});
  };
  const powers=powersUI(signal,(action,id,point,rotation)=>{sampleReticle();const guarded=['sky-store','sky-take','sky-camp','sky-move','sky-glue','sky-unglue','sky-recall','sky-salvage','sky-toggle','sky-charge','sky-ride','sky-share','sky-upright'].includes(action);const expectedEpoch=guarded?state?.adventure.skybound?.parts.find(p=>p.id===Number(id?.split(':')[0]))?.epoch:undefined;send({type:'game-action',expectedEpoch,action,id,target:point??target??undefined,aim:rotation===undefined?{...reticleAim}:{x:Math.sin(rotation),y:0,z:Math.cos(rotation)}});});
  const rescue=rescueUI(signal,()=>gameAction('site-rescue','850002'));
  const companions=companionsUI(signal,(kind,id)=>gameAction(kind,id),()=>powers.selectedPart);
  const glide=document.createElement('button');glide.id='traverse-glide';glide.className='hud-button';glide.textContent='翼';glide.setAttribute('aria-label','翼を開閉');app.append(glide);actionInput(glide,()=>gameAction('glide'),signal);signal.addEventListener('abort',()=>glide.remove(),{once:true});
  const dive=document.createElement('button');dive.id='dive';dive.textContent='急降下 [V]';document.querySelector('#combat-extra')!.append(dive);actionInput(dive,()=>gameAction('glide','dive'),signal);signal.addEventListener('abort',()=>dive.remove(),{once:true});
  const dialogue=dialogueUI(signal,id=>gameAction('dialogue',id));
  const coop=coopUI(signal,id=>gameAction('revive',id),()=>preferences.holdAssist,code=>preferences.boundCode(code));
  const adventure = adventureUI(signal, gameAction, id => { building=id;app.dataset.sandbox='false';app.dataset.building='true';buildHeight=0;buildRotation=Math.round((view.yaw+Math.PI)/(Math.PI/2))*Math.PI/2;buildControls.hidden=false;use.textContent='設置'; });
  for (const id of ['gather', 'attack', 'heavy', 'guard', 'dodge'] as const) { const button=document.querySelector<HTMLButtonElement>('#'+id)!; if(id==='guard'){button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);gameAction('guard','on');},{signal});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>gameAction('guard','off'),{signal});}else if(id==='attack')holdAction(button,()=>{if(!state||state.adventure.attack<=0)gameAction(id);},()=>true,signal);else actionInput(button,()=>gameAction(id),signal); }
  for(const id of ['sprint','sneak'] as const)actionInput(document.querySelector<HTMLButtonElement>('#'+id)!,()=>gameAction(id),signal);
  actionInput(document.querySelector<HTMLButtonElement>('#quick-eat')!,()=>gameAction('eat'),signal);
  actionInput(document.querySelector<HTMLButtonElement>('#cast')!, () => gameAction(state?.adventure.meadows?'interact':'spell', spell), signal);
  const use = document.querySelector<HTMLButtonElement>('#use-tool')!;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) button.addEventListener('click', () => {
    building = '';app.dataset.building='false';app.dataset.sandbox='true';buildControls.hidden=false; tool = button.dataset.tool as Tool; use.textContent = names[tool]; app.dataset.tool=tool; use.disabled = tool !== 'water' && !target;
    for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b === button));
  }, { signal });
  for(const [id,icon,label] of [['attack','sword','攻撃'],['water-cast','water','放水'],['guard','shield','盾'],['heavy','axe','強撃'],['cast','staff','魔法'],['adventure-menu','bag','持物'],['build-rotate','hammer','回転'],['quick-eat','berry','食事']] ){const button=document.querySelector<HTMLButtonElement>('#'+id)!;button.innerHTML=itemIcon(icon)+'<span>'+label+'</span>';if(id==='attack')button.setAttribute('aria-label','攻撃');}
  const pour = () => { const p = state?.player ?? world.player.position; send({ type: 'action', tool: 'water', target: target ?? { x:p.x-Math.sin(view.yaw)*2, y:p.y+0.5, z:p.z-Math.cos(view.yaw)*2 } }); };
  holdAction(document.querySelector<HTMLButtonElement>('#water-cast')!, pour, () => true, signal);
  const act = () => { if (!building && tool === 'water') pour(); else if (target && building) gameAction('build', building); else if (target) { if(tool==='dig'||tool==='add'){editedPoint.set(target.x,target.y,target.z);hasEditedPoint=true;} send({ type: 'action', tool, target,expectedRevision:state?.edits }); } else notice('近くの地面に照準を合わせてください'); };
  holdAction(use, act, () => !building && tool === 'water', signal);
  actionInput(document.querySelector<HTMLButtonElement>('#jump')!, () => { if(state&&!state.player.grounded&&state.adventure.inventory.glider)gameAction('glide');else {jump=true;sendMotion();} }, signal);
  document.querySelector('#view-reset')!.addEventListener('click', () => { view.yaw = 0; view.pitch = DEFAULT_CAMERA_PITCH; }, { signal });
  const interact=()=>{contextual=sampleReticle().interaction;if(!contextual){if(state?.adventure.meadows?.fishing||state?.adventure.equipment==='fishingRod')gameAction('fish');else if(state?.adventure.meadows?.riding)gameAction('interact');return;}const t=contextual;if(state?.adventure.generator===4&&t.id.startsWith('r:')){const id=Number(t.id.slice(2));if(SITES.some(s=>s.npc===id)){gameAction('site-talk',String(id));return;}if(GUIDES.some(g=>g.id===id)){gameAction('talk',String(id));return;}if(TRIALS.some(g=>g.id===id)){adventure.open('world');return;}}if(t.id==='fishing'){gameAction('fish');return;}if(t.id==='dismount'){gameAction('interact');return;}if(state?.adventure.equipment==='hammer'&&t.id.startsWith('b:')&&!t.panel){gameAction('repairBuilding',t.id.slice(2));return;}if(t.panel){adventure.openContext(t.panel,t.id);mouse.unlock();}send({type:'game-action',action:'interact',id:t.id,target:t.point,aim:{...reticleAim}});};
  actionInput(interactButton,interact,signal);actionInput(document.querySelector<HTMLButtonElement>('#dismantle')!,()=>{if(contextual?.id.startsWith('b:'))gameAction('remove',contextual.id.slice(2));},signal);
  const quick=(index:number)=>{if(!state?.adventure.meadows)return;const slot=reconcileSlots(state.adventure.meadows,state.adventure.inventory)[index];if(slot)gameAction(FOODS[slot.id]?'eat':'equip',slot.id);};
  document.querySelector('#hotbar')!.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-quick]');if(b)quick(Number(b.dataset.quick));},{signal});
  const mouse=mouseActions(canvas,signal,()=>building||app.dataset.sandbox==='true'?act():gameAction('attack'),held=>{if(building||app.dataset.sandbox==='true'){if(held)document.querySelector<HTMLButtonElement>('#build-cancel')!.click();}else gameAction('guard',held?'on':'off');});
  const sprint=(held:boolean)=>{if(state?.adventure.meadows)gameAction('sprint',held?'on':'off');};
  const releaseActions=()=>{jump=false;readKeyboard.clear();sendMotion(true);gameAction('guard','off');sprint(false);};
  window.addEventListener('blur',releaseActions,{signal});window.addEventListener('resize',releaseActions,{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseActions();},{signal});
  window.addEventListener('keydown',e=>{
    if((e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]'))return;
    if(preferences.boundCode(e.code)==='Escape'){if(document.querySelector('#recovery-panel:not([hidden])')){e.preventDefault();return;}mouse.unlock();gameAction('guard','off');sprint(false);if(building||app.dataset.sandbox==='true')document.querySelector<HTMLButtonElement>('#build-cancel')!.click();document.querySelectorAll<HTMLElement>('[role=dialog]').forEach(p=>p.hidden=true);return;}
    if(preferences.boundCode(e.code)==='Tab'){e.preventDefault();if(!e.repeat){const panel=document.querySelector<HTMLElement>('#adventure-panel')!;if(panel.hidden){adventure.open('bag');mouse.unlock();}else panel.hidden=true;}return;}
    if(e.repeat||document.querySelector('[role=dialog]:not([hidden])'))return;
    if(preferences.boundCode(e.code)==='Space'){e.preventDefault();if(state&&!state.player.grounded&&state.adventure.inventory.glider)gameAction('glide');else {jump=true;sendMotion();}}
    if(preferences.boundCode(e.code)==='KeyJ')gameAction('attack');if(preferences.boundCode(e.code)==='KeyK')gameAction('guard','on');
    if(preferences.boundCode(e.code)==='KeyG')gameAction('glide');if(preferences.boundCode(e.code)==='KeyV')gameAction('glide','dive');if(preferences.boundCode(e.code)==='KeyP')photo.click();if(preferences.boundCode(e.code)==='KeyT')gameAction('climb');if(preferences.boundCode(e.code)==='KeyQ')document.querySelector<HTMLButtonElement>('#powers-menu')?.click();
    if(preferences.boundCode(e.code)==='KeyE')interact();if(preferences.boundCode(e.code)==='KeyB'){adventure.open('build');mouse.unlock();}
    if(preferences.boundCode(e.code)==='KeyX'&&state?.adventure.equipment==='hammer'&&contextual?.id.startsWith('b:'))gameAction('remove',contextual.id.slice(2));if(preferences.boundCode(e.code)==='KeyF')pour();if(preferences.boundCode(e.code)==='KeyR'){if(building)buildRotation+=Math.PI/2;else gameAction('heavy');}
    if(preferences.boundCode(e.code)==='ControlLeft'||preferences.boundCode(e.code)==='KeyC')gameAction('dodge');
    if(preferences.boundCode(e.code)==='ShiftLeft'||preferences.boundCode(e.code)==='ShiftRight')sprint(true);
    if(/^Digit[1-8]$/.test(preferences.boundCode(e.code)))quick(Number(preferences.boundCode(e.code).slice(-1))-1);
  },{signal});
  window.addEventListener('keyup',e=>{if(preferences.boundCode(e.code)==='KeyK')gameAction('guard','off');if(preferences.boundCode(e.code)==='ShiftLeft'||preferences.boundCode(e.code)==='ShiftRight')sprint(false);},{signal});
  document.querySelectorAll('[role=dialog]').forEach(p=>{const observer=new MutationObserver(()=>{if(!(p as HTMLElement).hidden){mouse.unlock();releaseActions();}});observer.observe(p,{attributes:true,attributeFilter:['hidden']});signal.addEventListener('abort',()=>observer.disconnect(),{once:true});});
  document.querySelector('#reset')!.addEventListener('click', () => send({ type: 'reset-player' }), { signal });
  const resize = () => { target = null; const size=viewportSize(),v=landscapeSize(size.width,size.height);camera.aspect = v.width / Math.max(1,v.height); camera.updateProjectionMatrix(); pipeline.resize(v.width,v.height); };
  window.addEventListener('resize', resize, { signal }); resize();
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('WebGLの接続が失われました。保存したワールドは再読込できます。ページを再読み込みしてください。'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { error.textContent = '描画接続が戻りました。ページを再読み込みしてください。'; }, { signal });
  world.player.position.set(0, terrainHeight(0, 8), 8);
  try {
    terrain.prepareUploads(renderer);
    worker = new Worker(new URL('../simulation/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessageerror=()=>fail('ゲーム計算の受信データを読み取れませんでした。');
    worker.onerror = () => fail('地形処理を開始できませんでした。ページを再読み込みしてください。');
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (stopped) return;
      const message = event.data;if(message.type==='replica-rejected'){replicaBridge.rejected(message);notice(message.message);return;}if(message.type==='replica-applied'){replicaBridge.applied(message);return;}if(message.type==='replica-motion'){replicaBridge.motion(message);return;}if(message.type==='health'){diagnostics.heartbeat(message.health);return;} if (message.type!=='terrain-reset'&&message.type!=='terrain-visibility'&&network.receive(message)) return;
      if(message.type==='terrain-reset'){terrainEpoch=message.epoch;replicaBridge.beginEpoch(terrainEpoch);app.dataset.worldEpoch=String(terrainEpoch);awaitTerrainReset=false;readyPending=false;terrainQueue.clear();terrainQueue.remove(terrain.ids());terrain.setActive([]);}
      else if(message.type==='terrain-visibility'){if(!awaitTerrainReset&&message.epoch===terrainEpoch)terrain.setActive(message.ids);}
      else if(message.type==='mesh'||message.type==='mesh-batch'){
        if(awaitTerrainReset||message.epoch!==terrainEpoch)return;
        const meshes=message.type==='mesh'?[message.mesh]:message.meshes;let discarded=0;
        receivedMeshes+=meshes.length;for(const mesh of meshes)discarded+=terrainQueue.enqueue(mesh);acknowledgeMeshes(discarded);
      }
      else if(message.type==='remove'){if(awaitTerrainReset||message.epoch!==terrainEpoch)return;acknowledgeMeshes(terrainQueue.remove(message.ids,id=>terrain.has(id)));}
      else if (message.type === 'snapshot') { if(awaitTerrainReset||message.epoch!==terrainEpoch)return;acceptSnapshot(message.state); }
      else if(message.type==='ready'){if(!awaitTerrainReset&&message.epoch===terrainEpoch){nearReadyMs=performance.now()-loadingStarted;readyPending=true;readyFence=terrainQueue.fence();}}
      else if (message.type === 'save' && !network.guest) {if(awaitTerrainReset||message.epoch!==terrainEpoch)return;persistence.receive(message.save);}
      else if (message.type === 'notice') notice(message.message);
      else if (message.type === 'error') fail(message.message);
    };
    void persistence.load().then(save => { if (!stopped) send({ type: 'init', save }); });
  } catch { fail('このブラウザで地形Workerを起動できませんでした。ChromeまたはSafariを更新してください。'); }
  const frameTimings=new FrameTimings();
  let renderedLastFrame=false,lastDraw=0;let previous = performance.now(), fpsStarted = previous, frames = 0, fps = 0, lastShadow=0;
  document.addEventListener('visibilitychange', () => { previous = performance.now(); lastDraw=0; renderedLastFrame=false; if(document.hidden)send({type:'save'}); post({ type: 'pause', paused: document.hidden }); }, { signal });
  const position = document.querySelector<HTMLElement>('#position')!;
  const animate = (now: number) => {
    if (stopped) return;
    if(!document.hidden&&renderedLastFrame&&!document.querySelector('[role=dialog]:not([hidden])')&&app.dataset.state==='running')frameTimings.record('rafGap',now-previous);renderedLastFrame=false;
    const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden) {
      const sessionOpen=!document.querySelector<HTMLElement>('#session-panel')!.hidden,menuOpen=!!document.querySelector('[role=dialog]:not([hidden])');
      const loading=app.dataset.state!=='running';
      const renderDue=!menuOpen;pipeline.setResolution(preferences.resolution);if(menuOpen||loading)lastDraw=0;
      let uploaded=0;terrain.beginUploadFrame();
      try{if(renderDue)uploaded=terrainQueue.flush(data=>terrain.update(data,renderer),id=>terrain.remove([id]));}catch(uploadError){console.error(uploadError);fail('地形のGPU転送に失敗しました。再読み込みしてください。');return;}
      // terrain.update already submits both LOD buffers through the 1px upload pass.
      // Never redraw the full shadowed world merely to release streaming credits.
      submittedMeshes+=uploaded;uploadMs+=terrain.stats.uploadSubmissionMs;acknowledgeMeshes(uploaded);
      if(now-streamLog>200){app.dataset.streaming=JSON.stringify({epoch:terrainEpoch,elapsedMs:now-loadingStarted,receivedMeshes,submittedMeshes,uploadMs,nearReadyMs,readyPending,fencePending:terrainQueue.hasPending(readyFence),queue:terrainQueue.size,draws});streamLog=now;}
      if(readyPending&&state&&!terrainQueue.hasPending(readyFence)){readyPending=false;status.textContent='プレイ中';app.dataset.state='running';send({type:'save'});}
      if(now-lastInput>30)sendMotion();
      if(camera.fov!==preferences.fov){camera.fov=preferences.fov;camera.updateProjectionMatrix();}world.setReducedMotion(preferences.reducedMotion);world.selectPart(powers.selectedPart);if(state&&dirtyWorld&&!menuOpen&&!loading){const t=performance.now();world.update(state);sound.update(state);dirtyWorld=false;frameTimings.record('worldUpdate',performance.now()-t);}
      if (state) { const p = state.player, alpha = 1 - Math.exp(-18 * dt); world.player.position.lerp(focus.set(p.x, p.y, p.z), alpha); world.player.rotation.y = p.heading; }
      if(!menuOpen)world.interpolate(dt);
      orbitPose(world.player.position, view.yaw, view.pitch, focus, orbit, camera.up);
      const cameraRayStart = performance.now();
      if(!menuOpen)cameraDistance = resolveCamera(world.player.position, focus, orbit, camera.up, view.distance, dt, cameraPosition);
      frameTimings.record('cameraRay',performance.now()-cameraRayStart);
      camera.position.copy(cameraPosition); camera.lookAt(lookTarget.copy(cameraPosition).sub(orbit)); camera.updateMatrixWorld();
      world.player.visible = camera.position.distanceTo(world.player.position) > 1.6;
      if (!menuOpen && state && (now - lastRay > 80 || view.yaw !== lastRayYaw || view.pitch !== lastRayPitch)) {
        const interactionStart=performance.now();const sampled = sampleReticle();let hit = sampled.hit;
        contextual=sampled.interaction;if(!contextual&&(state.adventure.meadows?.fishing||state.adventure.equipment==='fishingRod'))contextual={id:'fishing',label:state.adventure.meadows?.fishing?.phase==='bite'?'合わせる':state.adventure.meadows?.fishing?.phase==='fight'?'巻く / 緩める':'釣り糸を投げる',point:{...state.player},distance:0};if(!contextual&&state.adventure.meadows?.riding)contextual={id:'dismount',label:'いかだから降りる',point:{...state.player},distance:0};interactButton.hidden=!contextual||!!building;document.querySelector('#interaction-label')!.textContent=contextual?.label??'';app.dataset.interaction=contextual?.id??'';document.querySelector<HTMLButtonElement>('#dismantle')!.hidden=!!building||state.adventure.equipment!=='hammer'||!contextual?.id.startsWith('b:');
        let anchorId:number|undefined;if (building) { const piece = world.raycastBuildings(raycaster); if (piece && (!hit || piece.distance < hit.distance)) {hit = piece;let o:THREE.Object3D|null=piece.object;while(o){if(o.userData.buildingId){anchorId=o.userData.buildingId;break;}o=o.parent;}} }
        if (hit && hit.distance > sampled.distance + .06) hit = undefined;
        if (hit && hit.point.distanceTo(focus.set(state.player.x, state.player.y + 0.7, state.player.z)) <= 7) {
          target = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
          normal.copy(hit.face?.normal ?? markerAxis);if(hit.face)normal.transformDirection(hit.object.matrixWorld); world.marker.position.copy(hit.point).addScaledVector(normal, 0.04); world.marker.quaternion.setFromUnitVectors(markerAxis, normal); world.marker.visible = true;
        } else if (!building && tool==='add' && hasEditedPoint && editedPoint.distanceTo(focus)<7 && raycaster.ray.distanceToPoint(editedPoint)<1.6 && normal.copy(editedPoint).sub(raycaster.ray.origin).dot(raycaster.ray.direction)>0) {
          target={x:editedPoint.x,y:editedPoint.y,z:editedPoint.z};world.marker.position.copy(editedPoint);world.marker.quaternion.setFromUnitVectors(markerAxis,normal.set(0,1,0));world.marker.visible=true;
        } else { target = null; world.marker.visible = false; }
        app.dataset.aim=JSON.stringify({target,player:state.player,pitch:view.pitch});
        placement=building&&target?(freePlacement?{...target}:snapBuilding(building,target,normal,buildRotation,state.adventure.buildings.find(b=>b.id===anchorId))):null;if(placement)placement.y+=buildHeight;
        if(building==='cook'&&placement){const fire=state.adventure.buildings.find(b=>b.definition==='fire'&&Math.hypot(b.x-placement!.x,b.z-placement!.z)<1);if(fire){placement.x=fire.x;placement.z=fire.z;placement.y=fire.y+.65;}}
        const rawDef=BUILDINGS.find(b=>b.id===building),def=rawDef&&state.adventure.meadows?meadowBuilding(rawDef):rawDef,issue=def&&placement?placementIssue(def,state.player,placement,state.adventure.buildings,state.adventure.inventory,buildRotation):'地面に照準を合わせる';
        world.preview(building,placement,buildRotation,!issue);
        document.querySelector('#build-hint')!.textContent=building?(issue||`${def?.name}を設置`):tool!=='water'&&!target?'照準を足元に下げて地面を狙う':'';
        use.disabled = building?(!placement||!!issue):(!target && (tool !== 'water' || !!building))||(tool==='add'&&state.adventure.generator===4&&(state.adventure.inventory.stone??0)<5); document.querySelector('#target-hint')!.textContent = tool === 'water' && !building ? '長押しで放水' : target ? tool==='add'&&state.adventure.generator===4?'石を5個使います':'' : '地面に照準を合わせる'; frameTimings.record('interactionRay',performance.now()-interactionStart);lastRay = now; lastRayYaw = view.yaw; lastRayPitch = view.pitch;
      }
      if (guardHeld && !network.guest && !menuOpen && state && now - lastGuardAim > 100) {
        send({ type: 'game-action', action: 'guard', id: 'on', aim: { ...reticleAim } }); lastGuardAim = now;
      }
      const grassStart=performance.now();if(!menuOpen){terrain.updateDetails(world.player.position,now/1000);world.faceCamera(camera);}frameTimings.record('grassUpdate',performance.now()-grassStart);
      if(now-lastShadow>120){renderer.shadowMap.needsUpdate=true;lastShadow=now;}
      try { if(renderDue&&state&&!loading){
        if(lastDraw>0&&now-lastDraw<10000)pipeline.observeFrame(now-lastDraw);
        const renderStart=performance.now();
        world.prepareWater();if(world.waterStats.error){fail('水面の背景処理に失敗しました。再読み込みしてください。');return;}if(direct){world.atmosphere.prepareDirect();renderer.setRenderTarget(null);renderer.render(world.scene,camera);if(probeWater&&!waterProbeStarted&&world.atmosphere.stats.shUpdates>0&&world.waterSurface.geometry.drawRange.count>0){waterProbeStarted=true;void probeWaterLighting(renderer,world.scene,world.waterSurface).then(result=>app.dataset.waterProbe=JSON.stringify(result)).catch(error=>app.dataset.waterProbe=JSON.stringify({error:String(error)}));}}else pipeline.render(Math.min(.1,(now-lastDraw)/1000),menuOpen);
        if(photoNext){photoNext=false;try{canvas.toBlob(blob=>{if(!blob||signal.aborted){if(!signal.aborted)notice('写真を書き出せませんでした');return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='skybound-photo-'+Date.now()+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('風景写真を端末へ保存しました。自動で共有はしていません');},'image/png');}catch{notice('この端末では写真を書き出せませんでした');}}draws++;frames++;renderedLastFrame=true;lastDraw=now;frameTimings.record('renderWall',performance.now()-renderStart);
      } } catch (renderError) { console.error(renderError); fail('描画に失敗しました。ページを再読み込みしてください。'); return; }
      if (now - fpsStarted > 1000) { fps = Math.round(frames * 1000 / (now - fpsStarted)); fpsStarted = now; frames = 0; }
      if (state && now - lastUI > 200) {
        const p = state.player, m = state.metrics; if(state.adventure.meadows){document.querySelector('#cast')!.innerHTML=itemIcon(state.adventure.meadows.fishing?'fishingRod':'hammer')+'<span>'+ (state.adventure.meadows.fishing?.phase==='bite'?'合わせる':state.adventure.meadows.fishing?.phase==='fight'?(state.adventure.meadows.fishing.reeling?'緩める':'巻く'):'使う')+'</span>';} adventure.update(state.adventure, p,view.yaw);powers.update(state,target,reticleAim);companions.update(state);rescue.update(state.adventure,state.player);coop.update(state);dialogue.update(state.adventure);app.dataset.skybound=JSON.stringify(state.adventure.skybound);app.dataset.traversal=JSON.stringify(state.adventure.traversal);glide.hidden=state.adventure.generator!==4;glide.setAttribute('aria-pressed',String(!!state.adventure.traversal?.gliding));
        if(state.adventure.meadows){const slots=reconcileSlots(state.adventure.meadows,state.adventure.inventory);const markup=slots.slice(0,8).map((slot,i)=>`<button type=button data-quick=${i} aria-label="${slot?slot.id:'空き'}" class="${slot?.id===state!.adventure.equipment?'selected':''}"><kbd>${i+1}</kbd>${slot?itemIcon(slot.id)+'<small>'+slot.count+'</small>':'·'}</button>`).join('');const hotbar=document.querySelector('#hotbar')!;if(hotbar.innerHTML!==markup)hotbar.innerHTML=markup;}
        app.dataset.performance=JSON.stringify({terrainQueue:terrainQueue.stats,terrainGPU:terrain.stats,terrainWorkers:1,meshThread:'dedicated-worker',water:world.waterStats,timings:frameTimings.snapshot()});
        app.dataset.graphics=JSON.stringify({...world.atmosphere.stats,...pipeline.stats,features:direct?['pbr','physical-sky','ibl','sh','direct-field']:['pbr','physical-sky','ibl','sh','volumetric','exposure','bloom','shadow','ssr']});
        app.dataset.cameraPitch = String(view.pitch); app.dataset.cameraYaw = String(view.yaw);
        projectedHead.copy(world.player.position); projectedHead.y += 1.65; projectedHead.project(camera);
        app.dataset.cameraProbe = JSON.stringify({ head: { x: projectedHead.x, y: projectedHead.y }, attackOrigin: aimOrigin, aim: reticleAim, reticleTarget: reticlePoint, cameraDistance });
        app.dataset.combat = JSON.stringify({ attackMotion: state.adventure.attackMotion, health: state.adventure.health, stamina: state.adventure.stamina });
        position.textContent = `X ${p.x.toFixed(1)} · Y ${p.y.toFixed(1)} · Z ${p.z.toFixed(1)}`; position.dataset.x = String(p.x); position.dataset.y = String(p.y); position.dataset.z = String(p.z); position.dataset.grounded = String(p.grounded); app.dataset.tick = String(state.tick);
        const edits = document.querySelector<HTMLElement>('#edit-count')!; edits.textContent = `地形編集 ${state.edits}`; edits.dataset.count = String(state.edits);
        document.querySelector('#metrics')!.textContent = `${fps} FPS · 描画 ${renderer.info.render.calls}回 · ${renderer.info.render.triangles.toLocaleString()}面 / Tick ${m.tickMs.toFixed(2)}ms · Mesh ${m.meshMs.toFixed(1)}ms · 編集 ${m.editMs.toFixed(0)}ms / 水 ${state.fluids.length}セル (${m.fluidMs.toFixed(2)}ms) / 水面 ${world.waterStats.meshMs.toFixed(1)}ms(背景) 適用 ${world.waterStats.applyMs.toFixed(2)}ms · 物理 ${state.bodies.length}個 (${m.physicsMs.toFixed(2)}ms) · ジャンプ ${m.jumpHeight.toFixed(2)}m / Brick ${m.bricks} · 待機 ${m.pending} / Upload ${terrainQueue.stats.milliseconds.toFixed(2)}ms · 待機 ${terrainQueue.size} · Geometry ${renderer.info.memory.geometries}個`;
        lastUI = now;
      }
    }
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);
  return () => { stopped = true; cancelAnimationFrame(frame); controller.abort(); worker?.terminate();terrainQueue.clear(); pipeline.dispose(); terrain.dispose(); world.dispose(); disposeSurfaceMaps(); renderer.dispose(); };
}
