// tools/ashlar/resolve.js
// Shared cross-root name resolution + disambiguation rendering, per the
// collision policy documented in tools/ashlar/README.md "Decisions".
//
// A `name` is unique only WITHIN one corpus root; the same name in a
// different root is legal. Name-only lookups that match multiple roots must
// return a disambiguation result rather than silently pick one
// (anti-hallucination rule) — the caller is instructed to pass `domain`.

/**
 * Resolve a document by name across all configured roots, optionally
 * narrowed by `domain`.
 * @param {Object} index - the built corpus index
 * @param {string} name
 * @param {string} [domain]
 * @returns {{status:'notfound'}|{status:'unique', doc:Object}|{status:'ambiguous', matches:Object[]}}
 */
export function findByName(index, name, domain) {
  const keys = index.byName.get(name) || [];
  let candidates = keys.map((k) => index.docs.get(k)).filter(Boolean);
  if (domain) candidates = candidates.filter((d) => d.domain === domain);

  if (candidates.length === 0) return { status: 'notfound' };
  if (candidates.length === 1) return { status: 'unique', doc: candidates[0] };
  return { status: 'ambiguous', matches: candidates };
}

/**
 * Render the disambiguation response text for an ambiguous name lookup.
 * @param {string} name
 * @param {Object[]} matches
 * @returns {string}
 */
export function renderAmbiguous(name, matches) {
  const lines = [
    `Ambiguous name "${name}": found in ${matches.length} corpus root(s). Pass a "domain" filter to disambiguate — never guessing.`,
    '',
    ...matches.map((m) => `- domain: ${m.domain}, root: ${m.rootLabel} (${m.rootPath})`)
  ];
  return lines.join('\n');
}
