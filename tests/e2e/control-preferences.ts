import type { Page } from '@playwright/test';
/** Preserve the existing two-hand acceptance as an explicitly selected option. */
export async function selectTwoHandControls(page: Page) {
  await page.locator('#menu-button').tap();
  await page.locator('[data-tab="settings"]').tap();
  await page.locator('#control-layout').selectOption('two-hand');
  await page.getByRole('button',{name:'世界に戻る',exact:true}).tap();
}
