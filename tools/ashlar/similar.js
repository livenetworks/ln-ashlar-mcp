// tools/ashlar/similar.js
// Closest-match suggestions (Levenshtein distance) for "not found" responses.

/**
 * Case-insensitive Levenshtein edit distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * Return up to `max` closest candidates to `key`, sorted by Levenshtein
 * distance ascending, keeping only candidates within max(3, key.length/2).
 * @param {string} key
 * @param {string[]} candidates
 * @param {number} [max=5]
 * @returns {string[]}
 */
export function closest(key, candidates, max = 5) {
  if (!key || !Array.isArray(candidates) || candidates.length === 0) return [];
  const threshold = Math.max(3, Math.floor(key.length / 2));
  const scored = candidates
    .map((candidate) => ({ candidate, distance: levenshtein(key, candidate) }))
    .filter((entry) => entry.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);

  const results = [];
  const seen = new Set();
  for (const entry of scored) {
    if (seen.has(entry.candidate)) continue;
    seen.add(entry.candidate);
    results.push(entry.candidate);
    if (results.length >= max) break;
  }
  return results;
}
