/**
 * Shiritori (しりとり) chain construction.
 *
 * Rules implemented:
 *  - The first kana of a word must equal the last kana of the previous word.
 *  - A word ending in ん ends the game, so such words are unusable and are
 *    filtered out of the pool entirely.
 *  - Small kana (ゃゅょぁぃぅぇぉ) count as their full-size form when matching.
 *  - A trailing ー takes the vowel of the kana before it (めろでぃー -> い).
 *  - っ cannot end a usable word; treated as unusable.
 *
 * The word list is an unordered pool. We search for a long valid ordering
 * rather than trusting hand-authored order, so adding a word can never break
 * the chain.
 */

const SMALL_TO_LARGE = {
  ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お',
  ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ',
};

/** Vowel each kana ends on, used to resolve a trailing ー. */
const KANA_VOWEL = {
  あ: 'あ', か: 'あ', が: 'あ', さ: 'あ', ざ: 'あ', た: 'あ', だ: 'あ', な: 'あ', は: 'あ', ば: 'あ', ぱ: 'あ', ま: 'あ', や: 'あ', ら: 'あ', わ: 'あ',
  い: 'い', き: 'い', ぎ: 'い', し: 'い', じ: 'い', ち: 'い', ぢ: 'い', に: 'い', ひ: 'い', び: 'い', ぴ: 'い', み: 'い', り: 'い',
  う: 'う', く: 'う', ぐ: 'う', す: 'う', ず: 'う', つ: 'う', づ: 'う', ぬ: 'う', ふ: 'う', ぶ: 'う', ぷ: 'う', む: 'う', ゆ: 'う', る: 'う',
  え: 'え', け: 'え', げ: 'え', せ: 'え', ぜ: 'え', て: 'え', で: 'え', ね: 'え', へ: 'え', べ: 'え', ぺ: 'え', め: 'え', れ: 'え',
  お: 'お', こ: 'お', ご: 'お', そ: 'お', ぞ: 'お', と: 'お', ど: 'お', の: 'お', ほ: 'お', ぼ: 'お', ぽ: 'お', も: 'お', よ: 'お', ろ: 'お', を: 'お',
};

/** The kana a word offers to the next player. */
export function tailKana(word) {
  const chars = [...word];
  let i = chars.length - 1;

  // A trailing ー resolves to the vowel of whatever precedes it.
  if (chars[i] === 'ー') {
    const prev = chars[i - 1];
    const base = SMALL_TO_LARGE[prev] ?? prev;
    return KANA_VOWEL[base] ?? base;
  }

  const last = chars[i];
  return SMALL_TO_LARGE[last] ?? last;
}

/** The kana a word requires from the previous player. */
export function headKana(word) {
  const first = [...word][0];
  return SMALL_TO_LARGE[first] ?? first;
}

/** A word is usable if playing it does not immediately end the game. */
export function isUsable(word) {
  const chars = [...word];
  const last = chars[chars.length - 1];
  if (last === 'ん') return false;
  if (last === 'っ') return false;
  return true;
}

/**
 * Order the pool into the longest valid chain we can find.
 *
 * Greedy depth-first with backtracking, preferring next-words whose tail kana
 * has the most remaining continuations — a cheap heuristic that avoids walking
 * into a dead end early. Capped so a large pool cannot stall the build.
 */
export function buildChain(pool, { start, maxSteps = 200000 } = {}) {
  const usable = pool.filter((w) => isUsable(w.kana));

  const byHead = new Map();
  for (const word of usable) {
    const h = headKana(word.kana);
    if (!byHead.has(h)) byHead.set(h, []);
    byHead.get(h).push(word);
  }

  const used = new Set();
  let steps = 0;
  let best = [];

  const continuations = (kana) => (byHead.get(kana) ?? []).filter((w) => !used.has(w.kana)).length;

  function walk(current, chain) {
    if (chain.length > best.length) best = [...chain];
    if (steps++ > maxSteps) return true; // bail out, keep best found so far

    const candidates = (byHead.get(tailKana(current.kana)) ?? [])
      .filter((w) => !used.has(w.kana))
      .sort((a, b) => continuations(tailKana(b.kana)) - continuations(tailKana(a.kana)));

    for (const next of candidates) {
      used.add(next.kana);
      chain.push(next);
      const bail = walk(next, chain);
      chain.pop();
      used.delete(next.kana);
      if (bail) return true;
    }
    return false;
  }

  const first = usable.find((w) => w.kana === start) ?? usable[0];
  if (!first) return [];
  used.add(first.kana);
  walk(first, [first]);

  return best;
}

/** Throw if a chain violates the rules. Used as a build-time assertion. */
export function validateChain(chain) {
  for (let i = 0; i < chain.length; i++) {
    if (!isUsable(chain[i].kana)) {
      throw new Error(`shiritori: "${chain[i].kana}" ends the game and must not appear`);
    }
    if (i === 0) continue;
    const prev = tailKana(chain[i - 1].kana);
    const next = headKana(chain[i].kana);
    if (prev !== next) {
      throw new Error(
        `shiritori: "${chain[i - 1].kana}" (-> ${prev}) does not chain into "${chain[i].kana}" (${next} ->)`,
      );
    }
  }
  return true;
}

/** Flatten a chain into per-kana entries, tagging which kana closes a word. */
export function chainToKana(chain) {
  const out = [];
  for (const word of chain) {
    const chars = [...word.kana];
    chars.forEach((ch, i) => {
      out.push({
        kana: ch,
        word: word.kana,
        romaji: word.romaji,
        gloss: word.gloss,
        isWordEnd: i === chars.length - 1,
      });
    });
  }
  return out;
}
