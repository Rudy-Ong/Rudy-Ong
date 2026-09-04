/**
 * Dev-only: rasterise dist/*.svg to PNG for eyeballing layout.
 *
 * resvg renders the static state (it ignores CSS animation), which is exactly
 * the check we want: it shows what a viewer sees at rest and catches any
 * element left invisible when animation does not run.
 *
 * Not part of the CI build.
 *   node scripts/preview.mjs [name.svg ...]
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, '.preview');

const args = process.argv.slice(2);

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = args.length ? args : (await readdir(DIST)).filter((f) => f.endsWith('.svg'));

  for (const file of files) {
    const source = await readFile(join(DIST, file), 'utf8');
    const resvg = new Resvg(source, {
      fitTo: { mode: 'zoom', value: 2 },
      background: file.includes('dark') ? '#0d1117' : '#ffffff',
    });
    const png = resvg.render().asPng();
    const out = join(OUT, `${basename(file, '.svg')}.png`);
    await writeFile(out, png);
    console.log(`[preview] ${file} -> .preview/${basename(out)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
