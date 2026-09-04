/**
 * Generates dist/shiritori-snake.svg (+ dark variant).
 *
 * A snake crawls the contribution graph on a serpentine path, eating squares.
 * Eaten squares release kana, which spell out a shiritori chain in the caption
 * below — shiritori is a word-chain game, and a snake is a chain.
 *
 * Two decisions worth knowing:
 *
 *  1. No pathfinding. The snake follows a fixed boustrophedon sweep (row 0
 *     left-to-right, row 1 right-to-left, ...). It is always a valid path,
 *     needs no solver, and reads as deliberate rather than random.
 *
 *  2. Kana are released on a slow fixed cadence, not one-per-square. A year has
 *     ~150-250 active days; spelling a kana on every one would flick words past
 *     far faster than anyone can read them. Squares are still all eaten — only
 *     some of them release a kana.
 *
 * Everything animates with CSS @keyframes and no JavaScript, because GitHub
 * strips scripts from README images. Motion is on by default and switched off
 * under prefers-reduced-motion — never the reverse; see motionReduce() in
 * lib/svg.mjs for why that direction matters when the SVG is loaded via <img>.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProfile, toLevelGrid } from './lib/github.mjs';
import { buildChain, validateChain, chainToKana } from './lib/shiritori.mjs';
import { THEMES } from './lib/palette.mjs';
import { svg, el, rect, text, num, motionReduce } from './lib/svg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const LOGIN = process.env.PROFILE_LOGIN || 'Rudy-Ong';

// --- Layout -----------------------------------------------------------------
const CELL = 11;
const GAP = 3;
const PITCH = CELL + GAP;
const GUTTER_LEFT = 30; // weekday labels
const GUTTER_TOP = 34; // month labels, plus a clear band for kana to rise into
const PAD_RIGHT = 16;
const ROWS = 7;

// --- Timing -----------------------------------------------------------------
const TOTAL = 32; // seconds for one full loop
const KANA_INTERVAL = 1.15; // seconds between kana releases
const SEGMENTS = 7; // snake head + body
const ENTRY = 8; // off-grid cells before the grid, so the snake slides in
const EXIT = 10; // off-grid cells after, so the tail clears the frame

const WEEKDAY_LABELS = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Percentage of the loop at time t, for keyframe stops. */
const pct = (t) => `${((t / TOTAL) * 100).toFixed(4)}%`;

/**
 * Boustrophedon sweep across the grid, with off-grid lead-in and lead-out.
 * Returns cells as {col, row, onGrid}.
 */
function buildPath(weeks) {
  const path = [];
  for (let i = ENTRY; i > 0; i--) path.push({ col: -i, row: 0, onGrid: false });

  for (let row = 0; row < ROWS; row++) {
    const forward = row % 2 === 0;
    for (let n = 0; n < weeks; n++) {
      const col = forward ? n : weeks - 1 - n;
      path.push({ col, row, onGrid: true });
    }
  }

  const lastRowForward = (ROWS - 1) % 2 === 0;
  for (let i = 0; i < EXIT; i++) {
    path.push({ col: lastRowForward ? weeks + i : -1 - i, row: ROWS - 1, onGrid: false });
  }
  return path;
}

/**
 * Decide which eaten squares release a kana.
 * Walks food squares in path order and takes one whenever the cadence is due.
 */
function planReleases(foodStops, step) {
  const releases = [];
  let due = 1.2; // let the snake get onto the grid before the first kana
  for (const stop of foodStops) {
    const t = stop.index * step;
    if (t >= due) {
      releases.push({ ...stop, t });
      due = t + KANA_INTERVAL;
    }
  }
  return releases;
}

/** Group released kana back into the words they spell. */
function groupIntoWords(releases, kanaStream) {
  const words = [];
  let current = null;

  releases.forEach((release, i) => {
    const k = kanaStream[i % kanaStream.length];
    if (!current || current.word !== k.word) {
      current = { word: k.word, romaji: k.romaji, gloss: k.gloss, kana: [], start: release.t };
      words.push(current);
    }
    current.kana.push({ char: k.kana, t: release.t, cell: release });
    current.end = release.t;
  });

  // A word only earns its romaji/gloss line once fully spelled; the last group
  // is usually cut off by the end of the loop, so drop it from the caption.
  return words.filter((w) => w.kana.length === [...w.word].length);
}

