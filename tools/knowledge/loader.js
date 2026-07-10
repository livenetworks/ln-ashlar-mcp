// tools/knowledge/loader.js
import fs from 'fs';
import path from 'path';

// Base directory where the markdown docs are stored
const DOCS_ROOT = path.resolve(import.meta.dirname, '../../resources/ln-ashlar');

/**
 * Recursively collect all markdown files under DOCS_ROOT.
 * Returns an array of objects: { filePath, content }.
 */
export function loadDocs() {
  const docs = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        docs.push({
          filePath: path.relative(DOCS_ROOT, fullPath),
          content,
        });
      }
    }
  }
  walk(DOCS_ROOT);
  console.log(`[knowledge] Loaded ${docs.length} markdown documents from ${DOCS_ROOT}`);
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
