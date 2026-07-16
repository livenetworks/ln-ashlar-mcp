// tools/ashlar/corpus.js
// Owns all ashlar-docs corpus state across N federated corpus roots: loading,
// in-memory indexes and per-root git-HEAD based change detection. Every tool
// handler awaits ensureIndex() before answering.
//
// See tools/ashlar/README.md "Decisions" for the collision-policy rationale.

import fs from 'fs';
import path from 'path';
import Fuse from 'fuse.js';
import { parseDoc } from './parser.js';

const NON_SKILL_FOLDERS = ['components', 'css', 'patterns', 'guides', 'doctrine'];
const SKILL_CONTEXTS = ['app', 'web', 'wordpress'];

let cachedIndex = null;
let cachedRootsKey = null;
let cachedSignature = null;
let lastWarnedState = null;

/**
 * Resolve the configured corpus roots (REPO ROOT paths, not the `docs-mcp`
 * subdir). Reads env lazily on every call — never snapshotted at import
 * time, so tests can set it before triggering a build.
 * `DOCS_CORPUS_ROOTS` (comma-separated) wins; falls back to the legacy
 * single-root `ASHLAR_DOCS_REPO`. Neither set → empty array.
 * @returns {string[]}
 */
export function configuredRoots() {
  const multi = process.env.DOCS_CORPUS_ROOTS;
  if (multi && multi.trim()) {
    return multi
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  const legacy = process.env.ASHLAR_DOCS_REPO;
  if (legacy && legacy.trim()) return [legacy.trim()];
  return [];
}

/**
 * Shared "not configured / not found" message text.
 * @param {string[]} [roots]
 * @returns {string}
 */
export function notConfiguredMessage(roots) {
  const list = roots ?? configuredRoots();
  if (!list.length) {
    return 'ashlar-docs is not configured: set DOCS_CORPUS_ROOTS (comma-separated repo roots) or the legacy ASHLAR_DOCS_REPO.';
  }
  return `ashlar-docs: no readable docs-mcp/ corpus found at configured root(s): ${list.join(', ')}`;
}

/**
 * Log a console.warn once per distinct message, to avoid spamming logs on
 * every tool invocation / index rebuild.
 * @param {string} message
 */
function warnOnce(message) {
  if (lastWarnedState === message) return;
  lastWarnedState = message;
  console.warn(message);
}

/**
 * Compute a lightweight signature of a repo root's current git HEAD, without
 * spawning a git subprocess. Returns null when the signature cannot be
 * determined (e.g. no `.git` directory), which disables change detection for
 * that root.
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
 * Combined signature across all configured roots (ordered join). Used to
 * decide whether to rebuild the in-memory index.
 * @param {string[]} rootPaths
 * @returns {string}
 */
function combinedSignature(rootPaths) {
  return rootPaths.map((r) => `${r}::${gitSignature(r) ?? 'null'}`).join('|');
}

function readDirSafe(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

/**
 * Build the full in-memory index across N corpus roots. Pure-ish (only reads
 * from disk); used directly by tests against fixture root(s).
 * @param {string[]} rootPaths - repo root paths (fixture or real clones)
 * @returns {Object} the index object (never null — an empty/unreadable root
 *   simply contributes no docs; callers decide "not configured" from an
 *   empty `rootPaths` array before calling this)
 */
export function buildIndex(rootPaths) {
  const roots = (rootPaths || []).filter(Boolean);

  const docs = new Map(); // compositeKey "<rootIndex>:<name>" -> docEntry
  const byName = new Map(); // name -> [compositeKey, ...]
  const attributeIndex = new Map();
  const eventIndex = new Map();
  const markupIndex = new Map(); // compositeKey -> markup
  const sectionUnits = [];
  const rootMeta = [];

  roots.forEach((rootPath, rootIndex) => {
    const corpusRoot = path.join(rootPath, 'docs-mcp');
    const rootLabel = path.basename(rootPath) || rootPath;

    if (!fs.existsSync(corpusRoot)) {
      warnOnce(`ashlar-docs: root not readable, skipped: ${rootPath}`);
      rootMeta.push({ index: rootIndex, path: rootPath, label: rootLabel, ok: false, signature: null });
      return;
    }

    const nonSkillNames = new Set(); // non-skill docs: unique by name within the root
    const skillNamesByContext = new Map(); // skills: unique by name PER context within the root

    // Index a single file. `context` is null for the five non-recursive
    // folders, or the derived context ('app'|'web'|'wordpress') for skills.
    function indexFile({ folder, entry, filePath, context, relPath, dedupeSet }) {
      let raw;
      try {
        raw = fs.readFileSync(filePath, 'utf8');
      } catch {
        return;
      }

      const parsed = parseDoc(raw, { folder, filename: entry });
      const fm = parsed.frontmatter;
      const slug = entry.replace(/\.md$/, '');

      if (!fm) {
        warnOnce(`ashlar-docs: skipping "${rootLabel}/docs-mcp/${relPath}" — missing or unparseable frontmatter`);
        return;
      }

      const name = fm.name || slug;

      if (dedupeSet.has(name)) {
        warnOnce(`ashlar-docs: duplicate name "${name}" within root "${rootLabel}" — keeping the first, ignoring "${relPath}" for indexing`);
        return;
      }
      dedupeSet.add(name);

      // For skills the folder-derived context wins unconditionally, even if a
      // (now-forbidden) `context:` frontmatter key is present — validate.js
      // reports that as a finding, but indexing never trusts it.
      const key = context ? `${rootIndex}:${name}:${context}` : `${rootIndex}:${name}`;
      const domain = fm.domain || 'frontend';

      const docEntry = {
        key,
        name,
        rootIndex,
        rootPath,
        rootLabel,
        classification: fm.classification ?? null,
        status: fm.status ?? null,
        domain,
        context: context ?? null,
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
      docs.set(key, docEntry);
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(key);

      for (const attr of parsed.attributes) {
        const k = (attr.attribute || '').trim();
        if (!k) continue;
        if (!attributeIndex.has(k)) attributeIndex.set(k, []);
        attributeIndex.get(k).push({
          component: name,
          key,
          domain,
          context: docEntry.context,
          rootLabel,
          element: attr.element,
          typeValues: attr.typeValues,
          default: attr.default,
          description: attr.description
        });
      }

      for (const ev of parsed.events) {
        const k = (ev.event || '').trim();
        if (!k) continue;
        if (!eventIndex.has(k)) eventIndex.set(k, []);
        eventIndex.get(k).push({
          doc: name,
          key,
          domain,
          context: docEntry.context,
          rootLabel,
          direction: ev.direction,
          cancelable: ev.cancelable,
          detail: ev.detail,
          description: ev.description
        });
      }

      markupIndex.set(key, parsed.markup);

      for (const section of parsed.sections) {
        sectionUnits.push({ key, doc: name, heading: section.title, text: section.text });
      }
      sectionUnits.push({ key, doc: name, heading: '(summary)', text: docEntry.summary });
    }

    for (const folder of NON_SKILL_FOLDERS) {
      const folderPath = path.join(corpusRoot, folder);
      if (!fs.existsSync(folderPath)) continue;

      for (const entry of readDirSafe(folderPath)) {
        if (!entry.endsWith('.md')) continue;
        if (entry.startsWith('_')) continue;
        if (entry === 'README.md') continue;

        indexFile({
          folder,
          entry,
          filePath: path.join(folderPath, entry),
          context: null,
          relPath: `${folder}/${entry}`,
          dedupeSet: nonSkillNames
        });
      }
    }

    // skills/ is the ONLY indexed folder read recursively — exactly one level
    // of context subfolders. A file directly under skills/, or a file inside
    // an unknown subfolder name, is skipped from the index without crashing;
    // validate.js/lint-cli.js surface those as findings.
    const skillsPath = path.join(corpusRoot, 'skills');
    if (fs.existsSync(skillsPath)) {
      for (const sub of readDirSafe(skillsPath)) {
        if (sub.startsWith('_') || sub === 'README.md') continue;

        const subPath = path.join(skillsPath, sub);
        let subStat;
        try {
          subStat = fs.statSync(subPath);
        } catch {
          continue;
        }
        if (!subStat.isDirectory()) continue;
        if (!SKILL_CONTEXTS.includes(sub)) continue;

        const context = sub;
        if (!skillNamesByContext.has(context)) skillNamesByContext.set(context, new Set());
        const dedupeSet = skillNamesByContext.get(context);

        for (const entry of readDirSafe(subPath)) {
          if (!entry.endsWith('.md')) continue;
          if (entry.startsWith('_')) continue;
          if (entry === 'README.md') continue;

          indexFile({
            folder: 'skills',
            entry,
            filePath: path.join(subPath, entry),
            context,
            relPath: `skills/${context}/${entry}`,
            dedupeSet
          });
        }
      }
    }

    rootMeta.push({ index: rootIndex, path: rootPath, label: rootLabel, ok: true, signature: gitSignature(rootPath) });
  });

  // Link graph is built per root — relative links never cross roots.
  const linkGraph = new Map();
  for (const key of docs.keys()) linkGraph.set(key, { outgoing: [], incoming: [] });

  const pathToKeyPerRoot = new Map(); // rootIndex -> Map(relPath -> key)
  for (const [key, d] of docs) {
    if (!pathToKeyPerRoot.has(d.rootIndex)) pathToKeyPerRoot.set(d.rootIndex, new Map());
    pathToKeyPerRoot.get(d.rootIndex).set(d.relPath, key);
  }

  for (const [key, d] of docs) {
    for (const link of d.parsed.links) {
      const resolved = path.posix.normalize(path.posix.join(d.folder, link));
      const targetKey = pathToKeyPerRoot.get(d.rootIndex)?.get(resolved);
      if (targetKey) {
        const targetDoc = docs.get(targetKey);
        linkGraph.get(key).outgoing.push({ key: targetKey, name: targetDoc.name, rootLabel: targetDoc.rootLabel, planned: false });
        linkGraph.get(targetKey).incoming.push({ key, name: d.name, rootLabel: d.rootLabel, planned: false });
      } else {
        // Dangling relative link to a not-yet-authored doc: valid, planned.
        const guessedName = path.posix.basename(resolved).replace(/\.md$/, '');
        linkGraph.get(key).outgoing.push({ key: null, name: guessedName, rootLabel: d.rootLabel, planned: true });
      }
    }
  }

  const registry = Array.from(docs.values())
    .map((d) => ({
      key: d.key,
      name: d.name,
      classification: d.classification,
      status: d.status,
      domain: d.domain,
      context: d.context,
      summary: d.summary,
      tags: d.tags,
      folder: d.folder,
      rootIndex: d.rootIndex,
      rootLabel: d.rootLabel
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.rootIndex - b.rootIndex);

  const fuse = new Fuse(sectionUnits, {
    keys: ['heading', 'text', 'doc'],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    minMatchCharLength: 2
  });

  return {
    roots: rootMeta,
    builtAt: Date.now(),
    docs,
    byName,
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
 * Build the index on first call; on later calls, re-read every configured
 * root's git HEAD signature and rebuild only if the combined signature
 * changed.
 * @returns {Promise<Object|null>} the index, or null when unconfigured/no root readable
 */
export async function ensureIndex() {
  const roots = configuredRoots();

  if (!roots.length) {
    cachedIndex = null;
    cachedRootsKey = null;
    cachedSignature = null;
    warnOnce(notConfiguredMessage(roots));
    return null;
  }

  const anyReadable = roots.some((r) => fs.existsSync(path.join(r, 'docs-mcp')));
  if (!anyReadable) {
    cachedIndex = null;
    cachedRootsKey = null;
    cachedSignature = null;
    warnOnce(notConfiguredMessage(roots));
    return null;
  }

  const rootsKey = roots.join('|');
  const currentSignature = combinedSignature(roots);

  if (cachedIndex && cachedRootsKey === rootsKey && cachedSignature === currentSignature) {
    return cachedIndex;
  }

  const built = buildIndex(roots);
  cachedIndex = built;
  cachedRootsKey = rootsKey;
  cachedSignature = currentSignature;
  return built;
}
