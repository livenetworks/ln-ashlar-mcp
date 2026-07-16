// tools/ashlar/validate.js
// Contract validation for the ln-ashlar docs-mcp corpus, across N federated
// roots. Used by the validate_docs tool and the CLI linter
// (tools/ashlar/lint-cli.js). This is the ONLY implementation of contract
// validation — the parser itself stays lenient.

import fs from 'fs';
import path from 'path';
import { parseDoc, parseTable } from './parser.js';

const NON_SKILL_FOLDERS = ['components', 'css', 'patterns', 'guides', 'doctrine'];
const SKILL_CONTEXTS = ['app', 'web', 'wordpress'];

const VALID_CLASSIFICATIONS = ['simple', 'coordinator', 'service', 'css', 'pattern', 'guide', 'doctrine', 'skill'];
const VALID_STATUSES = ['draft', 'stable'];
const VALID_DOMAINS = ['frontend', 'backend', 'process'];
const VALID_DIRECTIONS = ['Emits', 'Listens'];
const VALID_KINDS = ['mixin', 'class', 'token', 'attribute'];

const FOLDER_CLASSIFICATIONS = {
  components: ['simple', 'coordinator', 'service'],
  css: ['css'],
  patterns: ['pattern'],
  guides: ['guide'],
  doctrine: ['doctrine'],
  skills: ['skill']
};

const FIRST_SECTION_FOLDERS = ['guides', 'doctrine', 'skills'];

const ATTRIBUTE_COLUMNS = ['Attribute', 'Element', 'Type / Values', 'Default', 'Description'];
const EVENTS_COLUMNS = ['Event', 'Direction', 'Cancelable', 'Description', '`detail` Object'];
const SCSS_COLUMNS = ['Name', 'Kind', 'Parameters / Values', 'Description'];
const PATTERN_COLUMNS = ['Component', 'Role in the Pattern'];

/**
 * Compare a section's first table columns against an expected column list.
 * `sections` is the flat parsed.sections list (includes `##` and `###`
 * headings), so subheading titles like "Attributes Table" / "Events API"
 * resolve directly without needing to know their parent section.
 * @param {Array} sections - parsed.sections
 * @param {string} title - section title to find (leading "N. " stripped)
 * @param {string[]} expectedColumns
 * @param {string[]} problems - accumulator
 * @param {boolean} strictMissing - report a problem when the anchor heading exists but no table is found
 */
function checkTableColumns(sections, title, expectedColumns, problems, strictMissing) {
  const section = sections.find((s) => s.title === title);
  if (!section) return;

  const table = parseTable(section.text.split('\n'));
  if (!table.columns.length) {
    if (strictMissing) {
      problems.push(`Section "${title}" is missing its expected table`);
    }
    return;
  }

  const actual = table.columns.map((c) => c.trim());
  const expected = expectedColumns.map((c) => c.trim());
  const matches = actual.length === expected.length && actual.every((c, i) => c === expected[i]);
  if (!matches) {
    problems.push(
      `Table under "${title}" has unexpected columns: [${actual.join(', ')}] (expected [${expected.join(', ')}])`
    );
  }
}

/**
 * Validate a single root's docs-mcp corpus, returning one entry per
 * indexable file (empty `problems` = valid) plus a duplicate-name pass.
 * @param {string} rootPath
 * @param {number} rootIndex
 * @returns {{rootPath:string, rootLabel:string, files:Array<{file:string, problems:string[]}>}}
 */
