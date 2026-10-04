import { meadowBuilding } from '../content/meadows/recipes';
import { createPipeline } from '../rendering/postprocessing/pipeline';
import { disposeSurfaceMaps } from '../rendering/materials/pbr';
import { BUILDINGS, WEAPONS } from '../content/catalog';
import { placementPoint, placementIssue } from '../game/placement';
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
import { cameraInput, DEFAULT_CAMERA_PITCH } from '../input/touch/look';
import { actionInput } from '../input/touch/action';
import { orbitPose } from '../rendering/camera/follow';
import { createWorld } from '../rendering/scene/world';
import { createTerrain } from '../rendering/voxel/terrain';
import { persistenceUI } from '../ui/persistence';
import { terrainHeight } from '../world/density';
import type { ClientMessage, Snapshot, Tool, WorkerMessage } from '../simulation/protocol';
import type { Vec3 } from '../world/types';
export function startGame() {
  const controller = new AbortController(), { signal } = controller;
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!, app = document.querySelector<HTMLElement>('#app')!;
  const status = document.querySelector<HTMLElement>('#status')!, error = document.querySelector<HTMLElement>('#error')!;
  gameShell(signal);
  const sound = gameSound(signal);document.querySelector<HTMLInputElement>('#sound-volume')!.addEventListener('input',e=>sound.setVolume(Number((e.target as HTMLInputElement).value)),{signal});
  document.querySelector('#sound-toggle')!.addEventListener('click', () => { document.querySelector('#sound-toggle')!.textContent = sound.toggle() ? '音 OFF' : '音 ON'; }, { signal });
  let noticeTimer: ReturnType<typeof setTimeout> | undefined, lastNotice = 0;
  const notice = (message: string) => { const el = document.querySelector<HTMLElement>('#notice')!; if (el.textContent === message && performance.now()-lastNotice<900) return; lastNotice=performance.now(); el.textContent=message; el.classList.add('visible'); clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>el.classList.remove('visible'),2200); sound.effect(message); };
  signal.addEventListener('abort',()=>clearTimeout(noticeTimer),{once:true});
  let stopped = false, frame = 0, worker: Worker | undefined;
  const fail = (message: string) => { stopped = true; cancelAnimationFrame(frame); worker?.terminate(); error.hidden = false; error.textContent = message; status.textContent = '起動エラー'; app.dataset.state = 'error'; };
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); }
  catch { fail('WebGLを起動できませんでした。ブラウザを更新し、ハードウェアアクセラレーションを確認してください。'); return () => controller.abort(); }
  if(!renderer.extensions.has('EXT_color_buffer_float')){fail('この端末ではHDR描画に必要なWebGL機能を利用できません。Chromeを更新してください。');renderer.dispose();return ()=>controller.abort();}
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{console.error('WebGL shader compilation failed',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));fail('GPUシェーダーの起動に失敗しました。ブラウザを更新して再読み込みしてください。');};
  renderer.info.autoReset=false;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  const world = createWorld(renderer), terrain = createTerrain(world.scene);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
  const pipeline=createPipeline(renderer,world.scene,camera,world.atmosphere);
  const readKeyboard = keyboardInput(signal), touch = touchInput(document.querySelector('#stick')!, document.querySelector('#knob')!, signal), view = cameraInput(canvas, signal);
  const input: Axis = { x: 0, z: 0 };
  const raycaster = new THREE.Raycaster(), center = new THREE.Vector2(0, 0), normal = new THREE.Vector3(), markerAxis = new THREE.Vector3(0, 0, 1);
  const cameraPosition = new THREE.Vector3(), focus = new THREE.Vector3(), orbit = new THREE.Vector3();
  const obstruction = new THREE.Raycaster();
  let buildHeight=0,freePlacement=false;let building = '', buildRotation=0, placement:Vec3|null=null, spell = 'ember';
  const buildControls=document.querySelector<HTMLElement>('#build-controls')!;
  document.querySelector('#build-rotate')!.addEventListener('click',()=>{buildRotation+=Math.PI/2;},{signal});
  for(const [id,delta]of [['build-up',.5],['build-down',-.5]] as const)document.querySelector('#'+id)!.addEventListener('click',()=>{buildHeight=Math.max(-2,Math.min(6,buildHeight+delta));},{signal});
  document.querySelector('#build-snap')!.addEventListener('click',e=>{freePlacement=!freePlacement;(e.currentTarget as HTMLButtonElement).textContent=freePlacement?'自由配置':'接続配置';},{signal});
  document.querySelector('#build-cancel')!.addEventListener('click',()=>{building='';buildControls.hidden=true;use.textContent=names[tool];},{signal});
  for(const [id,property] of [['camera-distance','distance'],['camera-sensitivity','sensitivity']] as const)document.querySelector<HTMLInputElement>('#'+id)!.addEventListener('input',e=>{view[property]=Number((e.target as HTMLInputElement).value);},{signal});
  document.querySelector<HTMLInputElement>('#shadows-enabled')!.addEventListener('change',e=>{renderer.shadowMap.enabled=(e.target as HTMLInputElement).checked;renderer.shadowMap.needsUpdate=true;},{signal});
  let first=true,dirtyWorld=false;
  let state: Snapshot | null = null, tool: Tool = 'dig', jump = false, target: Vec3 | null = null, lastInput = 0, lastRay = 0, lastUI = 0;
  // A removed surface remains a valid fill location while the player aims at the hole.
  const editedPoint = new THREE.Vector3(); let hasEditedPoint = false;
  const names: Record<Tool, string> = { dig: '掘る', add: '盛る', water: '水を流す', rock: '岩を落とす' };
  const post = (message: ClientMessage) => { if(message.type==='init'||message.type==='replica-init'){app.dataset.state='loading';status.textContent='ワールドを準備中…';state=null;first=true;hasEditedPoint=false;} if (!stopped) worker?.postMessage(message); };
  const network = networkUI(signal, post, notice);
  const send = (message: ClientMessage) => { if (!network.forward(message)) post(message); };
  const persistence = persistenceUI(send, signal, notice);
  const gameAction = (action: GameAction, id?: string) => {
    if(action==='spell'&&id)spell=id;
    let aim={x:-Math.sin(view.yaw),y:-Math.sin(view.pitch)*.5,z:-Math.cos(view.yaw)};
    if(action==='build')aim={x:Math.sin(buildRotation),y:0,z:Math.cos(buildRotation)};
    if(state&&(action==='attack'||action==='heavy')){
      const p=state.player,reach=(WEAPONS[state.adventure.equipment]??WEAPONS.hands).reach;
      const enemy=state.adventure.enemies.filter(e=>{const d=Math.hypot(e.x-p.x,e.z-p.z);return e.health>0&&d<reach+.4&&Math.abs(e.y-p.y)<2&&(d<1||((e.x-p.x)*aim.x+(e.z-p.z)*aim.z)/d>.3);}).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
      if(enemy){const d=Math.hypot(enemy.x-p.x,enemy.z-p.z)||1;aim={x:(enemy.x-p.x)/d,y:0,z:(enemy.z-p.z)/d};}
    }
    if(action==='dodge'&&(input.x||input.z)){const sin=Math.sin(view.yaw),cos=Math.cos(view.yaw),length=Math.hypot(input.x,input.z);aim={x:(input.x*cos+input.z*sin)/length,y:0,z:(input.z*cos-input.x*sin)/length};}
    send({type:'game-action',action,id,target:action==='build'?placement??undefined:target??undefined,aim});
  };
  const adventure = adventureUI(signal, gameAction, id => { building=id;buildHeight=0;buildRotation=Math.round((view.yaw+Math.PI)/(Math.PI/2))*Math.PI/2;buildControls.hidden=false;use.textContent='設置'; });
  for (const id of ['gather', 'attack', 'heavy', 'guard', 'dodge'] as const) { const button=document.querySelector<HTMLButtonElement>('#'+id)!; if(id==='attack')holdAction(button,()=>{if(!state||state.adventure.attack<=0)gameAction(id);},()=>true,signal);else actionInput(button,()=>gameAction(id),signal); }
  for(const id of ['sprint','sneak'] as const)actionInput(document.querySelector<HTMLButtonElement>('#'+id)!,()=>gameAction(id),signal);
  actionInput(document.querySelector<HTMLButtonElement>('#quick-eat')!,()=>gameAction('eat'),signal);
  actionInput(document.querySelector<HTMLButtonElement>('#cast')!, () => gameAction(state?.adventure.meadows?'interact':'spell', spell), signal);
  const use = document.querySelector<HTMLButtonElement>('#use-tool')!;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) button.addEventListener('click', () => {
    building = '';buildControls.hidden=true; tool = button.dataset.tool as Tool; use.textContent = names[tool]; app.dataset.tool=tool; use.disabled = tool !== 'water' && !target;
    for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b === button));
  }, { signal });
  for(const [id,icon,label] of [['attack','sword','攻撃'],['water-cast','water','放水'],['guard','shield','盾'],['heavy','axe','強撃'],['cast','staff','魔法'],['adventure-menu','bag','持物'],['build-rotate','hammer','回転'],['quick-eat','berry','食事']] ){const button=document.querySelector<HTMLButtonElement>('#'+id)!;button.innerHTML=itemIcon(icon)+'<span>'+label+'</span>';if(id==='attack')button.setAttribute('aria-label','攻撃');}
  const pour = () => { const p = state?.player ?? world.player.position; send({ type: 'action', tool: 'water', target: target ?? { x:p.x-Math.sin(view.yaw)*2, y:p.y+0.5, z:p.z-Math.cos(view.yaw)*2 } }); };
  holdAction(document.querySelector<HTMLButtonElement>('#water-cast')!, pour, () => true, signal);
  const act = () => { if (!building && tool === 'water') pour(); else if (target && building) gameAction('build', building); else if (target) { if(tool==='dig'||tool==='add'){editedPoint.set(target.x,target.y,target.z);hasEditedPoint=true;} send({ type: 'action', tool, target }); } else notice('近くの地面に照準を合わせてください'); };
  holdAction(use, act, () => !building && tool === 'water', signal);
  actionInput(document.querySelector<HTMLButtonElement>('#jump')!, () => { jump = true; }, signal);
  document.querySelector('#view-reset')!.addEventListener('click', () => { view.yaw = 0; view.pitch = DEFAULT_CAMERA_PITCH; }, { signal });
  window.addEventListener('keydown', e => { if((e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true]'))return; if (e.code === 'Space' && !e.repeat) { e.preventDefault(); jump = true; } if (e.code === 'KeyF' && !e.repeat) act(); if (e.code === 'KeyE' && !e.repeat) gameAction('gather'); if (e.code === 'KeyQ' && !e.repeat) gameAction('attack'); if (e.code === 'ShiftLeft' && !e.repeat) gameAction('dodge'); if (e.code === 'KeyR' && !e.repeat) gameAction('heavy'); }, { signal });
  document.querySelector('#reset')!.addEventListener('click', () => send({ type: 'reset-player' }), { signal });
  const resize = () => { target = null; camera.aspect = window.innerWidth / Math.max(1, window.innerHeight); camera.updateProjectionMatrix(); pipeline.resize(window.innerWidth,window.innerHeight); };
  window.addEventListener('resize', resize, { signal }); resize();
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('WebGLの接続が失われました。保存したワールドは再読込できます。ページを再読み込みしてください。'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { error.textContent = '描画接続が戻りました。ページを再読み込みしてください。'; }, { signal });
  world.player.position.set(0, terrainHeight(0, 8), 8);
  try {
    worker = new Worker(new URL('../simulation/worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = () => fail('地形処理を開始できませんでした。ページを再読み込みしてください。');
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (stopped) return;
      const message = event.data; if (network.receive(message)) return;
      if (message.type === 'mesh') terrain.update(message.mesh);
      else if (message.type === 'mesh-batch') for (const mesh of message.meshes) terrain.update(mesh);
      else if (message.type === 'remove') terrain.remove(message.ids);
      else if (message.type === 'snapshot') { state = message.state;dirtyWorld=true; if (first) { world.player.position.set(state.player.x, state.player.y, state.player.z); first = false; } }
      else if (message.type === 'ready') { status.textContent = 'プレイ中'; app.dataset.state = 'running'; send({ type: 'save' }); }
      else if (message.type === 'save' && !network.guest) persistence.receive(message.save);
      else if (message.type === 'notice') notice(message.message);
      else if (message.type === 'error') fail(message.message);
    };
    void persistence.load().then(save => { if (!stopped) send({ type: 'init', save }); });
  } catch { fail('このブラウザで地形Workerを起動できませんでした。ChromeまたはSafariを更新してください。'); }
  let previous = performance.now(), fpsStarted = previous, frames = 0, fps = 0, lastShadow=0;
  document.addEventListener('visibilitychange', () => { previous = performance.now(); if(document.hidden)send({type:'save'}); send({ type: 'pause', paused: document.hidden }); }, { signal });
  const position = document.querySelector<HTMLElement>('#position')!;
  const animate = (now: number) => {
    if (stopped) return;
    const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden) {
      readKeyboard(input); if (touch.x || touch.z) { input.x = touch.x; input.z = touch.z; }
      if(document.querySelector('[role=dialog]:not([hidden])')){input.x=0;input.z=0;jump=false;}
      if (now - lastInput > 30) { const sin = Math.sin(view.yaw), cos = Math.cos(view.yaw); send({ type: 'input', input: { x: input.x * cos + input.z * sin, z: input.z * cos - input.x * sin, jump } }); jump = false; lastInput = now; }
      if(state&&dirtyWorld){world.update(state);sound.update(state);dirtyWorld=false;}
      if (state) { const p = state.player, alpha = 1 - Math.exp(-18 * dt); world.player.position.lerp(focus.set(p.x, p.y, p.z), alpha); world.player.rotation.y = p.heading; }
      world.interpolate(dt);
      orbitPose(world.player.position, view.yaw, view.pitch, focus, orbit, camera.up);
      obstruction.set(focus, orbit); obstruction.far = view.distance;
      const blocker = terrain.raycast(obstruction);
      const distance = blocker ? Math.max(0.15, blocker.distance - 0.2) : view.distance;
      cameraPosition.copy(focus).addScaledVector(orbit, distance);
      camera.position.copy(cameraPosition); camera.lookAt(focus); camera.updateMatrixWorld();
      world.player.visible = camera.position.distanceTo(world.player.position) > 1.6;
      if (state && now - lastRay > 80) {
        raycaster.setFromCamera(center, camera); let hit = terrain.raycast(raycaster);
        if (building) { const piece = world.raycastBuildings(raycaster); if (piece && (!hit || piece.distance < hit.distance)) hit = piece; }
        if (hit && hit.point.distanceTo(focus.set(state.player.x, state.player.y + 0.7, state.player.z)) <= 7) {
          target = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
          normal.copy(hit.face?.normal ?? markerAxis); world.marker.position.copy(hit.point).addScaledVector(normal, 0.04); world.marker.quaternion.setFromUnitVectors(markerAxis, normal); world.marker.visible = true;
        } else if (!building && tool==='add' && hasEditedPoint && editedPoint.distanceTo(focus)<7 && raycaster.ray.distanceToPoint(editedPoint)<1.6 && normal.copy(editedPoint).sub(raycaster.ray.origin).dot(raycaster.ray.direction)>0) {
          target={x:editedPoint.x,y:editedPoint.y,z:editedPoint.z};world.marker.position.copy(editedPoint);world.marker.quaternion.setFromUnitVectors(markerAxis,normal.set(0,1,0));world.marker.visible=true;
        } else { target = null; world.marker.visible = false; }
        placement=building&&target?(freePlacement?{...target}:placementPoint(target)):null;if(placement)placement.y+=buildHeight;
        if(building==='cook'&&placement){const fire=state.adventure.buildings.find(b=>b.definition==='fire'&&Math.hypot(b.x-placement!.x,b.z-placement!.z)<1);if(fire){placement.x=fire.x;placement.z=fire.z;placement.y=fire.y+.65;}}
        const rawDef=BUILDINGS.find(b=>b.id===building),def=rawDef&&state.adventure.meadows?meadowBuilding(rawDef):rawDef,issue=def&&placement?placementIssue(def,state.player,placement,state.adventure.buildings,state.adventure.inventory):'地面に照準を合わせる';
        world.preview(building,placement,buildRotation,!issue);
        document.querySelector('#build-hint')!.textContent=building?(issue||`${def?.name}を設置`):'';
        use.disabled = building?(!placement||!!issue):!target && (tool !== 'water' || !!building); document.querySelector('#target-hint')!.textContent = tool === 'water' && !building ? '長押しで放水' : target ? '' : '地面に照準を合わせる'; lastRay = now;
      }
      terrain.updateDetails(world.player.position,now/1000);world.faceCamera(camera);
      if(now-lastShadow>120){renderer.shadowMap.needsUpdate=true;lastShadow=now;}
      try { if(state)pipeline.render(dt); } catch (renderError) { console.error(renderError); fail('描画に失敗しました。ページを再読み込みしてください。'); return; }
      frames++; if (now - fpsStarted > 1000) { fps = Math.round(frames * 1000 / (now - fpsStarted)); fpsStarted = now; frames = 0; }
      if (state && now - lastUI > 200) {
        const p = state.player, m = state.metrics; if(state.adventure.meadows){document.querySelector('#cast')!.innerHTML=itemIcon('hammer')+'<span>使う</span>';} adventure.update(state.adventure, p,view.yaw);
        app.dataset.graphics=JSON.stringify({...world.atmosphere.stats,...pipeline.stats,features:['pbr','physical-sky','ibl','sh','volumetric','exposure','bloom','shadow','ssr']});
        app.dataset.cameraPitch = String(view.pitch); app.dataset.cameraYaw = String(view.yaw);
        position.textContent = `X ${p.x.toFixed(1)} · Y ${p.y.toFixed(1)} · Z ${p.z.toFixed(1)}`; position.dataset.x = String(p.x); position.dataset.y = String(p.y); position.dataset.z = String(p.z); position.dataset.grounded = String(p.grounded); app.dataset.tick = String(state.tick);
        const edits = document.querySelector<HTMLElement>('#edit-count')!; edits.textContent = `地形編集 ${state.edits}`; edits.dataset.count = String(state.edits);
        document.querySelector('#metrics')!.textContent = `${fps} FPS · 描画 ${renderer.info.render.calls}回 · ${renderer.info.render.triangles.toLocaleString()}面 / Tick ${m.tickMs.toFixed(2)}ms · Mesh ${m.meshMs.toFixed(1)}ms · 編集 ${m.editMs.toFixed(0)}ms / 水 ${state.fluids.length}セル (${m.fluidMs.toFixed(2)}ms) · 物理 ${state.bodies.length}個 (${m.physicsMs.toFixed(2)}ms) · ジャンプ ${m.jumpHeight.toFixed(2)}m / Brick ${m.bricks} · 待機 ${m.pending} · Geometry ${renderer.info.memory.geometries}個`;
        lastUI = now;
      }
    }
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);
  return () => { stopped = true; cancelAnimationFrame(frame); controller.abort(); worker?.terminate(); pipeline.dispose(); terrain.dispose(); world.dispose(); disposeSurfaceMaps(); renderer.dispose(); };
}
