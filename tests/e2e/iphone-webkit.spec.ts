import { devices, expect, test, type Page } from '@playwright/test';

const portrait = devices['iPhone 13'].viewport;
const landscape = devices['iPhone 13 landscape'].viewport;

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
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
  await expect(page).toHaveTitle(/空と灯の大地/);
  await expect(page.locator('#journey')).toContainText('風原');
  await expect(page.locator('#adventure-hud')).toContainText('HP');
  await expect(page.locator('#hotbar button')).toHaveCount(8);
  await page.screenshot({ path: info.outputPath('iphone-webkit-portrait.png'), scale: 'css' });

  await page.setViewportSize(landscape);
  await logicalLandscape(page, landscape);
  // Locator taps use WebKit's touch API, without Chromium-only CDP gestures.
  await page.locator('#powers-menu').tap();
  await expect(page.getByRole('dialog', { name: '創作能力', exact: true })).toBeVisible();
  await expect(page.locator('#power-kind option')).toHaveCount(13);
  await page.locator('#powers-close').tap();
  await expect(page.getByRole('dialog', { name: '創作能力', exact: true })).toBeHidden();

  await page.setViewportSize(portrait);
  await logicalLandscape(page, portrait);
  await page.locator('#system-menu').tap();
  await expect(page.locator('#invert-camera')).not.toBeChecked();
  await expect(page.locator('#sound-caption-toggle')).not.toBeChecked();
  await page.locator('#invert-camera').tap();
  await page.locator('#sound-caption-toggle').tap();
  await expect(page.locator('#invert-camera')).toBeChecked();
  await expect(page.locator('#sound-caption-toggle')).toBeChecked();
  await page.locator('#system-close').tap();
  await page.reload({ waitUntil: 'domcontentloaded' });
  graphics.push(await running(page));
  await logicalLandscape(page, portrait);
  await page.locator('#system-menu').tap();
  await expect(page.locator('#invert-camera')).toBeChecked();
  await expect(page.locator('#sound-caption-toggle')).toBeChecked();
  await page.locator('#system-close').tap();
  await page.setViewportSize(landscape);
  await logicalLandscape(page, landscape);
  await expect(page.locator('#error')).toBeHidden();
  await page.screenshot({ path: info.outputPath('iphone-webkit-landscape.png'), scale: 'css' });
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
  })).catch(error => ({ unavailable: String(error) }));
  await info.attach('iphone-webkit-engine-evidence.json', {
   body: JSON.stringify({
    scope: 'Linux WebKit with the official iPhone 13 profile; not physical iPhone/Safari or phone FPS evidence',
    expectedCommit: process.env.EXPECTED_COMMIT, graphics, errors, diagnostics,
   }, null, 2),
   contentType: 'application/json',
  });
 }
});
