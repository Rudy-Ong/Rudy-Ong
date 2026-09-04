/**
 * Dev-only: screenshot the animated SVGs at real elapsed times.
 *
 * The SVG is embedded with <img>, which is exactly how GitHub renders a README
 * image — a stricter context than inlining, since scripts are inert and only
 * declarative animation runs. If it looks right here, it looks right there.
 *
 * Chrome's --virtual-time-budget does not advance CSS animations, so this waits
 * real wall-clock time instead.
 *
 *   node scripts/capture.mjs shiritori-snake.svg 2000 9000 16000
 */

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, '.preview');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome/Edge binary found; pass one via CHROME_PATH');
  return process.env.CHROME_PATH || found;
}

async function main() {
  const [file, ...timeArgs] = process.argv.slice(2);
  if (!file) throw new Error('usage: node scripts/capture.mjs <file.svg> [ms...]');
  const times = (timeArgs.length ? timeArgs : ['3000', '10000', '20000']).map(Number).sort((a, b) => a - b);

  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files'],
  });

  try {
    const page = await browser.newPage();
    // Emulate a viewer who has not asked for reduced motion, so the animated
    // path is what we are looking at.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.setViewport({ width: 840, height: 260, deviceScaleFactor: 2 });
    // Navigate to a real file:// page: a document created with setContent has
    // an origin that is not allowed to load file:// images.
    const harness = join(DIST, '.capture.html');
    await writeFile(
      harness,
      `<!doctype html><meta charset="utf-8">
       <style>html,body{margin:0;background:${file.includes('dark') ? '#0d1117' : '#ffffff'}}img{display:block}</style>
       <img id="t" src="./${file}">`,
      'utf8',
    );
    await page.goto(pathToFileURL(harness).href, { waitUntil: 'load' });
    await page.waitForSelector('#t');

    const start = Date.now();
    for (const ms of times) {
      const remaining = ms - (Date.now() - start);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      const out = join(OUT, `${basename(file, '.svg')}@${ms}ms.png`);
      await (await page.$('#t')).screenshot({ path: out });
      console.log(`[capture] t=${(ms / 1000).toFixed(1)}s -> .preview/${basename(out)}`);
    }
  } finally {
    await browser.close();
    await rm(join(DIST, '.capture.html'), { force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
