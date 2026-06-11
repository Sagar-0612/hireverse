// Normalizes a title for duplicate comparison: trims, collapses internal
// whitespace, and lowercases — so "Full Stack Developer", "full stack developer ",
// and "Full  Stack Developer" all compare equal.
export function normalizeTitle(s: string): string {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
