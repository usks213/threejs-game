import type { Enemy, Input, Player } from './simulation';

type Palette = Readonly<Record<string, string>>;
/** Every primitive lands on the half-cell art grid, including breathing/sway. */
function pixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, Math.max(0.5, Math.round(width * 2) / 2), Math.max(0.5, Math.round(height * 2) / 2));
}
const INK = '#172430';
const KEEPER: Palette = {
  o: INK, d: '#23525b', t: '#377e7c', l: '#67b3a1', h: '#abd2ac',
  c: '#915637', b: '#c1854d', g: '#efb86e', s: '#ffe0a4',
  f: '#d69e6b', p: '#ffe0ad', e: '#26313a', a: '#5d493c',
};
// These hand-authored clusters use two art pixels per simulation cell. The
// copper rain hood, sea-green split coat and little brass lantern are original.
const HOOD = [
  '....oo......', '...ocbo.....', '..ocbgbo....', '.ocbggbco...',
  'ocbgbbbco...', 'ocbbcbbgbo..', 'ocbcoppppgo.', '.occofpepo..',
  '..ocoofpo...', '...ocffo....', '....ooo.....',
] as const;
const COAT = [
  '....ooo......', '...odtlto....', '..odtlltdo...', '.odttltdddo..',
  '.odttttdddo..', 'odtltltdddoo.', 'odtltltddddo.', '.otttttdddo..',
  '.oaaagaaado..', '.odttltdtddo.', 'odtltlddtddo.',
  '.odddoodddo..', '..ooo..ooo...',
] as const;
const CRAWLER: Palette = { o: '#24222e', d: '#604756', b: '#946459', c: '#c38b66', l: '#e1b481', s: '#f3d7a2', e: '#ffd381' };
const CRAWLER_BODY = [
  '....oooo......', '..oobbbboo....', '.obccclbcbo...', 'obcccllccdbo..',
  'obcllcccbddbo.', 'obccbcbbcdddo.', '.obbbdbddddo..', '..oddoodddo...',
] as const;
const MOTH: Palette = { o: '#2d283b', d: '#57425e', b: '#886c8a', l: '#b99bbb', p: '#dbc4cd', g: '#ffd991', e: '#fff3bd', s: '#fff3bd' };
const WING_OPEN = ['..oo......', '.obbo.....', 'oblpbo....', 'obllpbo...', 'obldllbo..', '.obddllbo.', '..obldbbo.', '...obboo..', '....oo....'] as const;
const WING_DOWN = ['......oo.', '....oobbo', '..ooblpbo', '.oblllbo.', 'oblddbo..', 'obdbo....', '.oo......'] as const;
const WARDEN: Palette = { o: '#292332', d: '#623347', b: '#995052', c: '#c57861', l: '#edb17b', g: '#ffd897', s: '#fff2b4', t: '#705c74' };
const WARDEN_MASK = [
  '...oo..........oo...', '..obco........ocbo..', '..obcbo......obcbo..',
  '...obcooooooocbo....', '....obccllccbbo.....', '...obcclgglccbbo....',
  '..obcclgssglcbbbo...', '..obccclgglccbbbo...', '..obdoobccoobbbo....',
  '...ogsgobbogsgo.....', '...obboobbobbbo.....', '....obbbccbbbo......',
  '.....obcllcbo.......', '......oblbo.........', '.......ooo..........',
] as const;

/** Pixel runs, never filtered paths, keep silhouettes crisp at all zooms. */
function stamp(ctx: CanvasRenderingContext2D, rows: readonly string[], palette: Palette, x: number, y: number, facing = 1, flash = false) {
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let col = 0; col < line.length;) {
      const key = line[col]; let end = col + 1;
      while (end < line.length && line[end] === key) end++;
      if (key !== '.') {
        ctx.fillStyle = flash && key !== 'o' ? '#fff2cf' : palette[key];
        pixelRect(ctx, x + (facing > 0 ? col : -end) * 0.5, y + row * 0.5, (end - col) * 0.5, 0.5);
      }
      col = end;
    }
  }
}

