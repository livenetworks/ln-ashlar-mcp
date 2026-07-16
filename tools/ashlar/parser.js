// tools/ashlar/parser.js
// Pure markdown documentation parser for the ln-ashlar docs-mcp corpus.
// No filesystem access here — parseDoc() takes markdown text and returns
// structured data (sections, attribute/event tables, markup blocks, links).
//
// Contract (English, 2026-07-11 decision): all normative headings/tables are
// authored in English. See resources/ln-ashlar/docs-mcp/README.md +
// _templates/*.md — those templates are authoritative.

import { parseFrontmatter } from './frontmatter.js';

/**
 * Strip ALL backtick characters and surrounding whitespace from a value.
 * Used for index-key-like fields (attribute name, event name, scss api name).
 * @param {string} value
 * @returns {string}
 */
function stripAllBackticks(value) {
  return (value ?? '').replace(/`/g, '').trim();
}

/**
 * Strip only a single outer pair of backticks (if present) from a cell value.
 * @param {string} value
 * @returns {string}
 */
function stripOuterBackticks(value) {
  let t = (value ?? '').trim();
  if (t.length >= 2 && t.startsWith('`') && t.endsWith('`')) {
    t = t.slice(1, -1);
  }
  return t;
}

/**
 * Scan lines and record all ATX `##`/`###` headings that are outside fenced
 * code blocks, tracking ``` fences as we go.
 * @param {string[]} lines
 * @returns {Array<{level:number, number:number|null, title:string, rawTitle:string, lineIndex:number}>}
 */
function computeHeadings(lines) {
  const headings = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = lines[i].match(/^(#{2,3})\s+(.*)$/);
    if (!m) continue;
    const level = m[1].length;
    const rawTitle = m[2].trim();
    const numMatch = rawTitle.match(/^(\d+)\.\s*(.*)$/);
    const number = numMatch ? parseInt(numMatch[1], 10) : null;
    const title = numMatch ? numMatch[2].trim() : rawTitle;
    headings.push({ level, number, title, rawTitle, lineIndex: i });
  }
  return headings;
}

/**
 * Find the exclusive end line index for the section started by headings[idx],
 * i.e. the line index of the next heading of the same-or-higher level, or the
 * end of the document.
 * @param {Array} headings
 * @param {number} idx
 * @param {string[]} lines
 * @returns {number}
 */
function sectionEnd(headings, idx, lines) {
  const level = headings[idx].level;
  for (let k = idx + 1; k < headings.length; k++) {
    if (headings[k].level <= level) return headings[k].lineIndex;
  }
  return lines.length;
}

/**
 * Build the flat sections array (one entry per heading, both `##` and `###`).
 * @param {string[]} lines
 * @param {Array} headings
 * @returns {Array}
 */
function buildSections(lines, headings) {
  return headings.map((h, idx) => {
    const end = sectionEnd(headings, idx, lines);
    const text = lines.slice(h.lineIndex + 1, end).join('\n').trim();
    return {
      level: h.level,
      number: h.number,
      title: h.title,
      rawTitle: h.rawTitle,
      startLine: h.lineIndex + 1,
      text
    };
  });
}

/**
 * True if a trimmed line looks like a GFM table separator row (e.g. `| --- | --- |`).
 * @param {string} line
 * @returns {boolean}
 */
function isSeparatorRow(line) {
  const t = line.trim();
  if (!t.includes('-')) return false;
  return /^[|\s:-]+$/.test(t);
}

/**
 * Split a raw table row line into trimmed cell strings (outer pipes removed).
 * Only a whole-cell-wrapping outer pair of backticks is stripped here — a
 * cell like `` `detail` Object `` (backticks around just part of the text)
 * is left intact, since the normative Events header cell is exactly that.
 * @param {string} line
 * @returns {string[]}
 */
function splitTableRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((cell) => stripOuterBackticks(cell));
}

/**
 * Locate and parse the first GFM pipe table within lines[start, end).
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @returns {{columns:string[], rows:string[][], endIndex:number}|null}
 */
function findTableInRange(lines, start, end) {
  for (let i = start; i < end; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    if (i + 1 >= end || !isSeparatorRow(lines[i + 1])) continue;
    const columns = splitTableRow(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < end && lines[j].trim().startsWith('|')) {
      rows.push(splitTableRow(lines[j]));
      j++;
    }
    return { columns, rows, endIndex: j };
  }
  return null;
}

/**
 * Generic GFM pipe table parser.
 * @param {string[]} lines - lines containing (or starting at) a table
 * @returns {{columns:string[], rows:string[][]}}
 */
export function parseTable(lines) {
  const result = findTableInRange(lines, 0, lines.length);
  if (!result) return { columns: [], rows: [] };
  return { columns: result.columns, rows: result.rows };
}

/**
 * Find a heading (by `title`, i.e. leading `N. ` stripped) at any level and
 * extract its first pipe table, mapped through rowMapper. Used for tables
 * that live directly under a `##` section (css SCSS API, pattern Included
 * Components) with no intervening `###` subheading.
 * @param {string[]} lines
 * @param {Array} headings
 * @param {string} title
 * @param {(row:string[]) => Object} rowMapper
 * @returns {Object[]}
 */
function extractTableSection(lines, headings, title, rowMapper) {
  const idx = headings.findIndex((h) => h.title === title);
  if (idx === -1) return [];
  const start = headings[idx].lineIndex + 1;
  const end = sectionEnd(headings, idx, lines);
  const table = findTableInRange(lines, start, end);
  if (!table) return [];
  return table.rows.map(rowMapper);
}

/**
 * Find a `###` subheading (by title) nested under a specific `##` section
 * (by title) and extract its first pipe table. Used for the components §3
 * tables, which now live under explicit `### Attributes Table` /
 * `### Events API` subheadings rather than being located by column signature.
 * @param {string[]} lines
 * @param {Array} headings
 * @param {string} level2Title
 * @param {string} level3Title
 * @param {(row:string[]) => Object} rowMapper
 * @returns {Object[]}
 */
function extractTableUnderSubheading(lines, headings, level2Title, level3Title, rowMapper) {
  const parentIdx = headings.findIndex((h) => h.level === 2 && h.title === level2Title);
  if (parentIdx === -1) return [];
  const parentEnd = sectionEnd(headings, parentIdx, lines);

  let subIdx = -1;
  for (let k = parentIdx + 1; k < headings.length; k++) {
    if (headings[k].lineIndex >= parentEnd) break;
    if (headings[k].level === 3 && headings[k].title === level3Title) {
      subIdx = k;
      break;
    }
  }
  if (subIdx === -1) return [];

  const start = headings[subIdx].lineIndex + 1;
  const end = Math.min(sectionEnd(headings, subIdx, lines), parentEnd);
  const table = findTableInRange(lines, start, end);
  if (!table) return [];
  return table.rows.map(rowMapper);
}

/**
 * Extract fenced code blocks whose (normalized) fence language is in
 * `allowedLangs` within lines[start, end). `javascript` normalizes to `js`.
 * Each returned block carries its own normalized lang.
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @param {string[]} allowedLangs - e.g. ["html"] or ["html", "js"]
 * @returns {Array<{code:string, lang:string}>}
 */
function extractFencedBlocks(lines, start, end, allowedLangs) {
  const blocks = [];
  let i = start;
  while (i < end) {
    const trimmed = lines[i].trim();
    const openMatch = trimmed.match(/^```(\S*)/);
    if (openMatch) {
      let language = (openMatch[1] || '').toLowerCase();
      if (language === 'javascript') language = 'js';
      const blockLines = [];
      let j = i + 1;
      while (j < end && lines[j].trim() !== '```') {
        blockLines.push(lines[j]);
        j++;
      }
      if (allowedLangs.includes(language)) {
        blocks.push({ code: blockLines.join('\n'), lang: language });
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return blocks;
}

/**
 * Join same-lang fenced blocks into a single markup entry. If a subsection
 * somehow mixes langs, all blocks are joined and the lang of the first block
 * is used (edge case, not over-engineered).
 * @param {Array<{code:string, lang:string}>} blocks
 * @returns {{code:string, lang:string}|null}
 */
function joinBlocks(blocks) {
  if (!blocks.length) return null;
  return { code: blocks.map((b) => b.code).join('\n\n'), lang: blocks[0].lang };
}

/**
 * Extract the base markup + variants from the "Minimal HTML Markup & Usage
 * Variants" (components/css) or "Complete HTML Markup" (patterns) §2
 * section. Components with `classification: service` use ```js blocks under
 * the same frozen subheadings instead of ```html.
 * @param {string[]} lines
 * @param {Array} headings
 * @param {string[]} allowedLangs - e.g. ["html"] or ["html", "js"]
 * @returns {{base:{code:string, lang:string}|null, variants:Array<{title:string, code:string, lang:string}>}}
 */
function extractMarkup(lines, headings, allowedLangs) {
  const secIdx = headings.findIndex(
    (h) =>
      h.level === 2 &&
      (h.title === 'Minimal HTML Markup & Usage Variants' || h.title === 'Complete HTML Markup')
  );
  if (secIdx === -1) return { base: null, variants: [] };

  const start = headings[secIdx].lineIndex + 1;
  const end = sectionEnd(headings, secIdx, lines);

  const subs = [];
  for (let k = secIdx + 1; k < headings.length; k++) {
    if (headings[k].lineIndex >= end) break;
    if (headings[k].level === 3) subs.push(k);
  }

  if (subs.length === 0) {
    const blocks = extractFencedBlocks(lines, start, end, allowedLangs);
    return { base: joinBlocks(blocks), variants: [] };
  }

  let base = null;
  const variants = [];
  for (const hIdx of subs) {
    const subStart = headings[hIdx].lineIndex + 1;
    const subEnd = Math.min(sectionEnd(headings, hIdx, lines), end);
    const blocks = extractFencedBlocks(lines, subStart, subEnd, allowedLangs);
    const title = headings[hIdx].title;
    if (title === 'Base HTML Markup') {
      const joined = joinBlocks(blocks);
      if (joined) base = joined;
    } else if (/^Variant\s+\d+:/.test(title)) {
      const joined = joinBlocks(blocks);
      variants.push({ title, code: joined ? joined.code : '', lang: joined ? joined.lang : 'html' });
    }
  }
  return { base, variants };
}

/**
 * Extract relative markdown links (`./x.md`, `../folder/y.md#frag`) from the
 * document body, ignoring links inside fenced code blocks. Malformed link
 * targets (anything not matching the relative-.md shape) are simply ignored,
 * not reported.
 * @param {string[]} lines
 * @returns {string[]}
 */
function extractLinks(lines) {
  const links = [];
  const seen = new Set();
  let inFence = false;
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    linkRe.lastIndex = 0;
    let m;
    while ((m = linkRe.exec(line))) {
      const target = m[1].trim();
      if (/^\.{1,2}\/.*\.md(#.*)?$/.test(target)) {
        const clean = target.split('#')[0];
        if (!seen.has(clean)) {
          seen.add(clean);
          links.push(clean);
        }
      }
    }
  }
  return links;
}

/**
 * Parse a single ln-ashlar docs-mcp markdown document.
 * @param {string} markdown - raw markdown source (including frontmatter)
 * @param {Object} [meta] - optional caller metadata (not used for parsing logic)
 * @returns {Object} parsed document structure (see tools/ashlar module docs)
 */
export function parseDoc(markdown, meta = {}) {
  const { data: frontmatter, body } = parseFrontmatter(markdown);
  const lines = body.split(/\r?\n/);
  const headings = computeHeadings(lines);
  const sections = buildSections(lines, headings);

  const attributes = extractTableUnderSubheading(
    lines,
    headings,
    'Declarative API Contract (Attributes & Events)',
    'Attributes Table',
    (r) => ({
      attribute: stripAllBackticks(r[0]),
      element: r[1],
      typeValues: r[2],
      default: r[3],
      description: r[4]
    })
  );

  const events = extractTableUnderSubheading(
    lines,
    headings,
    'Declarative API Contract (Attributes & Events)',
    'Events API',
    (r) => ({
      event: stripAllBackticks(r[0]),
      direction: r[1],
      cancelable: r[2],
      description: r[3],
      detail: r[4]
    })
  );

  const scssApi = extractTableSection(lines, headings, 'SCSS API (Mixins, Classes & Tokens)', (r) => ({
    name: stripAllBackticks(r[0]),
    kind: r[1],
    params: r[2],
    description: r[3]
  }));

  const includedComponents = extractTableSection(lines, headings, 'Included Components', (r) => ({
    component: stripAllBackticks(r[0]),
    role: r[1]
  }));

  const allowedLangs = frontmatter && frontmatter.classification === 'service' ? ['html', 'js'] : ['html'];
  const markup = extractMarkup(lines, headings, allowedLangs);
  const links = extractLinks(lines);

  return {
    frontmatter,
    body,
    sections,
    attributes,
    events,
    markup,
    scssApi,
    includedComponents,
    links
  };
}
