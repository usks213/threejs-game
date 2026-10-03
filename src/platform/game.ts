import { gameSound } from '../audio/sound';
import { networkUI } from './network';
import { adventureUI } from '../ui/adventure';
import type { GameAction } from '../game/types';
import * as THREE from 'three';
import type { Axis } from '../core/player';
import { keyboardInput } from '../input/keyboard/keyboard';
import { touchInput } from '../input/touch/stick';
import { cameraInput } from '../input/touch/look';
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
  const sound = gameSound(signal);
  document.querySelector('#sound-toggle')!.addEventListener('click', () => { document.querySelector('#sound-toggle')!.textContent = sound.toggle() ? '音 OFF' : '音 ON'; }, { signal });
  const notice = (message: string) => { document.querySelector('#notice')!.textContent = message; sound.effect(message); };
  let stopped = false, frame = 0, worker: Worker | undefined;
  const fail = (message: string) => { stopped = true; cancelAnimationFrame(frame); worker?.terminate(); error.hidden = false; error.textContent = message; status.textContent = '起動エラー'; app.dataset.state = 'error'; };
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); }
  catch { fail('WebGLを起動できませんでした。ブラウザを更新し、ハードウェアアクセラレーションを確認してください。'); return () => controller.abort(); }
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const world = createWorld(), terrain = createTerrain(world.scene);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
  const readKeyboard = keyboardInput(signal), touch = touchInput(document.querySelector('#stick')!, document.querySelector('#knob')!, signal), view = cameraInput(canvas, signal);
  const input: Axis = { x: 0, z: 0 };
  const raycaster = new THREE.Raycaster(), center = new THREE.Vector2(0, 0), normal = new THREE.Vector3(), markerAxis = new THREE.Vector3(0, 0, 1);
  const cameraPosition = new THREE.Vector3(), focus = new THREE.Vector3(), orbit = new THREE.Vector3();
  const obstruction = new THREE.Raycaster();
  let building = '', spell = 'ember';
  let state: Snapshot | null = null, tool: Tool = 'dig', jump = false, target: Vec3 | null = null, lastInput = 0, lastRay = 0, lastUI = 0;
  const names: Record<Tool, string> = { dig: '掘る', add: '盛る', water: '水を流す', rock: '岩を落とす' };
  const post = (message: ClientMessage) => { if (!stopped) worker?.postMessage(message); };
  const network = networkUI(signal, post, notice);
  const send = (message: ClientMessage) => { if (!network.forward(message)) post(message); };
  const persistence = persistenceUI(send, signal, notice);
  const gameAction = (action: GameAction, id?: string) => { if (action === 'spell' && id) spell = id; send({ type: 'game-action', action, id, target: target ?? undefined, aim: { x: -Math.sin(view.yaw), y: -Math.sin(view.pitch) * 0.5, z: -Math.cos(view.yaw) } }); };
  const adventure = adventureUI(signal, gameAction, id => { building = id; use.textContent = '設置'; });
  for (const id of ['gather', 'attack', 'heavy', 'guard', 'dodge'] as const) actionInput(document.querySelector<HTMLButtonElement>('#' + id)!, () => gameAction(id), signal);
  actionInput(document.querySelector<HTMLButtonElement>('#cast')!, () => gameAction('spell', spell), signal);
  const use = document.querySelector<HTMLButtonElement>('#use-tool')!;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) button.addEventListener('click', () => {
    building = ''; tool = button.dataset.tool as Tool; use.textContent = names[tool];
    for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b === button));
  }, { signal });
  const act = () => { if (target && building) gameAction('build', building); else if (target) send({ type: 'action', tool, target }); else notice('近くの地面に照準を合わせてください'); };
  actionInput(use, act, signal);
  actionInput(document.querySelector<HTMLButtonElement>('#jump')!, () => { jump = true; }, signal);
  document.querySelector('#view-reset')!.addEventListener('click', () => { view.yaw = 0; view.pitch = 0.55; }, { signal });
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); jump = true; } if (e.code === 'KeyF' && !e.repeat) act(); if (e.code === 'KeyE' && !e.repeat) gameAction('gather'); if (e.code === 'KeyQ' && !e.repeat) gameAction('attack'); if (e.code === 'ShiftLeft' && !e.repeat) gameAction('dodge'); if (e.code === 'KeyR' && !e.repeat) gameAction('heavy'); }, { signal });
  document.querySelector('#reset')!.addEventListener('click', () => send({ type: 'reset-player' }), { signal });
  const resize = () => { target = null; renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / Math.max(1, window.innerHeight); camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize, { signal }); resize();
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('WebGLの接続が失われました。保存したワールドは再読込できます。ページを再読み込みしてください。'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { error.textContent = '描画接続が戻りました。ページを再読み込みしてください。'; }, { signal });
  world.player.position.set(0, terrainHeight(0, 8), 8);
  let first = true;
  try {
    worker = new Worker(new URL('../simulation/worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = () => fail('地形処理を開始できませんでした。ページを再読み込みしてください。');
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (stopped) return;
      const message = event.data; if (network.receive(message)) return;
      if (message.type === 'mesh') terrain.update(message.mesh);
      else if (message.type === 'mesh-batch') for (const mesh of message.meshes) terrain.update(mesh);
      else if (message.type === 'remove') terrain.remove(message.ids);
      else if (message.type === 'snapshot') { state = message.state; world.update(state); if (first) { world.player.position.set(state.player.x, state.player.y, state.player.z); first = false; } }
      else if (message.type === 'ready') { status.textContent = 'プレイ中'; app.dataset.state = 'running'; send({ type: 'save' }); }
      else if (message.type === 'save' && !network.guest) persistence.receive(message.save);
      else if (message.type === 'notice') notice(message.message);
      else if (message.type === 'error') fail(message.message);
    };
    void persistence.load().then(save => { if (!stopped) send({ type: 'init', save }); });
  } catch { fail('このブラウザで地形Workerを起動できませんでした。ChromeまたはSafariを更新してください。'); }
  let previous = performance.now(), fpsStarted = previous, frames = 0, fps = 0;
  document.addEventListener('visibilitychange', () => { previous = performance.now(); if(document.hidden)send({type:'save'}); send({ type: 'pause', paused: document.hidden }); }, { signal });
  const position = document.querySelector<HTMLElement>('#position')!;
  const animate = (now: number) => {
    if (stopped) return;
    const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden) {
      readKeyboard(input); if (touch.x || touch.z) { input.x = touch.x; input.z = touch.z; }
      if (now - lastInput > 30) { const sin = Math.sin(view.yaw), cos = Math.cos(view.yaw); send({ type: 'input', input: { x: input.x * cos + input.z * sin, z: input.z * cos - input.x * sin, jump } }); jump = false; lastInput = now; }
      if (state) { const p = state.player, alpha = 1 - Math.exp(-18 * dt); world.player.position.lerp(focus.set(p.x, p.y, p.z), alpha); world.player.rotation.y = p.heading; }
      orbitPose(world.player.position, view.yaw, view.pitch, focus, orbit, camera.up);
      obstruction.set(focus, orbit); obstruction.far = 9;
      const blocker = terrain.raycast(obstruction);
      const distance = blocker ? Math.max(0.15, blocker.distance - 0.2) : 9;
      cameraPosition.copy(focus).addScaledVector(orbit, distance);
      camera.position.copy(cameraPosition); camera.lookAt(focus); camera.updateMatrixWorld();
      world.player.visible = camera.position.distanceTo(world.player.position) > 1.6;
      if (state && now - lastRay > 80) {
        raycaster.setFromCamera(center, camera); let hit = terrain.raycast(raycaster);
        if (building) { const piece = world.raycastBuildings(raycaster); if (piece && (!hit || piece.distance < hit.distance)) hit = piece; }
        if (hit && hit.point.distanceTo(focus.set(state.player.x, state.player.y + 0.7, state.player.z)) <= 7) {
          target = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
          normal.copy(hit.face?.normal ?? markerAxis); world.marker.position.copy(hit.point).addScaledVector(normal, 0.04); world.marker.quaternion.setFromUnitVectors(markerAxis, normal); world.marker.visible = true;
        } else { target = null; world.marker.visible = false; }
        use.disabled = !target; document.querySelector('#target-hint')!.textContent = target ? '右のボタンで地形を編集' : '近くの地面に照準を合わせる'; lastRay = now;
      }
      try { renderer.render(world.scene, camera); } catch { fail('描画に失敗しました。ページを再読み込みしてください。'); return; }
      frames++; if (now - fpsStarted > 1000) { fps = Math.round(frames * 1000 / (now - fpsStarted)); fpsStarted = now; frames = 0; }
      if (state && now - lastUI > 200) {
        const p = state.player, m = state.metrics; adventure.update(state.adventure, p);
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
  return () => { stopped = true; cancelAnimationFrame(frame); controller.abort(); worker?.terminate(); terrain.dispose(); world.dispose(); renderer.dispose(); };
}