/** Half-cell Bresenham line: no antialiased strokes or diagonal blur. */
export function pixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, size = 0.5) {
  let x = Math.round(x0 * 2), y = Math.round(y0 * 2);
  const tx = Math.round(x1 * 2), ty = Math.round(y1 * 2), dx = Math.abs(tx - x), dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1; let error = dx + dy;
  ctx.fillStyle = color;
  // All callers use local sprite/effect spans. Bound even malformed input.
  for (let i = 0; i < 160; i++) {
    pixelRect(ctx, x * 0.5, y * 0.5, size, size);
    if (x === tx && y === ty) break;
    const doubled = error * 2;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
}

export interface KeeperPose { facing: number; breath: number; stride: number; airborne: boolean; hem: number; recoil: number; handX: number; handY: number; angle: number }
/** Animation reads time/velocity/input only; it never advances the game. */
export function keeperPose(p: Readonly<Player>, input: Readonly<Input>, time: number, castUntil = -Infinity): KeeperPose {
  const facing = input.aimX < 0 ? -1 : 1, airborne = !p.grounded;
  const moving = p.grounded && Math.abs(p.vx) > 2;
  const stride = moving ? Math.sin(time * (7 + Math.min(7, Math.abs(p.vx) * 0.16))) : 0;
  const breath = moving ? (Math.abs(stride) > 0.65 ? -0.5 : 0) : Math.sin(time * 2.8) > 0.55 ? -0.5 : 0;
  const recoil = Math.max(0, Math.min(1, (castUntil - time) / 0.12));
  const angle = Math.atan2(input.aimY, input.aimX);
  return { facing, breath, stride, airborne, hem: airborne ? Math.sign(p.vy) : Math.round(stride), recoil, angle,
    handX: Math.round((p.x + Math.cos(angle) * (6 - recoil)) * 2) / 2,
    handY: Math.round((p.y - 1 + breath + Math.sin(angle) * (6 - recoil)) * 2) / 2 };
}

export function drawPixelKeeper(ctx: CanvasRenderingContext2D, p: Readonly<Player>, input: Readonly<Input>, time: number, tool: string, castUntil: number) {
  const pose = keeperPose(p, input, time, castUntil), { facing, breath, stride, airborne, recoil, handX, handY, angle } = pose;
  const x = Math.round(p.x * 2) / 2, y = Math.round(p.y * 2) / 2;
  if (p.invulnerable > 0 && Math.floor(time * 20) % 2 !== 0) return;
  const step = Math.round(stride * 2) * 0.5;
  // Two independently posed boots beneath the split coat. Their planted edge
  // stays at +4.5, the actual bottom of the five-by-nine collision body.
  ctx.fillStyle = INK;
  pixelRect(ctx, x - 2 + step, y + 2.5, 1.5, airborne ? 1.5 : 2);
  pixelRect(ctx, x + 0.5 - step, y + 2.5, 1.5, airborne ? 1 : 2);
  pixelRect(ctx, x - 2 + step + facing * 0.5, y + (airborne ? 3.5 : 4), 1.5, 0.5);
  pixelRect(ctx, x + 0.5 - step + facing * 0.5, y + (airborne ? 3 : 4), 1.5, 0.5);
  ctx.fillStyle = '#aa7650'; pixelRect(ctx, x - 1.5 + step, y + 3, 0.5, 0.5); pixelRect(ctx, x + 1 - step, y + 3, 0.5, 0.5);
  // The back hem streams opposite travel while falling/rising, rather than
  // stretching the solid body or pretending to be extra collision geometry.
  const tail = airborne ? -Math.sign(p.vx || facing) : -facing;
  pixelLine(ctx, x + tail * 2, y + 1, x + tail * (airborne ? 4.5 : 3), y + 2 + pose.hem * 0.5, '#23525b', 1);
  pixelLine(ctx, x + tail * 2, y + 0.5, x + tail * (airborne ? 4 : 2.5), y + 1 + pose.hem * 0.5, '#67a08f');
  stamp(ctx, COAT, KEEPER, x - facing * 3.5, y - 2.5 + breath, facing);
  // A leather satchel and separate shoulder break up the old rectangular body.
  ctx.fillStyle = '#352e31'; pixelRect(ctx, x - facing * 2.5 - 0.5, y - 0.5 + breath, 1.5, 2.5);
  ctx.fillStyle = '#997447'; pixelRect(ctx, x - facing * 2.5, y + breath, 0.5, 1.5);
  stamp(ctx, HOOD, KEEPER, x - facing * 3, y - 7 + breath - recoil * 0.5, facing);
  // Brass belt lantern with a dark casing, distinct from the pale wand tip.
  ctx.fillStyle = '#695137'; pixelRect(ctx, x + facing * 1.5 - 0.5, y + 0.5, 1.5, 2);
  ctx.fillStyle = '#f5c577'; pixelRect(ctx, x + facing * 1.5, y + 1, 0.5, 1);
  ctx.fillStyle = '#fff2b6'; pixelRect(ctx, x + facing * 1.5, y + 1, 0.5, 0.5);
  let tipX = handX + Math.cos(angle) * 2, tipY = handY + Math.sin(angle) * 2;
  const swing = tool === 'pick' && input.fire ? Math.sin(time * 18) * 0.65 : 0;
  const toolAngle = angle + swing;
  if (swing) { tipX = x + Math.cos(toolAngle) * 8; tipY = y - 1 + Math.sin(toolAngle) * 8; }
  pixelLine(ctx, x + facing * 1.5, y - 1 + breath, handX, handY, INK, 1);
  pixelLine(ctx, x + facing * 1.5, y - 1 + breath, handX - Math.cos(angle), handY - Math.sin(angle), '#538f85', 0.5);
  ctx.fillStyle = '#efc18b'; pixelRect(ctx, handX - 0.5, handY - 0.5, 1, 1);
  pixelLine(ctx, handX - Math.cos(toolAngle), handY - Math.sin(toolAngle), tipX, tipY, '#362d30', 1);
  pixelLine(ctx, handX, handY, tipX, tipY, '#d7a45f');
  if (tool === 'pick') {
    pixelLine(ctx, tipX - Math.sin(toolAngle) * 2.5, tipY + Math.cos(toolAngle) * 2.5, tipX + Math.sin(toolAngle) * 2.5, tipY - Math.cos(toolAngle) * 2.5, '#526e78', 1);
    pixelLine(ctx, tipX - Math.sin(toolAngle) * 2.5, tipY + Math.cos(toolAngle) * 2.5, tipX + Math.sin(toolAngle) * 2.5, tipY - Math.cos(toolAngle) * 2.5, '#c3ddd2');
  } else {
    ctx.fillStyle = '#77bfae'; pixelRect(ctx, Math.round(tipX * 2) / 2, Math.round(tipY * 2) / 2, 1, 1);
    ctx.fillStyle = '#e3ffe0'; pixelRect(ctx, Math.round(tipX * 2) / 2, Math.round(tipY * 2) / 2, 0.5, 0.5);
    if (recoil > 0) {
      pixelLine(ctx, tipX, tipY, tipX + Math.cos(angle) * (1 + recoil * 3), tipY + Math.sin(angle) * (1 + recoil * 3), '#eaffcd');
      for (let i = -1; i <= 1; i += 2) pixelLine(ctx, tipX + Math.cos(angle) * 1.5, tipY + Math.sin(angle) * 1.5,
        tipX + Math.cos(angle + i * 0.6) * (2 + recoil * 2), tipY + Math.sin(angle + i * 0.6) * (2 + recoil * 2), '#92dfbc');
    }
  }
  if (input.fly && p.fuel > 0) for (let i = 0; i < 5; i++) {
    const age = (time * 8 + i * 0.73) % 3, xx = x - 1.5 + i * 0.75 + Math.sin(time * 4 + i) * age * 0.3;
    ctx.fillStyle = age < 1 ? '#f1ecc1' : age < 2 ? '#7faeaa' : '#486774'; pixelRect(ctx, Math.round(xx * 2) / 2, y + 5 + age * 1.5, 0.5, age < 1 ? 1 : 0.5);
  }
  if (p.wet > 0 && Math.floor(time * 8) % 3 === 0) { ctx.fillStyle = '#8abbd3'; pixelRect(ctx, x - 2, y + 3 + (time * 5 % 2), 0.5, 1); }
  if (p.burning > 0) for (let i = 0; i < 3; i++) { ctx.fillStyle = i === 1 ? '#ffe6a1' : '#e88849'; pixelRect(ctx, x - 2 + i * 1.5, y + 1 - (time * 9 + i * 2) % 5, 0.5, 1.5); }
}

export function drawPixelEnemy(ctx: CanvasRenderingContext2D, enemy: Readonly<Enemy>, time: number) {
  const x = Math.round(enemy.x * 2) / 2, y = Math.round(enemy.y * 2) / 2, facing = enemy.vx < 0 ? -1 : 1, flash = enemy.flash > 0;
  const cycle = time * 12 + enemy.id * 1.7;
  if (enemy.kind === 'crawler') {
    for (let i = 0; i < 3; i++) {
      const step = Math.sin(cycle + i * 2) > 0 ? 0.5 : -0.5;
      pixelLine(ctx, x - 2 + i * 2, y + 1, x - 3 + i * 2 + step, y + 3.5, '#463442');
      pixelLine(ctx, x - 2 + i * 2, y + 1, x - 1 + i * 2 - step, y + 3, '#bd936b');
    }
    stamp(ctx, CRAWLER_BODY, CRAWLER, x - facing * 3.5, y - 2, facing, flash);
    ctx.fillStyle = '#e4b87c'; pixelRect(ctx, x + facing * 2.5, y, 1, 0.5); ctx.fillStyle = '#ffe9a3'; pixelRect(ctx, x + facing * 2.5, y - 0.5, 0.5, 0.5);
    pixelLine(ctx, x + facing * 2, y - 1.5, x + facing * 3.5, y - 3, '#9b7968');
  } else if (enemy.kind === 'moth') {
    const open = Math.sin(cycle * 1.5) > -0.25, rows = open ? WING_OPEN : WING_DOWN;
    stamp(ctx, rows, MOTH, x - 5.5, y - (open ? 3 : 0), 1, flash);
    stamp(ctx, rows, MOTH, x + 6, y - (open ? 3 : 0), -1, flash);
    ctx.fillStyle = '#322b40'; pixelRect(ctx, x - 1, y - 2, 2, 5);
    ctx.fillStyle = flash ? '#fff2cf' : '#d5b6ac'; pixelRect(ctx, x - 0.5, y - 2.5, 1, 4);
    ctx.fillStyle = '#786276'; pixelRect(ctx, x - 0.5, y, 1, 0.5); pixelRect(ctx, x - 0.5, y + 1, 1, 0.5);
    pixelLine(ctx, x - 0.5, y - 2, x - 2, y - 3.5, '#e5cead'); pixelLine(ctx, x + 0.5, y - 2, x + 2, y - 3.5, '#e5cead');
    ctx.fillStyle = '#fff0b5'; pixelRect(ctx, x - 0.5, y - 2.5, 1, 0.5);
  } else if (enemy.kind === 'sentry') {
    // A jointed, tripod mineral idol. Its pale crown remains distinguishable
    // from the low warm carapace of the moving crawler.
    for (let i = -1; i <= 1; i++) { pixelLine(ctx, x + i, y + 1, x + i * 2.5, y + 3.5, '#655166', 1); ctx.fillStyle = '#b6a2b2'; pixelRect(ctx, x + i * 2.5, y + 3, 1, 0.5); }
    stamp(ctx, ['...oo....', '..olbo...', '.olplbo..', 'olpllbbo.', 'obloolbo.', 'oblgslbo.', '.obbboo..', '..ooo....'], MOTH, x - 2, y - 3.5, 1, flash);
    ctx.fillStyle = enemy.cooldown < 0.35 ? '#fff3cb' : '#dea47a'; pixelRect(ctx, x - 0.5, y - 1, 1, 1);
    if (enemy.cooldown < 0.35) { ctx.fillStyle = '#a17780'; pixelRect(ctx, x - 3, y - 1, 0.5, 0.5); pixelRect(ctx, x + 3, y - 1, 0.5, 0.5); }
  } else {
    const sway = Math.sin(time * 3 + enemy.id) * 0.5;
    // Tattered three-part mantle below a carved antler mask, no square boss.
    for (let i = -2; i <= 2; i++) {
      const xx = x + i * 1.5, hem = 4 + Math.abs(i) * 0.5 + Math.round(Math.sin(cycle * 0.3 + i));
      pixelLine(ctx, xx, y - 1, xx + sway * (i || 1), y + hem, i % 2 ? '#623347' : '#995052', 1.5);
      pixelLine(ctx, xx, y + 2, xx + sway, y + hem - 0.5, '#c57861');
    }
    pixelLine(ctx, x - 3, y - 2, x - 6, y + 1.5 + sway, '#603848', 1.5); pixelLine(ctx, x + 3, y - 2, x + 6, y + 1.5 - sway, '#603848', 1.5);
    ctx.fillStyle = '#e4a671'; pixelRect(ctx, x - 6, y + 1 + sway, 1, 1.5); pixelRect(ctx, x + 5.5, y + 1 - sway, 1, 1.5);
    stamp(ctx, WARDEN_MASK, WARDEN, x - 5, y - 8, 1, flash);
    if (enemy.cooldown < 0.4) { ctx.fillStyle = '#fff0b4'; pixelRect(ctx, x - 1, y - 4, 2, 0.5); }
  }
  if (enemy.hp < enemy.maxHp) { ctx.fillStyle = '#271f2d'; pixelRect(ctx, x - 4, y - (enemy.kind === 'warden' ? 10 : 6), 8, 0.5); ctx.fillStyle = '#de9c91'; pixelRect(ctx, x - 4, y - (enemy.kind === 'warden' ? 10 : 6), Math.ceil(16 * enemy.hp / enemy.maxHp) * 0.5, 0.5); }
}
