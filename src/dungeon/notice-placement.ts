export interface NoticeRect { x: number; y: number; width: number; height: number }
export function rectanglesOverlap(a: NoticeRect, b: NoticeRect, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}
/** Pick the highest free information slot. Never displace gameplay controls or HUD values. */
export function gameplayNoticePosition(viewport: { width: number; height: number }, size: { width: number; height: number }, obstacles: readonly NoticeRect[]): NoticeRect | null {
  const margin = 8, { width, height } = size;
  if (width > viewport.width - margin * 2 || height > viewport.height - margin * 2) return null;
  const preferred = { x: 14, y: viewport.height - 155 - height, width, height };
  if (viewport.height > viewport.width && width <= viewport.width - 160 && preferred.y >= margin && !obstacles.some(rect => rectanglesOverlap(preferred, rect, margin))) return preferred;
  const xs = [Math.max(margin, (viewport.width - width) / 2), margin, viewport.width - width - margin,
    ...obstacles.flatMap(rect => [rect.x + rect.width + margin, rect.x - width - margin])];
  const ys = [margin, ...obstacles.flatMap(rect => [rect.y + rect.height + margin, rect.y - height - margin])];
  const options: NoticeRect[] = [];
  for (const y of ys) for (const x of xs) {
    const candidate = { x, y, width, height };
    if (x < margin || y < margin || x + width > viewport.width - margin || y + height > viewport.height - margin) continue;
    if (!obstacles.some(rect => rectanglesOverlap(candidate, rect, margin))) options.push(candidate);
  }
  return options.sort((a, b) => a.y - b.y || Math.abs(a.x + width / 2 - viewport.width / 2) - Math.abs(b.x + width / 2 - viewport.width / 2))[0] ?? null;
}
