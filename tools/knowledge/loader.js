// tools/knowledge/loader.js
// Legacy whole-repo markdown index: walks every configured corpus root and
// collects ALL .md files, including the internals layer (js/ln-*/README.md,
// docs/architecture/) that the ashlar corpus deliberately does not index.
// Root resolution is shared with tools/ashlar/corpus.js — one env knob.
import fs from 'fs';
import path from 'path';
import { configuredRoots } from '../ashlar/corpus.js';

// A root may be a live working checkout, not a docs-only clone.
const SKIP_DIRS = new Set(['node_modules', '.git']);

function walk(dir, root, label, docs) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable/missing dir contributes no docs, never throws
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(fullPath, root, label, docs);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      let content;
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }
      const rel = path.relative(root, fullPath).split(path.sep).join('/');
      docs.push({ filePath: `${label}/${rel}`, content });
    }
  }
}

/**
 * Collect all markdown files under every configured corpus root.
 * `filePath` is prefixed with the root's label so results stay unambiguous
 * across roots; knowledge_read accepts that same prefixed form.
 * @returns {Array<{filePath:string, content:string}>} empty when unconfigured
 */
export function loadDocs() {
  const roots = configuredRoots().map((r) => path.resolve(r));
  const docs = [];

  for (const root of roots) {
    walk(root, root, path.basename(root) || root, docs);
  }

  console.log(
    `[knowledge] Loaded ${docs.length} markdown documents from ${roots.length} root(s): ${roots.join(', ') || '(none configured)'}`
  );
  return docs;
}

// Initial load
export let docs = loadDocs();

/**
 * Reload docs – useful when files change at runtime.
 */
export function reloadDocs() {
  docs = loadDocs();
}
