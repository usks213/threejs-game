import { devices, expect, test, type Page } from '@playwright/test';
import { expectJourneyTextFits } from '../helpers/journey-layout';

const portrait = devices['iPhone 13'].viewport;
const landscape = devices['iPhone 13 landscape'].viewport;
type TouchObservation = { type: string; isTrusted: boolean; targetId: string | null; pointerType: string | null; touches: number | null };
type TouchWindow = Window & { webkitSmokeTouches?: TouchObservation[] };

const touchEvidence = (page: Page) => page.evaluate(() => (window as TouchWindow).webkitSmokeTouches ?? []);

async function observedTap(page: Page, id: string) {
 const before = (await touchEvidence(page)).length;
 // Native Playwright WebKit dispatchTapEvent, never dispatchEvent or property spoofing.
 await page.locator('#' + id).tap();
 await expect.poll(async () => {
  const observed = (await touchEvidence(page)).slice(before).filter(event => event.targetId === id && event.isTrusted);
  return {
   touchStart: observed.some(event => event.type === 'touchstart' && event.touches === 1),
   touchPointer: observed.some(event => event.type === 'pointerdown' && event.pointerType === 'touch'),
  };
 }, { message: `WebKit must deliver trusted touchstart and touch pointerdown to #${id}` }).toEqual({ touchStart: true, touchPointer: true });
}

async function running(page: Page) {
 await expect(page.locator('#app')).toHaveAttribute('data-state', 'running', { timeout: 60000 });
 await expect(page.locator('#error')).toBeHidden();
 await expect(page.locator('#game')).toBeVisible();
 // Read the real production context. Do not replace WebGL, the Worker, or startup state.
 const graphics = await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext('webgl2');
  return gl ? {
   version: gl.getParameter(gl.VERSION) as string,
   contextLost: gl.isContextLost(),
   width: gl.drawingBufferWidth,
   height: gl.drawingBufferHeight,
   floatColorBuffer: !!gl.getExtension('EXT_color_buffer_float'),
  } : null;
 });
 expect(graphics, 'Production game must own a live WebGL2 context').not.toBeNull();
 expect(graphics!.version).toContain('WebGL 2.0');
 expect(graphics!.contextLost).toBe(false);
 expect(graphics!.floatColorBuffer).toBe(true);
 expect(graphics!.width).toBeGreaterThan(0);
 expect(graphics!.height).toBeGreaterThan(0);
 const draws = async () => JSON.parse(await page.locator('#app').getAttribute('data-streaming') ?? '{}').draws ?? 0;
 const initialDraws = await draws();
 await expect.poll(draws, { message: 'Real renderer must keep submitting game frames' }).toBeGreaterThan(initialDraws);
 const initialTick = Number(await page.locator('#app').getAttribute('data-tick'));
 await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-tick'))).toBeGreaterThan(initialTick);
 return graphics;
}

async function logicalLandscape(page: Page, viewport: { width: number; height: number }) {
 await expect(page.locator('#app')).toHaveAttribute('data-rotated', String(viewport.height > viewport.width));
 await expect(page.locator('#game')).toHaveJSProperty('clientWidth', Math.max(viewport.width, viewport.height));
 await expect(page.locator('#game')).toHaveJSProperty('clientHeight', Math.min(viewport.width, viewport.height));
}