function validateRoot(rootPath, rootIndex) {
  const rootLabel = path.basename(rootPath) || rootPath;
  const corpusRoot = path.join(rootPath, 'docs-mcp');

  if (!fs.existsSync(corpusRoot)) {
    return { rootPath, rootLabel, files: [] };
  }

  const files = [];
  const results = [];

  for (const folder of NON_SKILL_FOLDERS) {
    const folderPath = path.join(corpusRoot, folder);
    if (!fs.existsSync(folderPath)) continue;

    let entries;
    try {
      entries = fs.readdirSync(folderPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      if (entry.startsWith('_')) continue;
      if (entry === 'README.md') continue;
      files.push({ folder, entry, context: null, relPath: `${folder}/${entry}`, filePath: path.join(folderPath, entry) });
    }
  }

  // skills/ is the ONLY indexed folder read recursively — exactly one level
  // of context subfolders (app|web|wordpress). A file directly under
  // skills/, or a file inside an unknown subfolder name, is reported here as
  // a finding (never crashes, never enters `files` for further checks).
  const skillsPath = path.join(corpusRoot, 'skills');
  if (fs.existsSync(skillsPath)) {
    let skillsEntries;
    try {
      skillsEntries = fs.readdirSync(skillsPath);
    } catch {
      skillsEntries = [];
    }

    for (const sub of skillsEntries) {
      if (sub.startsWith('_') || sub === 'README.md') continue;

      const subPath = path.join(skillsPath, sub);
      let subStat;
      try {
        subStat = fs.statSync(subPath);
      } catch {
        continue;
      }

      if (!subStat.isDirectory()) {
        if (sub.endsWith('.md')) {
          results.push({
            file: `skills/${sub}`,
            problems: ['Skill file must live in a context subfolder: app|web|wordpress']
          });
        }
        continue;
      }

      let subEntries;
      try {
        subEntries = fs.readdirSync(subPath);
      } catch {
        continue;
      }

      const knownContext = SKILL_CONTEXTS.includes(sub);

      for (const entry of subEntries) {
        if (!entry.endsWith('.md')) continue;
        if (entry.startsWith('_')) continue;
        if (entry === 'README.md') continue;

        if (!knownContext) {
          results.push({
            file: `skills/${sub}/${entry}`,
            problems: [`Unknown skill context subfolder "${sub}"; expected one of app|web|wordpress`]
          });
          continue;
        }

        files.push({
          folder: 'skills',
          entry,
          context: sub,
          relPath: `skills/${sub}/${entry}`,
          filePath: path.join(subPath, entry)
        });
      }
    }
  }

  const nonSkillOccurrences = new Map(); // name -> [relPath, ...]
  const skillOccurrences = new Map(); // "<context>::<name>" -> [relPath, ...]

  for (const f of files) {
    const problems = [];

    let raw;
    try {
      raw = fs.readFileSync(f.filePath, 'utf8');
    } catch (e) {
      results.push({ file: f.relPath, problems: [`Failed to read file: ${e.message}`] });
      continue;
    }

    let parsed;
    try {
      parsed = parseDoc(raw, { folder: f.folder, filename: f.entry });
    } catch (e) {
      results.push({ file: f.relPath, problems: [`Failed to parse file: ${e.message}`] });
      continue;
    }

    const fm = parsed.frontmatter;
    const slug = f.entry.replace(/\.md$/, '');

    if (!fm) {
      // Rule 1: missing/broken frontmatter — single finding, skip further checks.
      results.push({ file: f.relPath, problems: ['Missing or unparseable frontmatter'] });
      continue;
    }

    for (const field of ['name', 'classification', 'status', 'summary']) {
      if (fm[field] === undefined || fm[field] === null || fm[field] === '') {
        problems.push(`Missing required frontmatter field: "${field}"`);
      }
    }

    if (fm.classification !== undefined && fm.classification !== null && !VALID_CLASSIFICATIONS.includes(fm.classification)) {
      problems.push(`Invalid classification "${fm.classification}"; expected one of ${VALID_CLASSIFICATIONS.join('|')}`);
    }

    if (fm.status !== undefined && fm.status !== null && !VALID_STATUSES.includes(fm.status)) {
      problems.push(`Invalid status "${fm.status}"; expected one of ${VALID_STATUSES.join('|')}`);
    }

    if (fm.domain !== undefined && fm.domain !== null && !VALID_DOMAINS.includes(fm.domain)) {
      problems.push(`Invalid domain "${fm.domain}"; expected one of ${VALID_DOMAINS.join('|')}`);
    }

    if (fm.context !== undefined && fm.context !== null && fm.context !== '') {
      problems.push('`context` is not a frontmatter key; for skills it derives from the subfolder');
    }

    if (typeof fm.summary === 'string' && fm.summary.trim() === '') {
      problems.push('"summary" must be non-empty');
    }

    if (fm.name && fm.name !== slug) {
      problems.push(`Slug mismatch: frontmatter name "${fm.name}" does not match filename "${slug}"`);
    }

    const allowedClassifications = FOLDER_CLASSIFICATIONS[f.folder] || [];
    if (fm.classification && !allowedClassifications.includes(fm.classification)) {
      problems.push(
        `Classification "${fm.classification}" does not match folder "${f.folder}" (expected one of ${allowedClassifications.join('|')})`
      );
    }

    const topLevelSections = parsed.sections.filter((s) => s.level === 2);

    if (f.folder === 'components') {
      const numbers = topLevelSections.map((s) => s.number);
      const expectedNumbers = [1, 2, 3, 4, 5, 6, 7];
      const isExact = numbers.length === 7 && numbers.every((n, i) => n === expectedNumbers[i]);
      if (!isExact) {
        problems.push(
          `Expected exactly 7 top-level "## N." sections numbered 1..7 in ascending order, found: [${numbers.join(', ')}]`
        );
      }

      const sec2 = topLevelSections.find((s) => s.number === 2);
      if (sec2 && sec2.rawTitle !== '2. Minimal HTML Markup & Usage Variants') {
        problems.push(`Section 2 heading must be exactly "2. Minimal HTML Markup & Usage Variants", found "${sec2.rawTitle}"`);
      }

      const sec3 = topLevelSections.find((s) => s.number === 3);
      if (sec3 && sec3.rawTitle !== '3. Declarative API Contract (Attributes & Events)') {
        problems.push(`Section 3 heading must be exactly "3. Declarative API Contract (Attributes & Events)", found "${sec3.rawTitle}"`);
      }

      checkTableColumns(parsed.sections, 'Attributes Table', ATTRIBUTE_COLUMNS, problems, true);
      checkTableColumns(parsed.sections, 'Events API', EVENTS_COLUMNS, problems, true);

      if (sec2 && (fm.classification === 'simple' || fm.classification === 'coordinator')) {
        const hasHtml =
          Boolean(parsed.markup.base && parsed.markup.base.lang === 'html') ||
          parsed.markup.variants.some((v) => v.lang === 'html' && v.code);
        if (!hasHtml) {
          problems.push(`Section 2 must contain at least one \`\`\`html block (required for classification ${fm.classification})`);
        }
      }
    } else if (f.folder === 'css') {
      const hasScss = parsed.sections.some((s) => s.title === 'SCSS API (Mixins, Classes & Tokens)');
      if (!hasScss) problems.push('Missing required "## 3. SCSS API (Mixins, Classes & Tokens)" section');
      checkTableColumns(parsed.sections, 'SCSS API (Mixins, Classes & Tokens)', SCSS_COLUMNS, problems, false);
    } else if (f.folder === 'patterns') {
      const hasMarkup = parsed.sections.some((s) => s.title === 'Complete HTML Markup');
      const hasIncluded = parsed.sections.some((s) => s.title === 'Included Components');
      if (!hasMarkup) problems.push('Missing required "## 2. Complete HTML Markup" section');
      if (!hasIncluded) problems.push('Missing required "## 3. Included Components" section');
      checkTableColumns(parsed.sections, 'Included Components', PATTERN_COLUMNS, problems, false);
    } else if (FIRST_SECTION_FOLDERS.includes(f.folder)) {
      if (!topLevelSections.length || topLevelSections[0].title !== 'Summary') {
        problems.push('Expected "## Summary" as the first top-level section');
      }
    }

    if (f.folder === 'skills') {
      if (fm.source !== undefined && fm.source !== null && fm.source !== '') {
        problems.push('`source` is not supported for skills (standalone, no code source)');
      }

      for (const link of parsed.links) {
        if (!/^\.\/[^/]+\.md$/.test(link)) {
          problems.push(
            `Skill link "${link}" is invalid; skills may only link to sibling skills in the same context subfolder ("./name.md")`
          );
        }
      }
    }

    for (const ev of parsed.events) {
      if (ev.direction && !VALID_DIRECTIONS.includes(ev.direction)) {
        problems.push(`Event "${ev.event}" has invalid Direction "${ev.direction}"; expected one of ${VALID_DIRECTIONS.join('|')}`);
      }
    }

    for (const s of parsed.scssApi) {
      if (s.kind && !VALID_KINDS.includes(s.kind)) {
        problems.push(`SCSS API entry "${s.name}" has invalid Kind "${s.kind}"; expected one of ${VALID_KINDS.join('|')}`);
      }
    }

    // Rule 8: dangling relative links are valid planned docs — no finding.
    // Rule 9 (duplicate name within a root) is applied in a second pass below.
    // Skills are unique per (context); non-skills are unique as before — a
    // skill and a non-skill sharing a name is legal (separate namespaces).
    const effectiveName = fm.name || slug;
    if (f.folder === 'skills') {
      const dedupeKey = `${f.context}::${effectiveName}`;
      if (!skillOccurrences.has(dedupeKey)) skillOccurrences.set(dedupeKey, []);
      skillOccurrences.get(dedupeKey).push(f.relPath);
    } else {
      if (!nonSkillOccurrences.has(effectiveName)) nonSkillOccurrences.set(effectiveName, []);
      nonSkillOccurrences.get(effectiveName).push(f.relPath);
    }

    results.push({ file: f.relPath, problems });
  }

  for (const [name, relPaths] of nonSkillOccurrences) {
    if (relPaths.length <= 1) continue;
    for (const relPath of relPaths) {
      const entry = results.find((r) => r.file === relPath);
      if (!entry) continue;
      const others = relPaths.filter((p) => p !== relPath);
      entry.problems.push(`Duplicate name "${name}" within this root, also used by: ${others.join(', ')}`);
    }
  }

  for (const [dedupeKey, relPaths] of skillOccurrences) {
    if (relPaths.length <= 1) continue;
    const name = dedupeKey.slice(dedupeKey.indexOf('::') + 2);
    for (const relPath of relPaths) {
      const entry = results.find((r) => r.file === relPath);
      if (!entry) continue;
      const others = relPaths.filter((p) => p !== relPath);
      entry.problems.push(`Duplicate name "${name}" within this root's skill context, also used by: ${others.join(', ')}`);
    }
  }

  return { rootPath, rootLabel, files: results };
}

/**
 * Validate every configured root's docs-mcp corpus.
 * @param {string[]} rootPaths
 * @returns {Array<{rootPath:string, rootLabel:string, files:Array<{file:string, problems:string[]}>}>}
 */
export function validateCorpus(rootPaths) {
  return (rootPaths || []).map((rootPath, rootIndex) => validateRoot(rootPath, rootIndex));
}
