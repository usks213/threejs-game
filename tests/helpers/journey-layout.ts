import { expect, type Page } from '@playwright/test';
import { singleLineHeightMatches } from './journey-line-height';

/** Read-only geometry check, including the portrait viewport's landscape transform. */
export async function expectJourneyTextFits(page: Page) {
 await expect(page.locator('#journey')).toBeVisible();
 const layout = await page.locator('#journey').evaluate((card: HTMLElement) => {
  const rotated = document.querySelector<HTMLElement>('#app')!.dataset.rotated === 'true';
  const logical = (rect: DOMRect) => rotated
   ? { left: rect.top, right: rect.bottom, top: innerWidth - rect.right, bottom: innerWidth - rect.left, width: rect.height, height: rect.width }
   : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  const box = logical(card.getBoundingClientRect()), style = getComputedStyle(card);
  const content = {
   left: box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
   right: box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
   top: box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
   bottom: box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom),
  };
  return {
   box, content, compact: Math.min(innerWidth, innerHeight) <= 350,
   lines: ['.goal-kicker', 'strong', 'small'].map(selector => {
    const element = card.querySelector<HTMLElement>(selector)!, css = getComputedStyle(element);
    return { selector, ...logical(element.getBoundingClientRect()), display: css.display, lineHeight: parseFloat(css.lineHeight), clamp: css.getPropertyValue('-webkit-line-clamp'), overflow: css.overflow, textOverflow: css.textOverflow, whiteSpace: css.whiteSpace };
   }),
  };
 });
 expect(layout.box.width, 'Journey remains a touch-sized target').toBeGreaterThanOrEqual(48);
 expect(layout.box.height).toBe(layout.compact ? 48 : 64);
 for (const line of layout.lines) {
  if (layout.compact && line.selector === '.goal-kicker') {
   expect(line.display).toBe('none');
   continue;
  }
  expect(line.display, `${line.selector} remains visible`).not.toBe('none');
  expect(line.height, `${line.selector} has visible text`).toBeGreaterThan(0);
  expect(line.left).toBeGreaterThanOrEqual(layout.content.left - 0.5);
  expect(line.right).toBeLessThanOrEqual(layout.content.right + 0.5);
  expect(line.top).toBeGreaterThanOrEqual(layout.content.top - 0.5);
  expect(line.bottom, `${line.selector} fits above the card padding, without cut glyphs`).toBeLessThanOrEqual(layout.content.bottom + 0.5);
  expect(line.overflow).toBe('hidden');
  if (line.selector === 'small') {
   expect(line.clamp, 'Long hints end with a two-line ellipsis').toBe('2');
   expect(line.height / line.lineHeight).toBeGreaterThanOrEqual(1);
   expect(line.height / line.lineHeight).toBeLessThanOrEqual(2);
  } else {
   expect(singleLineHeightMatches(line.height, line.lineHeight), `${line.selector} is one complete line: measured ${line.height}px, computed ${line.lineHeight}px`).toBe(true);
   expect(line.whiteSpace).toBe('nowrap');
   expect(line.textOverflow).toBe('ellipsis');
  }
 }
}
