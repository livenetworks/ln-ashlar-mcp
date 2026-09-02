// tools/ashlar/parser.js
// Pure markdown documentation parser for the ln-ashlar docs-mcp corpus.
// No filesystem access here — parseDoc() takes markdown text and returns
// structured data (sections, attribute/event tables, markup blocks, links, warnings).

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
 * Normalize a title string for tolerant comparison:
 * - strips leading numeric prefixes (e.g. "3. ", "N. ")
 * - strips emoji / decorative unicode symbols
 * - strips markdown formatting (backticks, bold, italics)
 * - trims and lowercases
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .replace(/^\d+\.\s*/, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Scan lines and record all ATX `##`/`###` headings that are outside fenced
 * code blocks, tracking ``` / ~~~ fences and their lengths as we go.
 * @param {string[]} lines
 * @param {string[]} [warnings]
 * @returns {Array<{level:number, number:number|null, title:string, rawTitle:string, lineIndex:number}>}
 */
function computeHeadings(lines, warnings = []) {
  const headings = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (fenceMatch) {
      const char = fenceMatch[1][0];
      const len = fenceMatch[1].length;

      if (!inFence) {
        inFence = true;
        fenceChar = char;
        fenceLen = len;
        continue;
      } else if (char === fenceChar && len >= fenceLen) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
        continue;
      }
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

  if (inFence) {
    warnings.push('unbalancedFence: document contains unclosed fenced code block');
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
 * Build a flat array of section descriptors for all `##` and `###` headings.
 * @param {string[]} lines
 * @param {Array} headings
 * @returns {Array<{level:number, number:number|null, title:string, rawTitle:string, lineIndex:number, content:string}>}
 */
function buildSections(lines, headings) {
  const sections = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const start = h.lineIndex + 1;
    const end = sectionEnd(headings, i, lines);
    const content = lines.slice(start, end).join('\n').trim();
    sections.push({
      level: h.level,
      number: h.number,
      title: h.title,
      rawTitle: h.rawTitle,
      lineIndex: h.lineIndex,
      text: content,
      content
    });
  }
  return sections;
}

/**
 * Check if a line is a GFM table separator row (`| --- | :---: |`).
 * @param {string} line
 * @returns {boolean}
 */
function isSeparatorRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return false;
  const inner = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined);
  const cells = inner.split('|');
  if (cells.length === 0) return false;
  return cells.every((c) => /^[\s:-]+$/.test(c) && c.includes('-'));
}

/**
 * Split a pipe-delimited table row into trimmed cell strings.
 * @param {string} line
 * @returns {string[]}
 */
function splitTableRow(line) {
  const trimmed = line.trim();
  let content = trimmed;
  if (content.startsWith('|')) content = content.slice(1);
  if (content.endsWith('|')) content = content.slice(0, -1);

  const cells = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '`') {
      inCode = !inCode;
      current += char;
    } else if (char === '\\' && i + 1 < content.length && content[i + 1] === '|') {
      current += '|';
      i++;
    } else if (char === '|' && !inCode) {
      cells.push(stripOuterBackticks(current));
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(stripOuterBackticks(current));
  return cells;
}

/**
 * Locate and parse the first GFM pipe table within lines[start, end).
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @returns {{columns:string[], rows:string[][], endIndex:number}|null}
 */
function findTableInRange(lines, start, end) {
  const tables = findTablesInRange(lines, start, end);
  return tables.length ? tables[0] : null;
}

/**
 * Locate and parse all GFM pipe tables within lines[start, end).
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @returns {Array<{columns:string[], rows:string[][], endIndex:number}>}
 */
