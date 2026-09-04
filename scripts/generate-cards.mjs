/**
 * Generates dist/stats.svg and dist/langs.svg (plus -dark variants).
 *
 * These are built here rather than pulled from github-readme-stats: the public
 * Vercel instance is rate-limited, and self-hosting adds a service to keep
 * alive. Generating locally also means the cards share the exact palette and
 * type treatment as the shiritori snake.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProfile } from './lib/github.mjs';
import { THEMES, languageColor } from './lib/palette.mjs';
import { svg, el, rect, text, num, motionReduce } from './lib/svg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const LOGIN = process.env.PROFILE_LOGIN || 'Rudy-Ong';

const WIDTH = 440;
const HEIGHT = 200;
const PAD = 20;

/** Compact display for large counts: 1234 -> 1.2k */
function compact(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(n / 1000)}k`;
}

function cardShell(theme, titleText, bodyContent, extraStyle = '') {
  const t = THEMES[theme];
  const style = `
    .card-bg { fill: ${t.surface}; stroke: ${t.border}; }
    .title { fill: ${t.text}; }
    .muted { fill: ${t.textMuted}; }
    .value { fill: ${t.text}; }
    .accent { fill: ${t.accent}; }
    .item { opacity: 0; animation: rise 0.5s ease-out forwards; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    ${motionReduce('.item { opacity: 1; animation: none; }')}
    ${extraStyle}
  `;

  const body = [
    rect({ x: 0.5, y: 0.5, width: WIDTH - 1, height: HEIGHT - 1, rx: 10, fill: null, className: 'card-bg', 'stroke-width': 1 }),
    text(titleText, { x: PAD, y: PAD + 14, size: 15, weight: 600, className: 'title' }),
    bodyContent,
  ].join('\n');

  return { style, body };
}

function buildStatsCard(user, theme, isFixture) {
  const c = user.contributionsCollection;
  const stars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);

  // Private contributions are counted separately by the API. Including them is
  // the whole point of enabling "include private contributions" on the profile.
  const commits = c.totalCommitContributions + c.restrictedContributionsCount;

  const stats = [
    ['Commits', compact(commits)],
    ['Pull requests', compact(c.totalPullRequestContributions)],
    ['Issues', compact(c.totalIssueContributions)],
    ['Stars earned', compact(stars)],
    ['Followers', compact(user.followers.totalCount)],
    ['Repositories', compact(user.repositories.totalCount)],
  ];

  const cols = 3;
  const cellW = (WIDTH - PAD * 2) / cols;
  // Baselines, not tops: a 24px value needs ~17px of headroom above its
  // baseline, so these must clear the subtitle at y=82 and each other.
  const rowY = [120, 170];

  const cells = stats
    .map(([label, value], i) => {
      const x = PAD + (i % cols) * cellW;
      const y = rowY[Math.floor(i / cols)];
      const delay = `${0.15 + i * 0.06}s`;
      return el(
        'g',
        { class: 'item', style: `animation-delay:${delay}` },
        [
          text(value, { x, y, size: 24, weight: 700, className: 'value' }),
          text(label, { x, y: y + 17, size: 11, className: 'muted' }),
        ].join(''),
      );
    })
    .join('\n');

  const headline = [
    text(`${compact(c.contributionCalendar.totalContributions)} contributions`, {
      x: PAD,
      y: 64,
      size: 24,
      weight: 700,
      className: 'accent',
    }),
    text('in the last year', { x: PAD, y: 82, size: 11, className: 'muted' }),
  ].join('');

  const watermark = isFixture
    ? text('sample data', { x: WIDTH - PAD, y: PAD + 14, size: 10, anchor: 'end', className: 'muted' })
    : '';

  const { style, body } = cardShell(
    theme,
    user.name || user.login,
    [el('g', { class: 'item', style: 'animation-delay:0.05s' }, headline), cells, watermark].join('\n'),
  );

  return svg({
    width: WIDTH,
    height: HEIGHT,
    title: `GitHub statistics for ${user.login}`,
    desc: `${c.contributionCalendar.totalContributions} contributions in the last year. ${stats
      .map(([l, v]) => `${l}: ${v}`)
      .join('. ')}.`,
    style,
    body,
  });
}

function aggregateLanguages(repos) {
  const totals = new Map();
  for (const repo of repos) {
    for (const edge of repo.languages?.edges ?? []) {
      totals.set(edge.node.name, (totals.get(edge.node.name) ?? 0) + edge.size);
    }
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const grand = sorted.reduce((sum, [, size]) => sum + size, 0) || 1;

  const top = sorted.slice(0, 6);
  const restSize = sorted.slice(6).reduce((sum, [, size]) => sum + size, 0);
  if (restSize > 0) top.push(['Other', restSize]);

  return top.map(([name, size]) => ({ name, size, pct: (size / grand) * 100 }));
}

function buildLangsCard(user, theme, isFixture) {
  const t = THEMES[theme];
  // Forks are included deliberately: usr2_avsr_lip_reading is a fork and is the
  // research work. Excluding forks would make the card claim almost no Python.
  const langs = aggregateLanguages(user.repositories.nodes);

  const barX = PAD;
  const barY = 62;
  const barW = WIDTH - PAD * 2;
  const barH = 14;

  let offset = 0;
  const segments = langs
    .map((lang, i) => {
      const w = (lang.pct / 100) * barW;
      const seg = rect({
        x: barX + offset,
        y: barY,
        width: Math.max(w, 0.5),
        height: barH,
        rx: 0,
        fill: lang.name === 'Other' ? t.textMuted : languageColor(lang.name),
        className: 'seg',
        style: `animation-delay:${0.1 + i * 0.07}s`,
      });
      offset += w;
      return seg;
    })
    .join('\n');

  const cols = 2;
  const colW = (WIDTH - PAD * 2) / cols;
  const legend = langs
    .map((lang, i) => {
      const x = PAD + (i % cols) * colW;
      const y = 110 + Math.floor(i / cols) * 28;
      const color = lang.name === 'Other' ? t.textMuted : languageColor(lang.name);
      return el(
        'g',
        { class: 'item', style: `animation-delay:${0.25 + i * 0.05}s` },
        [
          el('circle', { cx: num(x + 5), cy: num(y - 4), r: 5, fill: color }),
          text(lang.name, { x: x + 18, y, size: 12, weight: 500, className: 'value' }),
          text(`${lang.pct.toFixed(1)}%`, { x: x + colW - 26, y, size: 11, anchor: 'end', className: 'muted' }),
        ].join(''),
      );
    })
    .join('\n');

  const extraStyle = `
    .bar-track { fill: ${t.grid}; }
    .seg { transform-origin: left center; transform: scaleX(0); animation: grow 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
    @keyframes grow { to { transform: scaleX(1); } }
    ${motionReduce('.seg { transform: none; animation: none; }')}
  `;

  const watermark = isFixture
    ? text('sample data', { x: WIDTH - PAD, y: PAD + 14, size: 10, anchor: 'end', className: 'muted' })
    : '';

  const { style, body } = cardShell(
    theme,
    'Languages',
    [
      rect({ x: barX, y: barY, width: barW, height: barH, rx: 6, className: 'bar-track', fill: null }),
      el('g', { clip: null, 'clip-path': 'url(#barclip)' }, segments),
      legend,
      watermark,
    ].join('\n'),
    extraStyle,
  );

  const defs = el(
    'clipPath',
    { id: 'barclip' },
    rect({ x: barX, y: barY, width: barW, height: barH, rx: 6, fill: '#fff' }),
  );

  return svg({
    width: WIDTH,
    height: HEIGHT,
    title: `Most used languages for ${user.login}`,
    desc: langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', '),
    style,
    defs,
    body,
  });
}

async function main() {
  const { user, isFixture } = await loadProfile(LOGIN);
  await mkdir(DIST, { recursive: true });

  const outputs = [
    ['stats.svg', buildStatsCard(user, 'light', isFixture)],
    ['stats-dark.svg', buildStatsCard(user, 'dark', isFixture)],
    ['langs.svg', buildLangsCard(user, 'light', isFixture)],
    ['langs-dark.svg', buildLangsCard(user, 'dark', isFixture)],
  ];

  for (const [name, content] of outputs) {
    await writeFile(join(DIST, name), content, 'utf8');
    console.log(`[cards] wrote dist/${name} (${(content.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
