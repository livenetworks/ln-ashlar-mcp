// tools/knowledge/search.js
import Fuse from 'fuse.js';
import { docs, reloadDocs } from './loader.js';

let fuse;

/**
 * (Re)build the Fuse fuzzy-search index from the given docs array.
 */
function buildIndex(docsList) {
  fuse = new Fuse(
    docsList.map((d) => ({
      filePath: d.filePath,
      content: d.content,
    })),
    {
      keys: ['content', 'filePath'],
      includeScore: true,
      threshold: 0.3,
      ignoreLocation: true,
    }
  );
}

// Build a Fuse index on start-up
buildIndex(docs);

/**
 * Reload the markdown documents from disk and rebuild the Fuse index.
 * @returns {number} number of documents indexed after the reload
 */
export function rebuildIndex() {
  reloadDocs();
  // `docs` is a live ES module binding: after reloadDocs() reassigns it in
  // loader.js, referencing it here again yields the freshly loaded array.
  buildIndex(docs);
  return docs.length;
}

/**
 * Number of markdown documents currently indexed. Zero means no corpus root
 * is configured or none was readable — callers surface that as such instead
 * of reporting an empty result set.
 * @returns {number}
 */
export function docCount() {
  return docs.length;
}

/**
 * Perform a fuzzy search over the markdown documentation.
 * @param {string} query – search term
 * @param {number} [limit=10] – maximum results to return
 * @returns {Array<{filePath:string, snippet:string, score:number}>}
 */
export function search(query, limit = 10) {
  const raw = fuse.search(query, { limit });
  return raw.map((r) => ({
    filePath: r.item.filePath,
    // Return first 1000 characters and preserve newlines for readability of code blocks and tables
    snippet: r.item.content.slice(0, 1000),
    score: r.score,
  }));
}