function findTablesInRange(lines, start, end) {
  const tables = [];
  let i = start;
  while (i < end) {
    if (!lines[i].trim().startsWith('|')) {
      i++;
      continue;
    }
    if (i + 1 >= end || !isSeparatorRow(lines[i + 1])) {
      i++;
      continue;
    }
    const columns = splitTableRow(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < end && lines[j].trim().startsWith('|')) {
      rows.push(splitTableRow(lines[j]));
      j++;
    }
    tables.push({ columns, rows, endIndex: j });
    i = j;
  }
  return tables;
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
 * Dynamic column resolver using header synonyms.
 * @param {string[]} rawColumns
 * @param {Object.<string, string[]>} synonymMap - targetKey -> list of accepted header synonyms
 * @returns {Object.<string, number>} targetKey -> columnIndex (-1 if missing)
 */
function resolveColumnIndices(rawColumns, synonymMap) {
  const normHeaders = rawColumns.map((c) =>
    (c || '')
      .replace(/[`*_~]/g, '')
      .trim()
      .toLowerCase()
  );

  const resolved = {};
  for (const [targetKey, synonyms] of Object.entries(synonymMap)) {
    let matchIdx = -1;
    for (const syn of synonyms) {
      const s = syn.toLowerCase();
      matchIdx = normHeaders.findIndex((h) => h === s || h.startsWith(s));
      if (matchIdx !== -1) break;
    }
    resolved[targetKey] = matchIdx;
  }
  return resolved;
}

const ATTRIBUTE_SYNONYMS = {
  attribute: ['attribute', 'name', 'directive', 'property'],
  element: ['element', 'target element', 'target', 'applies to', 'applies'],
  typeValues: ['type / values', 'type/values', 'type', 'values', 'value format', 'value', 'format'],
  default: ['default', 'default value', 'initial'],
  description: ['description', 'details', 'summary', 'behavior', 'purpose']
};

const EVENT_SYNONYMS = {
  event: ['event', 'name', 'event name'],
  direction: ['direction', 'type', 'flow'],
  cancelable: ['cancelable', 'cancellable'],
  description: ['description', 'summary', 'details', 'purpose'],
  detail: ['`detail` object', 'detail object', 'detail', 'payload']
};

/**
 * Extract fenced code blocks whose (normalized) fence language is in
 * `allowedLangs` within lines[start, end).
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @param {string[]} allowedLangs
 * @returns {Array<{code:string, lang:string}>}
 */
function extractFencedBlocks(lines, start, end, allowedLangs) {
  const blocks = [];
  let inBlock = false;
  let currentLang = 'html';
  let currentLines = [];
  let fenceChar = '`';
  let fenceLen = 3;

  for (let i = start; i < end; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const openMatch = trimmed.match(/^(`{3,}|~{3,})([a-zA-Z0-9_-]*)/);

    if (openMatch && !inBlock) {
      fenceChar = openMatch[1][0];
      fenceLen = openMatch[1].length;
      let lang = openMatch[2].toLowerCase().trim() || 'html';
      if (lang === 'javascript') lang = 'js';
      if (allowedLangs.includes(lang)) {
        inBlock = true;
        currentLang = lang;
        currentLines = [];
      }
      continue;
    }

    if (inBlock && trimmed.match(/^(`{3,}|~{3,})/)) {
      const closeMatch = trimmed.match(/^(`{3,}|~{3,})/);
      if (closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLen) {
        inBlock = false;
        blocks.push({ code: currentLines.join('\n'), lang: currentLang });
        currentLines = [];
        continue;
      }
    }

    if (inBlock) {
      currentLines.push(line);
    }
  }

  return blocks;
}

function joinBlocks(blocks) {
  if (!blocks || blocks.length === 0) return null;
  return {
    code: blocks.map((b) => b.code).join('\n\n'),
    lang: blocks[0].lang
  };
}

/**
 * Extract HTML/JS markup blocks from Section 2 (or equivalent markup section).
 * @param {string[]} lines
 * @param {Array} headings
 * @param {string[]} allowedLangs
 * @param {string[]} [warnings]
 * @returns {{base:{code:string, lang:string, provenance:string}|null, variants:Array<{title:string, code:string, lang:string}>}}
 */
function extractMarkup(lines, headings, allowedLangs, warnings = []) {
  const sec2Idx = headings.findIndex((h) => {
    if (h.level !== 2) return false;
    const norm = normalizeTitle(h.title);
    return (
      norm.includes('markup') ||
      norm.includes('usage') ||
      norm.includes('html') ||
      norm.includes('syntax')
    );
  });

  if (sec2Idx === -1) return { base: null, variants: [] };

  const end = sectionEnd(headings, sec2Idx, lines);
  const subs = [];
  for (let k = sec2Idx + 1; k < headings.length; k++) {
    if (headings[k].lineIndex >= end) break;
    if (headings[k].level === 3) subs.push(k);
  }

  let base = null;
  const variants = [];

  for (const hIdx of subs) {
    const subStart = headings[hIdx].lineIndex + 1;
    const subEnd = Math.min(sectionEnd(headings, hIdx, lines), end);
    const blocks = extractFencedBlocks(lines, subStart, subEnd, allowedLangs);
    const title = headings[hIdx].title;
    const norm = normalizeTitle(title);

    if (norm.startsWith('base html') || norm.startsWith('base markup') || norm === 'canonical markup') {
      const joined = joinBlocks(blocks);
      if (joined) {
        base = {
          ...joined,
          provenance: title === 'Base HTML Markup' ? 'canonical' : 'recovered'
        };
        if (title !== 'Base HTML Markup') {
          warnings.push(`nonCanonicalBaseMarkupHeading: "${title}"`);
        }
      }
    } else if (/^variant\s+\d+:/i.test(title) || norm.startsWith('variant') || norm.startsWith('ssr mode')) {
      const joined = joinBlocks(blocks);
      variants.push({ title, code: joined ? joined.code : '', lang: joined ? joined.lang : 'html' });
    }
  }

  // Fallback: if no base heading matched, but Section 2 contains code block before first variant
  if (!base) {
    const firstSubStart = subs.length > 0 ? headings[subs[0]].lineIndex : end;
    const directBlocks = extractFencedBlocks(lines, headings[sec2Idx].lineIndex + 1, firstSubStart, allowedLangs);
    const joined = joinBlocks(directBlocks);
    if (joined) {
      base = {
        ...joined,
        provenance: 'recovered'
      };
      warnings.push(`directSection2BaseMarkup: recovered code block directly under "${headings[sec2Idx].title}"`);
    }
  }

  return { base, variants };
}

/**
 * Extract attribute tables from Section 3 with provenance tracking.
 * @param {string[]} lines
 * @param {Array} headings
 * @param {string[]} [warnings]
 * @returns {Array<Object>}
 */
function extractAttributes(lines, headings, warnings = []) {
  const parentIdx = headings.findIndex((h) => {
    if (h.level !== 2) return false;
    const norm = normalizeTitle(h.title);
    return (
      norm.includes('contract') ||
      norm.includes('declarative api') ||
      norm.includes('attributes') ||
      norm.includes('api contract')
    );
  });

  if (parentIdx === -1) return [];
  const parentEnd = sectionEnd(headings, parentIdx, lines);

  const attributes = [];
  const subHeadings = [];
  for (let k = parentIdx + 1; k < headings.length; k++) {
    if (headings[k].lineIndex >= parentEnd) break;
    if (headings[k].level === 3) subHeadings.push(k);
  }

  function extractFromTable(table, provenance, headingTitle) {
    if (!table || !table.rows.length) return;
    const colMap = resolveColumnIndices(table.columns, ATTRIBUTE_SYNONYMS);

    for (const r of table.rows) {
      const rawAttr = colMap.attribute !== -1 ? r[colMap.attribute] : r[0];
      let attrKey = stripAllBackticks(rawAttr);
      if (!attrKey) continue;
      if (attrKey.includes("=")) {
        attrKey = attrKey.split("=")[0].trim();
      }
      if (!attrKey) continue;

      // Shape-based routing: colon-containing names that are not data-ln-* are events, not attributes
      if (attrKey.includes(":") && !attrKey.startsWith("data-ln-")) {
        continue;
      }

      const element = colMap.element !== -1 ? r[colMap.element] : (r[1] || '');
      const typeValues = colMap.typeValues !== -1 ? r[colMap.typeValues] : (r[2] || '');
      const defaultVal = colMap.default !== -1 ? r[colMap.default] : '';
      const description = colMap.description !== -1 ? r[colMap.description] : (colMap.default === -1 ? r[3] : (r[4] || ''));

      attributes.push({
        attribute: attrKey,
        element: element || '',
        typeValues: typeValues || '',
        default: defaultVal || '',
        description: description || '',
        provenance,
        sourceHeading: headingTitle
      });
    }
  }

  // 1. Check tables under matching ### subheadings
  for (const hIdx of subHeadings) {
    const title = headings[hIdx].title;
    const norm = normalizeTitle(title);

    const isCanonical = title === 'Attributes Table';
    const isAcceptedSubheading =
      isCanonical ||
      norm.includes('attribute') ||
      norm.includes('vocabulary') ||
      norm.includes('bindings');

    if (isAcceptedSubheading) {
      const start = headings[hIdx].lineIndex + 1;
      const end = Math.min(sectionEnd(headings, hIdx, lines), parentEnd);
      const table = findTableInRange(lines, start, end);
      if (table) {
        const provenance = isCanonical ? 'canonical' : 'recovered';
        if (!isCanonical) {
          warnings.push(`nonCanonicalAttributeHeading: "${title}"`);
        }
        extractFromTable(table, provenance, title);
      }
    }
  }

  // 2. If no subheadings matched, check for table directly under ##
  if (attributes.length === 0) {
    const firstSubStart = subHeadings.length > 0 ? headings[subHeadings[0]].lineIndex : parentEnd;
    const directTables = findTablesInRange(lines, headings[parentIdx].lineIndex + 1, firstSubStart);
    for (const directTable of directTables) {
      extractFromTable(directTable, 'recovered', headings[parentIdx].title);
    }
    if (attributes.length > 0) {
      warnings.push(`directSection3AttributeTable: recovered table directly under "${headings[parentIdx].title}"`);
    }
  }

  return attributes;
}

/**
 * Extract events table from Section 3 with provenance tracking.
 * @param {string[]} lines
 * @param {Array} headings
 * @param {string[]} [warnings]
 * @returns {Array<Object>}
 */
function extractEvents(lines, headings, warnings = []) {
  const parentIdx = headings.findIndex((h) => {
    if (h.level !== 2) return false;
    const norm = normalizeTitle(h.title);
    return (
      norm.includes('contract') ||
      norm.includes('declarative api') ||
      norm.includes('events') ||
      norm.includes('api contract')
    );
  });

  if (parentIdx === -1) return [];
  const parentEnd = sectionEnd(headings, parentIdx, lines);

  const events = [];
  const subHeadings = [];
  for (let k = parentIdx + 1; k < headings.length; k++) {
    if (headings[k].lineIndex >= parentEnd) break;
    if (headings[k].level === 3) subHeadings.push(k);
  }

  function extractFromEventsTable(table, provenance, headingTitle, isFallback = false) {
    if (!table || !table.rows.length) return;
    const colMap = resolveColumnIndices(table.columns, EVENT_SYNONYMS);

    for (const r of table.rows) {
      const rawEvent = colMap.event !== -1 ? r[colMap.event] : r[0];
      const eventKey = stripAllBackticks(rawEvent);
      if (!eventKey) continue;

      // In fallback / mixed tables, ensure row actually looks like an event
      if (isFallback && !eventKey.includes(":") && colMap.direction === -1) {
        continue;
      }
      if (eventKey.startsWith("data-ln-")) {
        continue;
      }

      events.push({
        event: eventKey,
        direction: colMap.direction !== -1 ? r[colMap.direction] : (r[1] || 'Emits'),
        cancelable: colMap.cancelable !== -1 ? r[colMap.cancelable] : (r[2] || 'No'),
        description: colMap.description !== -1 ? r[colMap.description] : (r[3] || ''),
        detail: colMap.detail !== -1 ? r[colMap.detail] : (r[4] || ''),
        provenance,
        sourceHeading: headingTitle
      });
    }
  }

  // 1. Check tables under matching ### subheadings
  for (const hIdx of subHeadings) {
    const title = headings[hIdx].title;
    const norm = normalizeTitle(title);

    const isCanonical = title === 'Events API';
    const isAcceptedSubheading = isCanonical || norm.includes('event');

    if (isAcceptedSubheading) {
      const start = headings[hIdx].lineIndex + 1;
      const end = Math.min(sectionEnd(headings, hIdx, lines), parentEnd);
      const table = findTableInRange(lines, start, end);
      if (table && table.rows.length) {
        const provenance = isCanonical ? 'canonical' : 'recovered';
        if (!isCanonical) {
          warnings.push(`nonCanonicalEventsHeading: "${title}"`);
        }
        extractFromEventsTable(table, provenance, title, false);
      }
    }
  }

  // 2. Fallback: if no events extracted, check for tables directly under ##
  if (events.length === 0) {
    const firstSubStart = subHeadings.length > 0 ? headings[subHeadings[0]].lineIndex : parentEnd;
    const directTables = findTablesInRange(lines, headings[parentIdx].lineIndex + 1, firstSubStart);
    for (const directTable of directTables) {
      extractFromEventsTable(directTable, 'recovered', headings[parentIdx].title, true);
    }
    if (events.length > 0) {
      warnings.push(`directSection3EventsTable: recovered events directly under "${headings[parentIdx].title}"`);
    }
  }

  return events;
}

/**
 * Extract relative markdown links (`./x.md`, `../folder/y.md#frag`) from the
 * document body, ignoring links inside fenced code blocks.
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
 * Extract table section directly under a heading.
 * @param {string[]} lines
 * @param {Array} headings
 * @param {string} title
 * @param {(row:string[]) => Object} rowMapper
 * @returns {Object[]}
 */
function extractTableSection(lines, headings, title, rowMapper) {
  const idx = headings.findIndex((h) => normalizeTitle(h.title) === normalizeTitle(title));
  if (idx === -1) return [];
  const start = headings[idx].lineIndex + 1;
  const end = sectionEnd(headings, idx, lines);
  const table = findTableInRange(lines, start, end);
  if (!table) return [];
  return table.rows.map(rowMapper);
}

const JS_API_SYNONYMS = {
  method: ['method', 'function', 'api', 'name'],
  parameters: ['parameters', 'params', 'arguments', 'args'],
  return: ['return', 'returns', 'type'],
  description: ['description', 'summary', 'details', 'purpose']
};

/**
 * Extract Programmatic JS API tables.
 * @param {string[]} lines
 * @param {Array} headings
 * @returns {Array<Object>}
 */
function extractJsApi(lines, headings) {
  const jsApi = [];
  for (let i = 0; i < headings.length; i++) {
    const title = headings[i].title;
    const norm = normalizeTitle(title);
    if (norm.includes('programmatic js api') || norm.includes('javascript api') || norm.startsWith('programmatic api')) {
      const start = headings[i].lineIndex + 1;
      const end = sectionEnd(headings, i, lines);
      const table = findTableInRange(lines, start, end);
      if (table && table.rows.length) {
        const colMap = resolveColumnIndices(table.columns, JS_API_SYNONYMS);
        for (const r of table.rows) {
          const rawMethod = colMap.method !== -1 ? r[colMap.method] : r[0];
          const methodKey = stripAllBackticks(rawMethod);
          if (!methodKey) continue;
          jsApi.push({
            method: methodKey,
            parameters: colMap.parameters !== -1 ? r[colMap.parameters] : (r[1] || ''),
            return: colMap.return !== -1 ? r[colMap.return] : (r[2] || ''),
            description: colMap.description !== -1 ? r[colMap.description] : (r[3] || '')
          });
        }
      }
    }
  }
  return jsApi;
}

/**
 * Parse a single ln-ashlar docs-mcp markdown document.
 * @param {string} markdown - raw markdown source (including frontmatter)
 * @param {Object} [meta] - optional caller metadata
 * @returns {Object} parsed document structure
 */
export function parseDoc(markdown, meta = {}) {
  const { data: frontmatter, body } = parseFrontmatter(markdown);
  const lines = body.split(/\r?\n/);
  const warnings = [];

  const headings = computeHeadings(lines, warnings);
  const sections = buildSections(lines, headings);

  const attributes = extractAttributes(lines, headings, warnings);
  const events = extractEvents(lines, headings, warnings);
  const jsApi = extractJsApi(lines, headings);

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
  const markup = extractMarkup(lines, headings, allowedLangs, warnings);
  const links = extractLinks(lines);

  return {
    frontmatter,
    body,
    sections,
    attributes,
    events,
    jsApi,
    markup,
    scssApi,
    includedComponents,
    links,
    warnings
  };
}