function buildSnakeSvg(user, theme, isFixture, chainData) {
  const t = THEMES[theme];
  const grid = toLevelGrid(user.contributionsCollection.contributionCalendar);
  const weeks = grid.length;

  const gridW = weeks * PITCH - GAP;
  const gridH = ROWS * PITCH - GAP;
  const WIDTH = GUTTER_LEFT + gridW + PAD_RIGHT;

  const captionY = GUTTER_TOP + gridH + 26;
  const HEIGHT = captionY + 42;

  const path = buildPath(weeks);
  const step = TOTAL / path.length;

  const xOf = (col) => GUTTER_LEFT + col * PITCH;
  const yOf = (row) => GUTTER_TOP + row * PITCH;

  // --- Food squares and kana releases ---------------------------------------
  const foodStops = [];
  path.forEach((cell, index) => {
    if (!cell.onGrid) return;
    const day = grid[cell.col]?.[cell.row];
    if (day && day.level > 0) foodStops.push({ index, ...cell, level: day.level, date: day.date });
  });

  const releases = planReleases(foodStops, step);
  const words = groupIntoWords(releases, chainData.kanaStream);

  // --- Static grid ----------------------------------------------------------
  const emptyCells = [];
  const foodCells = [];
  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < ROWS; row++) {
      const day = grid[col]?.[row];
      if (!day) continue;
      emptyCells.push(
        rect({ x: xOf(col), y: yOf(row), width: CELL, height: CELL, rx: 2, fill: t.contrib[0] }),
      );
    }
  }

  const eatDelayByCell = new Map();
  for (const stop of foodStops) eatDelayByCell.set(`${stop.col},${stop.row}`, stop.index * step);

  for (const stop of foodStops) {
    const delay = eatDelayByCell.get(`${stop.col},${stop.row}`);
    foodCells.push(
      rect({
        x: xOf(stop.col),
        y: yOf(stop.row),
        width: CELL,
        height: CELL,
        rx: 2,
        fill: t.contrib[stop.level],
        className: 'food',
        // Negative delay so the cycle *ends* (the square is eaten) exactly when
        // the head arrives, then regrows gently behind the snake.
        style: `animation-delay:${num(delay - TOTAL, 3)}s`,
      }),
    );
  }

  // --- Axis labels ----------------------------------------------------------
  const weekdayLabels = Object.entries(WEEKDAY_LABELS)
    .map(([row, label]) =>
      text(label, {
        x: GUTTER_LEFT - 6,
        y: yOf(Number(row)) + CELL - 1,
        size: 9,
        anchor: 'end',
        className: 'axis',
      }),
    )
    .join('');

  let lastMonth = null;
  const monthLabels = grid
    .map((week, col) => {
      const first = week.find(Boolean);
      if (!first) return '';
      const month = new Date(`${first.date}T00:00:00Z`).getUTCMonth();
      if (month === lastMonth) return '';
      lastMonth = month;
      // Skip a label that would collide with the right edge.
      if (col > weeks - 3) return '';
      return text(MONTHS[month], { x: xOf(col), y: 12, size: 9, className: 'axis' });
    })
    .join('');

  // --- Snake ----------------------------------------------------------------
  const crawlStops = path
    .map((cell, i) => `${pct(i * step)}{transform:translate(${num(xOf(cell.col))}px,${num(yOf(cell.row))}px)}`)
    .join('');

  const segments = Array.from({ length: SEGMENTS }, (_, i) => {
    const isHead = i === 0;
    const inset = isHead ? 0 : 1 + i * 0.25;
    const size = CELL - inset * 2;
    // Body fades toward the tail so the direction of travel is legible.
    const opacity = isHead ? 1 : Math.max(0.28, 1 - i * 0.13);
    return el('g', {
      class: 'seg',
      // Each segment runs the same path, held i steps behind the head.
      style: `animation-delay:${num(i * step, 3)}s`,
    }, rect({
      x: inset,
      y: inset,
      width: size,
      height: size,
      rx: isHead ? 3 : 2.5,
      fill: isHead ? t.snakeHead : t.snake,
      opacity: num(opacity, 2),
    }));
  }).reverse().join(''); // tail first so the head paints on top

  // --- Kana bursts from eaten squares ---------------------------------------
  const kanaPops = releases
    .map((release, i) => {
      const k = chainData.kanaStream[i % chainData.kanaStream.length];
      const glyph = chainData.glyphs[k.kana];
      if (!glyph) return '';
      const scale = 16 / chainData.em;
      const w = (glyph.bbox.x2 - glyph.bbox.x1) * scale;
      const dx = xOf(release.col) + CELL / 2 - w / 2 - glyph.bbox.x1 * scale;
      const dy = yOf(release.row) + CELL / 2 + 6;
      // Positioning lives on an outer group and the animation on an inner one.
      // A CSS `transform` replaces the element's transform attribute outright,
      // so animating translateY on the positioned group would snap the glyph
      // back to the origin.
      return el('g', { transform: `translate(${num(dx)},${num(dy)})` },
        el('g', { class: 'pop', style: `animation-delay:${num(release.t, 3)}s` },
          el('g', { transform: `scale(${scale.toFixed(5)})` },
            el('use', { 'xlink:href': `#k${chainData.index[k.kana]}`, fill: t.snakeHead }))));
    })
    .join('');

  // --- Caption --------------------------------------------------------------
  const kanaSize = 22;
  const kanaScale = kanaSize / chainData.em;

  const wordGroups = words
    .map((word, wi) => {
      const chars = word.kana;
      const advance = kanaSize * 1.04;
      const totalW = chars.length * advance;
      const startX = GUTTER_LEFT;

      const glyphs = chars
        .map((c, ci) => {
          const glyph = chainData.glyphs[c.char];
          if (!glyph) return '';
          const gw = (glyph.bbox.x2 - glyph.bbox.x1) * kanaScale;
          const dx = startX + ci * advance + (advance - gw) / 2 - glyph.bbox.x1 * kanaScale;
          return el('g', {
            class: 'ck',
            style: `animation-delay:${num(c.t, 3)}s`,
            transform: `translate(${num(dx)},${num(captionY + kanaSize)})`,
          }, el('g', { transform: `scale(${kanaScale.toFixed(5)})` },
            el('use', { 'xlink:href': `#k${chainData.index[c.char]}`, fill: t.text })));
        })
        .join('');

      // The reading and meaning land only once the word is fully spelled, so
      // the viewer watches the kana appear and then gets the answer.
      const label = el('g', { class: 'gl', style: `animation-delay:${num(word.end, 3)}s` },
        text(`${word.romaji} · ${word.gloss}`, {
          x: startX + totalW + 12,
          y: captionY + kanaSize - 3,
          size: 12,
          className: 'gloss',
        }));

      return el('g', { class: `word w${wi}` }, glyphs + label);
    })
    .join('');

  // Per-word visibility windows. There are only a handful of words per loop, so
  // a keyframes rule each is cheap and far simpler than shifting one shared rule.
  const FADE = 0.28;
  const wordKeyframes = words
    .map((word, wi) => {
      const next = words[wi + 1];
      // Slots are exclusive. This word is fully faded out by the instant the
      // next one begins fading in, so two captions never stack on the same
      // line — a cross-fade here renders as unreadable overlapping text.
      const slotStart = Math.max(0, word.start - 0.3);
      const slotEnd = Math.min(next ? next.start - 0.3 : word.end + 1.8, TOTAL);
      const holdEnd = Math.max(slotStart + FADE, slotEnd - FADE);
      return `@keyframes w${wi}{0%,${pct(slotStart)}{opacity:0}${pct(slotStart + FADE)},${pct(
        holdEnd,
      )}{opacity:1}${pct(slotEnd)},100%{opacity:0}}`;
    })
    .join('');

  const wordAnimations = words
    .map((_, wi) => `.w${wi}{animation:w${wi} ${TOTAL}s linear infinite}`)
    .join('');

  // --- Legend ---------------------------------------------------------------
  const legendX = WIDTH - PAD_RIGHT - 5 * (CELL - 1) - 4 * 3 - 62;
  const legend = [
    text('Less', { x: legendX, y: captionY + kanaSize - 3, size: 9, className: 'axis' }),
    ...t.contrib.map((color, i) =>
      rect({
        x: legendX + 28 + i * (CELL - 1 + 3),
        y: captionY + kanaSize - 12,
        width: CELL - 1,
        height: CELL - 1,
        rx: 2,
        fill: color,
      }),
    ),
    text('More', {
      x: legendX + 28 + 5 * (CELL - 1 + 3) + 4,
      y: captionY + kanaSize - 3,
      size: 9,
      className: 'axis',
    }),
  ].join('');

  // --- Glyph symbols --------------------------------------------------------
  const usedChars = new Set();
  for (const r of releases.keys()) usedChars.add(chainData.kanaStream[r % chainData.kanaStream.length].kana);
  const defs = [...usedChars]
    .map((ch) => el('symbol', { id: `k${chainData.index[ch]}`, overflow: 'visible' },
      el('path', { d: chainData.glyphs[ch].d })))
    .join('');

  // --- Styles ---------------------------------------------------------------
  const style = `
    .axis{fill:${t.textMuted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}
    .gloss{fill:${t.textMuted}}
    .food{opacity:1;animation:eat ${TOTAL}s linear infinite}
    .pop{opacity:0;animation:pop ${TOTAL}s linear infinite}
    .ck{opacity:0;animation:ink ${TOTAL}s linear infinite}
    .gl{opacity:0;animation:ink ${TOTAL}s linear infinite}
    .word{opacity:0}
    .seg{animation:crawl ${TOTAL}s linear infinite;animation-fill-mode:backwards}
    ${wordAnimations}
    @keyframes crawl{${crawlStops}}
    @keyframes eat{0%{opacity:0}${pct(TOTAL * 0.022)}{opacity:1}${pct(TOTAL - 0.35)}{opacity:1}100%{opacity:0}}
    @keyframes pop{0%{opacity:0;transform:translateY(0)}2%{opacity:1}7%{opacity:0;transform:translateY(-9px)}100%{opacity:0;transform:translateY(-9px)}}
    @keyframes ink{0%{opacity:0}1%{opacity:1}100%{opacity:1}}
    ${wordKeyframes}
    ${motionReduce(`
      .snake{display:none}
      .food,.pop,.ck,.gl,.word,.seg{animation:none}
      .food{opacity:1}
      .word{opacity:0}
      .w0,.w0 .ck,.w0 .gl{opacity:1}
    `)}
  `;

  const watermark = isFixture
    ? text('sample data', { x: WIDTH - PAD_RIGHT, y: 12, size: 9, anchor: 'end', className: 'axis' })
    : '';

  const body = [
    monthLabels,
    weekdayLabels,
    el('g', {}, emptyCells.join('')),
    el('g', {}, foodCells.join('')),
    el('g', { class: 'snake' }, segments),
    el('g', { class: 'snake' }, kanaPops),
    wordGroups,
    legend,
    watermark,
  ].join('\n');

  const chainPreview = words.map((w) => w.word).join(' → ');

  return svg({
    width: WIDTH,
    height: HEIGHT,
    title: 'Contribution graph as a shiritori snake',
    desc:
      `A snake crawls ${LOGIN}'s GitHub contribution graph, eating contribution squares. ` +
      `The squares spell a shiritori word chain: ${chainPreview}. ` +
      `${user.contributionsCollection.contributionCalendar.totalContributions} contributions in the last year.`,
    style,
    defs,
    body,
  });
}

async function main() {
  const { user, isFixture } = await loadProfile(LOGIN);

  const pool = JSON.parse(await readFile(join(ROOT, 'data', 'shiritori-words.json'), 'utf8'));
  const kanaPaths = JSON.parse(await readFile(join(ROOT, 'data', 'kana-paths.json'), 'utf8'));

  const chain = buildChain(pool.words, { start: pool.start });
  validateChain(chain); // build-time assertion: never ship a broken chain
  const kanaStream = chainToKana(chain);

  // Stable short ids keep the symbol references compact.
  const index = {};
  Object.keys(kanaPaths.glyphs).forEach((ch, i) => {
    index[ch] = i;
  });

  const chainData = { kanaStream, glyphs: kanaPaths.glyphs, em: kanaPaths.em, index };

  await mkdir(DIST, { recursive: true });
  for (const [file, theme] of [['shiritori-snake.svg', 'light'], ['shiritori-snake-dark.svg', 'dark']]) {
    const content = buildSnakeSvg(user, theme, isFixture, chainData);
    await writeFile(join(DIST, file), content, 'utf8');
    console.log(`[snake] wrote dist/${file} (${(content.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`[snake] chain: ${chain.length} words available, ${kanaStream.length} kana`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
