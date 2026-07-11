// tools/ashlar/corpus.js
// Owns all ashlar-docs corpus state: loading, in-memory indexes and
// git-HEAD based change detection. Every tool handler awaits ensureIndex()
// before answering.

import fs from 'fs';
import path from 'path';
import Fuse from 'fuse.js';
import { parseDoc } from './parser.js';

const SUBFOLDERS = ['components', 'css', 'patterns', 'guides', 'doctrine'];

let cachedIndex = null;
let cachedRepoPath = null;
let cachedSignature = null;
let lastWarnedState = null;

/**
 * Read `process.env.ASHLAR_DOCS_REPO` lazily (never snapshotted at import time).
 * @returns {string|undefined}
 */
export function configuredRepo() {
  return process.env.ASHLAR_DOCS_REPO;
}

/**
 * Shared "not configured / not found" message text.
 * @param {string} [repoPath]
 * @returns {string}
 */
export function notConfiguredMessage(repoPath) {
  const p = repoPath ?? configuredRepo();
  return `ashlar-docs is not configured / corpus not found at ${p || '(ASHLAR_DOCS_REPO is unset)'}`;
}

/**
 * Log a console.warn once per distinct "not configured" reason, to avoid
 * spamming logs on every tool invocation.
 * @param {string} message
 */
function warnUnconfiguredOnce(message) {
  if (lastWarnedState === message) return;
  lastWarnedState = message;
  console.warn(message);
}

/**
 * Compute a lightweight signature of the repo's current git HEAD, without
 * spawning a git subprocess. Returns null when the signature cannot be
 * determined (e.g. no `.git` directory), which disables change detection —
 * the index is then built exactly once.
 * @param {string} repoPath
 * @returns {string|null}
 */
function gitSignature(repoPath) {
  try {
    const gitPath = path.join(repoPath, '.git');
    const stat = fs.statSync(gitPath);
    let gitDir;
    if (stat.isDirectory()) {
      gitDir = gitPath;
    } else {
      const content = fs.readFileSync(gitPath, 'utf8').trim();
      const m = content.match(/^gitdir:\s*(.+)$/);
      if (!m) return null;
      gitDir = path.isAbsolute(m[1]) ? m[1] : path.resolve(repoPath, m[1]);
    }

    const headContent = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const refMatch = headContent.match(/^ref:\s*(.+)$/);
    let sha = null;

    if (refMatch) {
      const refPath = refMatch[1].trim();
      const refFile = path.join(gitDir, refPath);
      if (fs.existsSync(refFile)) {
        sha = fs.readFileSync(refFile, 'utf8').trim();
      } else {
        const packedRefsPath = path.join(gitDir, 'packed-refs');
        if (fs.existsSync(packedRefsPath)) {
          const packed = fs.readFileSync(packedRefsPath, 'utf8');
          for (const line of packed.split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length === 2 && parts[1] === refPath) {
              sha = parts[0];
              break;
            }
          }
        }
      }
    } else {
      sha = headContent;
    }

    return `${headContent}::${sha ?? ''}`;
  } catch {
    return null;
  }
}

/**
 * Build the full in-memory index from a docs-mcp corpus rooted at
 * `<repoPath>/docs-mcp`. Pure-ish (only reads from disk); used directly by
 * tests against the fixture corpus.
 * @param {string} repoPath - path to a local ln-ashlar git clone (or fixture)
 * @returns {Object|null} the index object, or null if docs-mcp/ is missing
 */
