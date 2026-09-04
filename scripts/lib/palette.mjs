/**
 * Shared design tokens.
 *
 * These values are mirrored in the Pages site (site/src/styles/tokens.css) so the
 * README SVGs and the website read as one system. Change them in both places.
 */

/** GitHub's five contribution levels, light theme. Index 0 = no contributions. */
export const CONTRIB_LIGHT = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

/** GitHub's five contribution levels, dark theme. */
export const CONTRIB_DARK = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

export const THEMES = {
  light: {
    name: 'light',
    bg: 'transparent',
    surface: '#ffffff',
    border: '#d0d7de',
    text: '#1f2328',
    textMuted: '#59636e',
    accent: '#0969da',
    /** The shiritori snake body. */
    snake: '#8957e5',
    snakeHead: '#6639ba',
    /** Kana glyphs riding on the snake. */
    kana: '#ffffff',
    contrib: CONTRIB_LIGHT,
    grid: '#ebedf0',
  },
  dark: {
    name: 'dark',
    bg: 'transparent',
    surface: '#0d1117',
    border: '#30363d',
    text: '#e6edf3',
    textMuted: '#8b949e',
    accent: '#4493f8',
    snake: '#a371f7',
    snakeHead: '#bc8cff',
    kana: '#0d1117',
    contrib: CONTRIB_DARK,
    grid: '#161b22',
  },
};

/**
 * Colours for the language card. Keyed by language name as GitHub reports it.
 * Anything unlisted falls back to a stable hash-derived hue so new languages
 * still get a distinct, repeatable colour rather than grey.
 */
export const LANGUAGE_COLORS = {
  Python: '#3572A5',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Jupyter: '#DA5B0B',
  'Jupyter Notebook': '#DA5B0B',
  C: '#555555',
  'C++': '#f34b7d',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  Dockerfile: '#384d54',
  Makefile: '#427819',
  Lua: '#000080',
  Vue: '#41b883',
  Svelte: '#ff3e00',
};

/** Deterministic fallback colour for a language with no entry above. */
export function languageColor(name) {
  if (LANGUAGE_COLORS[name]) return LANGUAGE_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 62% 52%)`;
}
