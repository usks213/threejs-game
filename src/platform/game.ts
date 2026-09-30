import * as THREE from 'three';
import { createPlayer, stepPlayer, type Axis } from '../core/player';
import { keyboardInput } from '../input/keyboard/keyboard';
import { touchInput } from '../input/touch/stick';
import { createWorld } from '../rendering/scene/world';
import { followCamera } from '../rendering/camera/follow';
export function startGame() {
  const controller = new AbortController(); const { signal } = controller;
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const error = document.querySelector<HTMLElement>('#error')!;
  let stopped = false; let frame = 0;
  const fail = (message: string) => { stopped = true; cancelAnimationFrame(frame); error.hidden = false; error.textContent = message; status.textContent = '起動エラー'; document.querySelector('#app')!.setAttribute('data-state', 'error'); };
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); }
  catch { fail('WebGLを起動できませんでした。ブラウザを更新し、ハードウェアアクセラレーションを確認してください。'); return () => controller.abort(); }
  const world = createWorld(); const state = createPlayer();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80); camera.position.set(0, 9, 11);
  const readKeyboard = keyboardInput(signal);
  const touch = touchInput(document.querySelector('#stick')!, document.querySelector('#knob')!, signal);
  const input: Axis = { x: 0, z: 0 };
  const resize = () => { renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / Math.max(1, window.innerHeight); camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize, { signal }); resize();
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('WebGLの接続が失われました。ページを再読み込みしてください。'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { error.textContent = '描画接続が戻りました。ページを再読み込みしてください。'; }, { signal });
  document.querySelector('#reset')!.addEventListener('click', () => { state.x = state.z = state.heading = 0; }, { signal });
  let previous = performance.now(); let uiTime = 0;
  document.addEventListener('visibilitychange', () => { previous = performance.now(); }, { signal });
  const position = document.querySelector<HTMLElement>('#position')!;
  const animate = (now: number) => {
    if (stopped) return;
    const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (!document.hidden) {
      readKeyboard(input); if (touch.x || touch.z) { input.x = touch.x; input.z = touch.z; }
      stepPlayer(state, input, dt); world.player.position.set(state.x, 0, state.z); world.player.rotation.y = state.heading;
      followCamera(camera, state, dt); renderer.render(world.scene, camera);
      if (now - uiTime > 100) { position.textContent = `X ${state.x.toFixed(1)} / Z ${state.z.toFixed(1)}`; position.dataset.x = String(state.x); position.dataset.z = String(state.z); uiTime = now; }
    }
    frame = requestAnimationFrame(animate);
  };
  try { renderer.render(world.scene, camera); status.textContent = 'プレイ中'; document.querySelector('#app')!.setAttribute('data-state', 'running'); frame = requestAnimationFrame(animate); }
  catch { fail('描画の初期化に失敗しました。ページを再読み込みしてください。'); }
  return () => { stopped = true; cancelAnimationFrame(frame); controller.abort(); world.dispose(); renderer.dispose(); };
}
