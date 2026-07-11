// tools/ashlar/frontmatter.js
// Tiny hand-rolled YAML frontmatter parser: flat scalars + string lists only.

/**
 * Strip a single layer of surrounding matching quotes (single or double).
 * @param {string} value
 * @returns {string}
 */
function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') ||
      (trimmed[0] === "'" && trimmed[trimmed.length - 1] === "'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse an inline list like `[a, b, c]` into an array of strings.
 * @param {string} value
 * @returns {string[]}
 */
function parseInlineList(value) {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner.trim()) return [];
  return inner
    .split(',')
    .map((item) => stripQuotes(item.trim()))
    .filter((item) => item.length > 0);
}

/**
 * Parse a YAML frontmatter block out of a markdown document.
 * @param {string} markdown - raw markdown source
 * @returns {{ data: Object|null, body: string, raw: string }}
 */
export function parseFrontmatter(markdown) {
  const src = markdown ?? '';
  const lines = src.split(/\r?\n/);

  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { data: null, body: src, raw: '' };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { data: null, body: src, raw: '' };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const raw = frontmatterLines.join('\n');
  const bodyLines = lines.slice(endIndex + 1);
  const body = bodyLines.join('\n');

  const data = {};
  let currentKey = null;

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i];
    if (!line.trim()) continue;

    // Block list item under a preceding `key:` line.
    const blockItemMatch = line.match(/^\s*-\s+(.*)$/);
    if (blockItemMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = [];
      }
      data[currentKey].push(stripQuotes(blockItemMatch[1]));
      continue;
    }

    const kvMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].trim();
    const rawValue = kvMatch[2];

    if (rawValue.trim() === '') {
      // Could be the start of a block list; wait for `- item` lines.
      currentKey = key;
      data[key] = [];
      continue;
    }

    currentKey = null;

    if (/^\[.*\]$/.test(rawValue.trim())) {
      data[key] = parseInlineList(rawValue);
    } else {
      data[key] = stripQuotes(rawValue);
    }
  }

  return { data, body, raw };
}
