import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gameplayNoticePosition, rectanglesOverlap } from '../../src/dungeon/notice-placement';

/** Isolated layout regression, not gameplay acceptance or a server-state fixture. */
test('visible short and long gameplay notices leave all controls and HUD readable', async ({ page }) => {
  const css = readFileSync('src/dungeon/style.css', 'utf8');
  // The real page opts into device-width CSS pixels. Without its viewport meta,
  // Android renders a 980px layout and scales it into the requested phone width.
  const viewportMeta = readFileSync('index.html', 'utf8').match(/<meta name="viewport"[^>]*>/)?.[0];
  expect(viewportMeta, 'Use the production viewport contract in this isolated fixture').toBeTruthy();
  const actions = ['attack', 'heavy', 'block', 'interact', 'heal', 'crouch', 'skill'].map(id => `<button class="dungeon-button dungeon-action-button" data-check="${id}"><span>${id === 'skill' ? '疾駆' : '操作'}</span></button>`).join('');
  for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }, { width: 390, height: 600 }, { width: 844, height: 390 }, { width: 760, height: 360 }]) {
    await page.setViewportSize(viewport);
    for (const message of ['遠征を開始しました', '接続を確認してください。持ち物はサーバーへ保存されるまで確定しません。'.repeat(8)]) {
      await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="UTF-8">${viewportMeta}<style>${css}</style></head><body><main class="dungeon-app"><div class="dungeon-shell">
        <header class="dungeon-header" data-protect>ASHEN VAULT</header>
        <section class="dungeon-hud"><div class="dungeon-vitals" data-protect><strong class="dungeon-player-name">城塞兵の任意訓練を試す探索者 · 城塞兵</strong><span class="dungeon-hp-text">125 / 125</span><div class="dungeon-health-track"></div><div class="dungeon-resources">灰鉄の片剣 · 薬 2</div><div class="dungeon-guard-label">防御の構え</div><div class="dungeon-guard-track"></div><div class="dungeon-skill-state">疾駆 · 発動中 2.0秒</div><ol class="dungeon-events"><li>ほかの探索者が疾駆を発動</li><li>探索者が硬守を発動</li></ol></div>
        <div class="dungeon-objective" data-protect><span class="dungeon-eyebrow">TIME TO RETURN</span><strong class="dungeon-timer">7:52</strong><span class="dungeon-alive-count">生存1/1人</span></div>
        <div class="dungeon-nearby" data-protect>${[1, 2, 3].map(n => `<div class="dungeon-nearby-target"><span>帰還の光</span><button class="dungeon-button" data-check="nearby${n}">調べる</button></div>`).join('')}</div></section>
        <div class="dungeon-gameplay-controls"><div class="dungeon-touch-pad dungeon-move-pad" data-check="move" data-protect>移動</div><div class="dungeon-touch-pad dungeon-look-pad" data-check="look" data-protect>視点</div><div class="dungeon-action-bar" data-protect>${actions}</div></div>
        <div class="dungeon-notice dungeon-notice-gameplay"><span class="dungeon-notice-text" tabindex="0">${message}</span><button class="dungeon-button dungeon-notice-dismiss">閉じる</button></div>
      </div></main></body></html>`);
      await expect.poll(() => page.evaluate(() => ({width: innerWidth, height: innerHeight, mode: document.compatMode})),
        {message: 'The fixture must use the requested CSS viewport, without mobile page scaling'}).toEqual({...viewport, mode: 'CSS1Compat'});
      const obstacles = await page.locator('[data-protect]').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
      let placed = false;
      for (const width of [...(viewport.height > viewport.width ? [Math.min(230, viewport.width - 160)] : []), Math.min(340, viewport.width - 16), 280, 220, 160, 140]) {
        await page.locator('.dungeon-notice').evaluate((node, width) => { (node as HTMLElement).style.width = `${width}px`; }, width);
        const height = await page.locator('.dungeon-notice').evaluate(node => node.getBoundingClientRect().height);
        const position = gameplayNoticePosition(viewport, { width, height }, obstacles);
        if (!position) continue;
        await page.locator('.dungeon-notice').evaluate((node, p) => { Object.assign((node as HTMLElement).style, { left: `${p.x}px`, top: `${p.y}px` }); }, position); placed = true; break;
      }
      expect(placed, `free visible notice area ${viewport.width}×${viewport.height}`).toBe(true);
      // Keep all layout comparisons in the same DOM/CSS coordinate space as
      // the protected rectangles and production placement, not CDP quad rounding.
      const notice = await page.locator('.dungeon-notice').evaluate(node => { const r = node.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height}; });
      expect(notice.height).toBeLessThanOrEqual(72);
      const skill = (await page.locator('.dungeon-skill-state').boundingBox())!, events = (await page.locator('.dungeon-events').boundingBox())!;
      expect(events.y).toBeGreaterThanOrEqual(skill.y + skill.height);
      expect(obstacles.some(rect => rectanglesOverlap(notice, rect)), 'notice must not cover HUD or controls').toBe(false);
      const hits = await page.locator('[data-check], .dungeon-notice-dismiss').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => { const r = node.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { id: node.getAttribute('data-check') ?? 'dismiss', hit: !!hit && node.contains(hit) }; }));
      expect(hits.filter(hit => !hit.hit)).toEqual([]);
    }
  }
});
