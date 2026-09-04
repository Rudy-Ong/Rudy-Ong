/**
 * Minimal SVG emitters.
 *
 * Everything here produces output that survives GitHub's README sanitiser:
 * no <script>, no external references, no webfonts. Animation is CSS
 * @keyframes only — SMIL is avoided because it is deprecated in some engines
 * and CSS gives us staggering via animation-delay for free.
 */

/** Escape text destined for XML content or an attribute value. */
export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Round to `places` decimals and drop trailing zeros.
 * Path data is the bulk of these files, so trimming coordinates is the single
 * biggest lever on output size.
 */
export function num(value, places = 2) {
  const rounded = Number(value.toFixed(places));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Build one element. Attributes with null/undefined values are omitted. */
export function el(tag, attrs = {}, children = '') {
  const parts = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    parts.push(`${key}="${esc(value)}"`);
  }
  const open = parts.length ? `${tag} ${parts.join(' ')}` : tag;
  return children === '' || children === null || children === undefined
    ? `<${open}/>`
    : `<${open}>${children}</${tag}>`;
}

export function rect({ x, y, width, height, rx = 2, fill, className, ...rest }) {
  return el('rect', {
    x: num(x),
    y: num(y),
    width: num(width),
    height: num(height),
    rx: num(rx),
    fill,
    class: className,
    ...rest,
  });
}

/**
 * A text node. Only used for Latin/numeric UI chrome, where we deliberately
 * rely on the viewer's system font stack — GitHub blocks webfonts, and
 * system-ui renders these fine. Japanese text never goes through here; it is
 * pre-converted to paths (see glyphs.mjs).
 */
export function text(content, { x, y, size = 12, fill, weight = 400, anchor = 'start', className, ...rest }) {
  return el(
    'text',
    {
      x: num(x),
      y: num(y),
      'font-size': size,
      'font-weight': weight,
      'text-anchor': anchor === 'start' ? null : anchor,
      fill,
      'font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      class: className,
      ...rest,
    },
    esc(content),
  );
}

/**
 * Wrap body content in a root <svg>.
 *
 * `role="img"` plus <title>/<desc> is what makes these cards legible to screen
 * readers — GitHub renders them as <img> and the alt text alone is thin.
 */
export function svg({ width, height, title, desc, style = '', defs = '', body }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`,
    el('title', { id: 'title' }, esc(title)),
    el('desc', { id: 'desc' }, esc(desc)),
    style ? `<style>${style}</style>` : '',
    defs ? `<defs>${defs}</defs>` : '',
    body,
    '</svg>',
    '',
  ].join('\n');
}

/**
 * Rules that switch motion OFF for viewers who ask for less of it.
 *
 * Animate by default and disable here — never the reverse. When an SVG is
 * loaded through <img>, as GitHub does, Chrome evaluates
 * prefers-reduced-motion inside the image as `no-preference` regardless of the
 * viewer's actual setting, so a `no-preference` gate is not a reliable switch:
 * it would be the only thing standing between the animation and never running
 * at all in any engine that reports nothing.
 *
 * Disabling on `reduce` degrades safely in both directions — it takes effect
 * wherever the preference is genuinely observable (the SVG inlined in a page,
 * and any engine that propagates it into images), and otherwise leaves the
 * default animated path intact.
 *
 * Whatever this block turns off must still leave a complete, readable image.
 */
export function motionReduce(css) {
  return `@media (prefers-reduced-motion: reduce) {${css}}`;
}