export function buildIndex(repoPath) {
  const corpusRoot = path.join(repoPath, 'docs-mcp');
  if (!fs.existsSync(corpusRoot)) return null;

  const docs = new Map();
  const attributeIndex = new Map();
  const eventIndex = new Map();
  const markupIndex = new Map();
  const sectionUnits = [];

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

      const filePath = path.join(folderPath, entry);
      let raw;
      try {
        raw = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      const parsed = parseDoc(raw, { folder, filename: entry });
      const fm = parsed.frontmatter || {};
      const slug = entry.replace(/\.md$/, '');
      const name = fm.name || slug;
      const relPath = `${folder}/${entry}`;

      const docEntry = {
        name,
        classification: fm.classification ?? null,
        status: fm.status ?? null,
        summary: fm.summary ?? '',
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        source: fm.source ?? null,
        path: filePath,
        relPath,
        folder,
        raw,
        body: parsed.body,
        parsed
      };
      docs.set(name, docEntry);

      for (const attr of parsed.attributes) {
        const key = (attr.attribute || '').trim();
        if (!key) continue;
        if (!attributeIndex.has(key)) attributeIndex.set(key, []);
        attributeIndex.get(key).push({
          component: name,
          element: attr.element,
          typeValues: attr.typeValues,
          default: attr.default,
          description: attr.description
        });
      }

      for (const ev of parsed.events) {
        const key = (ev.event || '').trim();
        if (!key) continue;
        if (!eventIndex.has(key)) eventIndex.set(key, []);
        eventIndex.get(key).push({
          doc: name,
          direction: ev.direction,
          cancelable: ev.cancelable,
          detail: ev.detail,
          description: ev.description
        });
      }

      markupIndex.set(name, parsed.markup);

      for (const section of parsed.sections) {
        sectionUnits.push({ doc: name, heading: section.title, text: section.text });
      }
      sectionUnits.push({ doc: name, heading: '(summary)', text: docEntry.summary });
    }
  }

  const linkGraph = new Map();
  for (const name of docs.keys()) linkGraph.set(name, { outgoing: [], incoming: [] });

  const pathToName = new Map();
  for (const [name, d] of docs) pathToName.set(d.relPath, name);

  for (const [name, d] of docs) {
    for (const link of d.parsed.links) {
      const resolved = path.posix.normalize(path.posix.join(d.folder, link));
      const targetName = pathToName.get(resolved);
      if (targetName) {
        linkGraph.get(name).outgoing.push(targetName);
        if (!linkGraph.has(targetName)) linkGraph.set(targetName, { outgoing: [], incoming: [] });
        linkGraph.get(targetName).incoming.push(name);
      }
    }
  }

  const registry = Array.from(docs.values())
    .map((d) => ({
      name: d.name,
      classification: d.classification,
      status: d.status,
      summary: d.summary,
      tags: d.tags,
      folder: d.folder
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const fuse = new Fuse(sectionUnits, {
    keys: ['heading', 'text', 'doc'],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    minMatchCharLength: 2
  });

  return {
    head: gitSignature(repoPath),
    builtAt: Date.now(),
    docs,
    registry,
    attributeIndex,
    eventIndex,
    markupIndex,
    linkGraph,
    fuse,
    sectionUnits
  };
}

/**
 * Build the index on first call; on later calls, re-read the configured
 * clone's git HEAD signature and rebuild only if it changed.
 * @returns {Promise<Object|null>} the index, or null when unconfigured/missing
 */
export async function ensureIndex() {
  const repoPath = configuredRepo();

  if (!repoPath) {
    cachedIndex = null;
    cachedRepoPath = null;
    cachedSignature = null;
    warnUnconfiguredOnce(notConfiguredMessage(repoPath));
    return null;
  }

  const corpusRoot = path.join(repoPath, 'docs-mcp');
  if (!fs.existsSync(repoPath) || !fs.existsSync(corpusRoot)) {
    cachedIndex = null;
    cachedRepoPath = null;
    cachedSignature = null;
    warnUnconfiguredOnce(notConfiguredMessage(repoPath));
    return null;
  }

  const currentSignature = gitSignature(repoPath);

  if (cachedIndex && cachedRepoPath === repoPath && cachedSignature === currentSignature) {
    return cachedIndex;
  }

  const built = buildIndex(repoPath);
  cachedIndex = built;
  cachedRepoPath = repoPath;
  cachedSignature = currentSignature;
  return built;
}
