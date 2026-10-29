const nativeAdvances: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667,
  "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333,
  '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584,
  '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667,
  F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722,
  V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278,
  ']': 278, '^': 469, _: 556, '`': 333, a: 556, b: 556, c: 500,
  d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500,
  l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500,
  t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334,
  '|': 260, '}': 334, '~': 584, '·': 278,
};
// Helvetica advances in 1/1000 em, rounded up from the official browser font.
// An em-wide fallback needlessly split ordinary Russian words in E2 headings.
const cyrillicAdvances: Record<string, number> = {
  А: 679, Б: 663, В: 667, Г: 520, Д: 702, Е: 667, Ё: 667, Ж: 993,
  З: 667, И: 723, Й: 723, К: 667, Л: 687, М: 834, Н: 723, О: 778,
  П: 723, Р: 667, С: 723, Т: 611, У: 667, Ф: 856, Х: 667, Ц: 732,
  Ч: 652, Ш: 944, Щ: 954, Ъ: 834, Ы: 880, Ь: 652, Э: 723, Ю: 1000, Я: 715,
  а: 557, б: 557, в: 548, г: 403, д: 606, е: 557, ё: 557, ж: 780,
  з: 500, и: 584, й: 584, к: 548, л: 575, м: 667, н: 557, о: 557,
  п: 557, р: 557, с: 500, т: 500, у: 500, ф: 833, х: 500, ц: 571,
  ч: 539, ш: 778, щ: 793, ъ: 611, ы: 723, ь: 500, э: 510, ю: 778, я: 559,
};
export const measureText = (text: string, size: number, legacy = false) => [...text].reduce((sum, char) => sum
  + (nativeAdvances[char] ?? (!legacy ? cyrillicAdvances[char] : undefined) ?? (/\d/u.test(char) ? 556 : 1000)), 0) / 1000 * size * 1.02 + 2;

/** Native display wrapping changes only line breaks, never the source or word
 * spelling. Browser allocation supplies actual Helvetica measurements. */
export function wrapText(content: string, width: number, fontSize: number, measure: (text: string, size: number) => number = measureText) {
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return content.replace(/\r\n?/gu, '\n').split('\n').map(paragraph => {
    const lines: string[] = [], tokens = paragraph.match(/\s+|\S+/gu) || [];
    let line = '';
    const nextLine = () => { lines.push(line.endsWith(' ') ? line.slice(0, -1) : line); line = ''; };
    for (const token of tokens) {
      if (/^\s+$/u.test(token)) { line += token; continue; }
      if (line && measure(line + token, fontSize) > width) nextLine();
      if (measure(token, fontSize) <= width) { line += token; continue; }
      // Prefer authored hyphens as word boundaries. Only a still-overwide
      // segment may fall back to grapheme wrapping.
      const pieces = token.match(/.*?-(?=.)|.+/gu) || [token];
      for (const piece of pieces) {
        if (line && measure(line + piece, fontSize) > width) nextLine();
        if (measure(piece, fontSize) <= width) { line += piece; continue; }
        for (const { segment } of graphemes.segment(piece)) {
          if (line && measure(line + segment, fontSize) > width) nextLine();
          line += segment;
        }
      }
    }
    lines.push(line);
    return lines.join('\n');
  }).join('\n');
}

/** Match display-only wrapping without trimming or collapsing authored whitespace.
 * A wrap may replace one ASCII space or split at a grapheme boundary; authored
 * line breaks, tabs and all other characters retain their order and identity. */
export function matchesTextReflow(visible: unknown, source: unknown): boolean {
  if (typeof visible !== 'string' || typeof source !== 'string') return false;
  const expected = [...source.replace(/\r\n?/gu, '\n')], actual = [...visible.replace(/\r\n?/gu, '\n')];
  const boundaries = new Set([0]);
  let count = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(expected.join(''))) {
    count += [...segment].length;
    boundaries.add(count);
  }
  let i = 0, j = 0, insertedAt = -1;
  while (i < expected.length && j < actual.length) {
    if (expected[i] === actual[j]) { i++; j++; continue; }
    if (actual[j] === '\n' && expected[i] === ' ') { i++; j++; continue; }
    if (actual[j] === '\n' && i > 0 && insertedAt !== i && boundaries.has(i) && expected[i] !== '\n'
      && expected[i] !== ' ' && expected[i - 1] !== ' ' && expected[i - 1] !== '\n') {
      // Insertion consumes one source boundary, not a source character. Reusing
      // it would create a blank line that wrapping the authored text cannot add.
      insertedAt = i;
      j++;
      continue;
    }
    return false;
  }
  return i === expected.length && j === actual.length;
}
