// tools/ashlar/validate.js
// Contract validation for the ln-ashlar docs-mcp corpus. Used only by the
// validate_docs tool — the parser itself stays lenient.

import fs from 'fs';
import path from 'path';
import { parseDoc, parseTable } from './parser.js';

const SUBFOLDERS = ['components', 'css', 'patterns', 'guides', 'doctrine'];

const VALID_CLASSIFICATIONS = ['simple', 'coordinator', 'service', 'css', 'pattern', 'guide', 'doctrine'];
const VALID_STATUSES = ['draft', 'stable'];

const FOLDER_CLASSIFICATIONS = {
  components: ['simple', 'coordinator', 'service'],
  css: ['css'],
  patterns: ['pattern'],
  guides: ['guide'],
  doctrine: ['doctrine']
};

const ATTRIBUTE_COLUMNS = ['Атрибут', 'Елемент', 'Тип / Вредности', 'Стандардна вредност', 'Опис'];
const EVENTS_COLUMNS = ['Настан', 'Насока', 'Cancelable', 'Опис', 'detail Објект'];
const SCSS_COLUMNS = ['Име', 'Вид', 'Параметри / Вредности', 'Опис'];
const PATTERN_COLUMNS = ['Компонента', 'Улога во патернот'];

/**
 * Compare a section's first table columns against an expected column list.
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
 * Validate the entire docs-mcp corpus rooted at `<repoPath>/docs-mcp`.
 * @param {string} repoPath
 * @returns {Array<{file:string, problems:string[]}>} one entry per indexed file
 */
export function validateCorpus(repoPath) {
  const corpusRoot = path.join(repoPath, 'docs-mcp');
  const results = [];
  if (!fs.existsSync(corpusRoot)) return results;

  const files = [];
  for (const folder of SUBFOLDERS) {
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
      files.push({ folder, entry, relPath: `${folder}/${entry}`, filePath: path.join(folderPath, entry) });
    }
  }

  const knownPaths = new Set(files.map((f) => f.relPath));

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
      problems.push('Missing frontmatter block');
    } else {
      for (const field of ['name', 'classification', 'status', 'summary', 'tags']) {
        if (fm[field] === undefined || fm[field] === null || fm[field] === '') {
          problems.push(`Missing required frontmatter field: "${field}"`);
        }
      }

      if (fm.classification !== undefined && fm.classification !== null && !VALID_CLASSIFICATIONS.includes(fm.classification)) {
        problems.push(
          `Invalid classification "${fm.classification}"; expected one of ${VALID_CLASSIFICATIONS.join('|')}`
        );
      }

      if (fm.status !== undefined && fm.status !== null && !VALID_STATUSES.includes(fm.status)) {
        problems.push(`Invalid status "${fm.status}"; expected one of ${VALID_STATUSES.join('|')}`);
      }

      if (fm.tags !== undefined && fm.tags !== null && !Array.isArray(fm.tags)) {
        problems.push('"tags" must be a list');
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
      if (sec2 && sec2.rawTitle !== '2. Минимален HTML Маркап и Варијанти на Употреба') {
        problems.push(
          `Section 2 heading must be exactly "2. Минимален HTML Маркап и Варијанти на Употреба", found "${sec2.rawTitle}"`
        );
      }

      const sec3 = topLevelSections.find((s) => s.number === 3);
      if (sec3 && sec3.rawTitle !== '3. Декларативен API Договор (Атрибути и Настани)') {
        problems.push(
          `Section 3 heading must be exactly "3. Декларативен API Договор (Атрибути и Настани)", found "${sec3.rawTitle}"`
        );
      }

      checkTableColumns(parsed.sections, 'Табела со Атрибути', ATTRIBUTE_COLUMNS, problems, true);
      checkTableColumns(parsed.sections, 'Настани (Events API)', EVENTS_COLUMNS, problems, true);

      if (sec2 && (fm && (fm.classification === 'simple' || fm.classification === 'coordinator'))) {
        const hasHtml = Boolean(parsed.markup.base && parsed.markup.base.lang === 'html') ||
          parsed.markup.variants.some((v) => v.lang === 'html' && v.code);
        if (!hasHtml) {
          problems.push(
            `Section 2 must contain at least one \`\`\`html block (required for classification ${fm.classification})`
          );
        }
      }
    } else if (f.folder === 'css') {
      const hasScss = parsed.sections.some((s) => s.title === 'SCSS API (Миксини, Класи и Токени)');
      if (!hasScss) problems.push('Missing required "## 3. SCSS API (Миксини, Класи и Токени)" section');
      checkTableColumns(parsed.sections, 'SCSS API (Миксини, Класи и Токени)', SCSS_COLUMNS, problems, false);
    } else if (f.folder === 'patterns') {
      const hasMarkup = parsed.sections.some((s) => s.title === 'Комплетен HTML Маркап');
      const hasIncluded = parsed.sections.some((s) => s.title === 'Вклучени Компоненти');
      if (!hasMarkup) problems.push('Missing required "## 2. Комплетен HTML Маркап" section');
      if (!hasIncluded) problems.push('Missing required "## 3. Вклучени Компоненти" section');
      checkTableColumns(parsed.sections, 'Вклучени Компоненти', PATTERN_COLUMNS, problems, false);
    }

    for (const link of parsed.links) {
      const resolved = path.posix.normalize(path.posix.join(f.folder, link));
      if (!knownPaths.has(resolved)) {
        problems.push(`Broken link: "${link}" does not resolve to a file in the corpus`);
      }
    }

    results.push({ file: f.relPath, problems });
  }

  return results;
}
