/**
 * Company name normalisation so "Acme Ltd", "ACME LIMITED" and "Acme (UK) Limited" match (ASSUMPTIONS.md).
 * Ported from the approach in github.com/ToukirOfficial/uk-sponsors (MIT).
 */
const SUFFIXES = new Set([
  'ltd',
  'limited',
  'plc',
  'llp',
  'lp',
  'inc',
  'incorporated',
  'llc',
  'corp',
  'corporation',
  'co',
  'company',
  'uk',
  'gb',
  'group',
  'holdings',
  'holding',
  'international',
  'the',
  't/a',
]);

export function normaliseCompany(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/\(.*?\)/g, (m) => ` ${m.slice(1, -1)} `)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter(Boolean);
  // Drop a leading "the", then legal suffixes from the end, but never empty the name.
  if (words.length > 1 && words[0] === 'the') words.shift();
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.join(' ');
}

/** Job titles: lower case, punctuation folded, so "Senior Engineer (Backend)" ≈ "senior engineer backend". */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}