test('iPhone WebKit smoke boots real WebGL, rotates and preserves original adventure settings', async ({ page, browserName }, info) => {
 test.setTimeout(180000);
 expect(browserName).toBe('webkit');
 expect(info.project.use.hasTouch).toBe(true);
 expect(info.project.use.isMobile).toBe(true);
 const touchPhases: { phase: string; events: TouchObservation[] }[] = [];
 await page.addInitScript(() => {
  // Passive observation only: do not alter input, browser capabilities or game state.
  const events: TouchObservation[] = [];
  (window as TouchWindow).webkitSmokeTouches = events;
  const observe = (event: Event) => events.push({
   type: event.type,
   isTrusted: event.isTrusted,
   targetId: event.target instanceof Element ? event.target.closest('[id]')?.id ?? null : null,
   pointerType: event.type === 'pointerdown' ? (event as PointerEvent).pointerType : null,
   touches: event.type === 'touchstart' ? (event as TouchEvent).touches.length : null,
  });
  document.addEventListener('touchstart', observe, { capture: true, passive: true });
  document.addEventListener('pointerdown', observe, { capture: true, passive: true });
 });
 const errors: string[] = [];
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => {
  if (message.type() === 'error' && /WebGL|shader|THREE/i.test(message.text())) errors.push(message.text());
 });
 const graphics: unknown[] = [];
 try {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  graphics.push(await running(page));
  if (process.env.EXPECTED_COMMIT) {
   expect(process.env.EXPECTED_COMMIT).toMatch(/^[a-f0-9]{40}$/);
   await expect(page.locator('#build-version')).toHaveAttribute('data-commit', process.env.EXPECTED_COMMIT);
  }
  await logicalLandscape(page, portrait);
  await expectJourneyTextFits(page);
  await expect(page).toHaveTitle(/空と灯の大地/);
  await expect(page.locator('#journey')).toContainText('木材で最初の灯をつなごう');
  await expect(page.locator('#adventure-hud')).toContainText('HP');
  await expect(page.locator('#hotbar button')).toHaveCount(8);
  await page.screenshot({ path: info.outputPath('iphone-webkit-portrait.png'), scale: 'css' });

  await page.setViewportSize(landscape);
  await logicalLandscape(page, landscape);
  await expectJourneyTextFits(page);
  // Locator taps use WebKit's touch API, without Chromium-only CDP gestures.
  await observedTap(page, 'powers-menu');
  await expect(page.getByRole('dialog', { name: '創作能力', exact: true })).toBeVisible();
  await expect(page.locator('#power-kind option')).toHaveCount(13);
  // Mobile WebKit exposes native taps, but neither swipes nor wheel input through
  // Playwright. Check gesture policy here; Android separately proves native swipes.
  expect(await page.locator('#powers-panel,#powers-close').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).touchAction))).toEqual(['manipulation','manipulation']);
  await observedTap(page, 'powers-close');
  await expect(page.getByRole('dialog', { name: '創作能力', exact: true })).toBeHidden();

  await page.setViewportSize(portrait);
  await logicalLandscape(page, portrait);
  await expectJourneyTextFits(page);
  await observedTap(page, 'system-menu');
  await expect(page.locator('#invert-camera')).not.toBeChecked();
  await expect(page.locator('#sound-caption-toggle')).not.toBeChecked();
  await observedTap(page, 'invert-camera');
  await observedTap(page, 'sound-caption-toggle');
  await expect(page.locator('#invert-camera')).toBeChecked();
  await expect(page.locator('#sound-caption-toggle')).toBeChecked();
  await observedTap(page, 'system-close');
  await expect(page.locator('#system-panel')).toBeHidden();
  touchPhases.push({ phase: 'before-reload', events: await touchEvidence(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  graphics.push(await running(page));
  await logicalLandscape(page, portrait);
  await expectJourneyTextFits(page);
  await observedTap(page, 'system-menu');
  await expect(page.locator('#invert-camera')).toBeChecked();
  await expect(page.locator('#sound-caption-toggle')).toBeChecked();
  await observedTap(page, 'system-close');
  await expect(page.locator('#system-panel')).toBeHidden();
  await page.setViewportSize(landscape);
  await logicalLandscape(page, landscape);
  await expectJourneyTextFits(page);
  await expect(page.locator('#error')).toBeHidden();
  await page.screenshot({ path: info.outputPath('iphone-webkit-landscape.png'), scale: 'css' });
  const slotRows=await page.locator('#hotbar button').evaluateAll(nodes=>new Set(nodes.map(n=>n.getBoundingClientRect().top)).size);
  expect(slotRows,'Eight full-size slots should fit one row in this landscape viewport').toBe(1);
  await expect(page.locator('#compass')).toBeVisible();
  // Ordinary settings controls produce a known fixed-quality comparison. This
  // screenshot is visual evidence, never a claim about physical iPhone FPS.
  await observedTap(page,'system-menu');
  await page.locator('#render-resolution').selectOption('medium');
  await observedTap(page,'view-reset');
  await expect(page.locator('#system-panel')).toBeHidden();
  await expect.poll(async()=>JSON.parse(await page.locator('#app').getAttribute('data-graphics')??'{}').renderScale).toBe(.75);
  const beforeFixedDraw=Number(JSON.parse(await page.locator('#app').getAttribute('data-streaming')??'{}').draws);
  await expect.poll(async()=>Number(JSON.parse(await page.locator('#app').getAttribute('data-streaming')??'{}').draws)).toBeGreaterThan(beforeFixedDraw);
  await page.screenshot({path:info.outputPath('iphone-webkit-fixed-medium.png'),scale:'css'});

  expect(errors).toEqual([]);
 } finally {
  const diagnostics = await page.locator('#app').evaluate(app => ({
   state: (app as HTMLElement).dataset.state,
   streaming: (app as HTMLElement).dataset.streaming,
   graphics: (app as HTMLElement).dataset.graphics,
   performance: (app as HTMLElement).dataset.performance,
   error: document.querySelector('#error')?.textContent,
   commit: document.querySelector<HTMLElement>('#build-version')?.dataset.commit,
   userAgent: navigator.userAgent,
   maxTouchPoints: navigator.maxTouchPoints,
   observedTouches: (window as TouchWindow).webkitSmokeTouches ?? [],
  })).catch(error => ({ unavailable: String(error) }));
  await info.attach('iphone-webkit-engine-evidence.json', {
   body: JSON.stringify({
    scope: 'Linux WebKit with the official iPhone 13 profile; not physical iPhone/Safari or phone FPS evidence',
    emulation: { profile: 'iPhone 13', browserName, hasTouch: info.project.use.hasTouch, isMobile: info.project.use.isMobile, deviceScaleFactor: info.project.use.deviceScaleFactor, viewport: info.project.use.viewport, userAgent: info.project.use.userAgent },
    expectedCommit: process.env.EXPECTED_COMMIT, graphics, errors, touchPhases, diagnostics,
   }, null, 2),
   contentType: 'application/json',
  });
 }
});
