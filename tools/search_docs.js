import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";
import { semanticSearch, getRagState } from "./ashlar/rag/search.js";
import { loadCache } from "./ashlar/rag/store.js";

export const name = "search_docs";

export const definition = {
  title: "Search Docs",
  description:
    ROUTER_FIRST_HINT +
    "Full-text hybrid search over every section of the indexed ln-ashlar docs-mcp corpus " +
    "(components, css, patterns, guides, doctrine, skills — across all configured corpus " +
    "roots). Returns matching sections as '- **<doc>** › <heading>: <snippet>' lines with the " +
    "doc's summary. 'context' (app | web | wordpress, default 'app') filters skills ONLY — " +
    "skills carry exactly one context (derived from their subfolder, never mixed in one " +
    "response); every other document is context-neutral and always eligible. Optional " +
    "filters: classification, domain, status, tags.",
  inputSchema: {
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Maximum number of results to return (default 10)"),
    classification: z
      .enum(["simple", "coordinator", "service", "css", "pattern", "guide", "doctrine", "skill"])
      .optional()
      .describe("Filter to a single classification"),
    domain: z
      .enum(["frontend", "backend", "process"])
      .optional()
      .describe("Filter to a single domain"),
    context: z
      .enum(["app", "web", "wordpress"])
      .optional()
      .describe(
        "Filter to a single context; defaults to 'app'. Applies to skills only — context-neutral docs always pass."
      ),
    status: z.enum(["draft", "stable"]).optional().describe("Filter to a single status"),
    tags: z.array(z.string()).optional().describe("Filter to docs matching any of these tags")
  }
};

function makeDocFilter({ classification, domain, context, status, tags }) {
  const effectiveContext = context || "app";
  return (doc) => {
    if (!doc) return false;
    if (doc.folder === "skills" && doc.context !== effectiveContext) return false;
    if (classification && doc.classification !== classification) return false;
    if (domain && doc.domain !== domain) return false;
    if (status && doc.status !== status) return false;
    if (tags && tags.length && !(doc.tags ?? []).some((t) => tags.includes(t))) return false;
    return true;
  };
}

let lastCacheEpoch = null;
let sectionToChunks = new Map();

function getSectionChunks(epoch, docKey, sectionIdx) {
  if (epoch !== lastCacheEpoch) {
    const cache = loadCache(epoch);
    sectionToChunks.clear();
    if (cache) {
      for (const m of cache.metadata) {
        const secKey = `${m.docKey}:${m.sectionIdx}`;
        let arr = sectionToChunks.get(secKey);
        if (!arr) {
          arr = [];
          sectionToChunks.set(secKey, arr);
        }
        arr.push(m.chunkId);
      }
      lastCacheEpoch = epoch;
    }
  }
  const secKey = `${docKey}:${sectionIdx}`;
  return sectionToChunks.get(secKey) || [`${docKey}#${sectionIdx.toString().padStart(4, '0')}#0000`];
}

export const handler = async ({ query, limit, classification, domain, context, status, tags }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const max = limit ?? 10;
  const filter = makeDocFilter({ classification, domain, context, status, tags });
  
  // Exact old fallback logic if RAG is off
  if (getRagState() !== 'ready') {
    const fallbackResults = index.fuse.search(query).filter(r => filter(index.docs.get(r.item.key))).slice(0, max);
    if (fallbackResults.length === 0) {
      const effectiveContext = context || "app";
      return { content: [{ type: "text", text: `No results for query "${query}" (context: ${effectiveContext}).` }] };
    }
    const lines = fallbackResults.map((r) => {
      const doc = index.docs.get(r.item.key);
      const text = (r.item.text || "").trim();
      const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
      return `- **${doc.name}** › ${r.item.heading}: ${snippet.replace(/\n+/g, " ")} (summary: ${doc.summary})`;
    });
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  // Lexical
  const lexicalRaw = index.fuse.search(query).filter(r => filter(index.docs.get(r.item.key)));
  
  const allowedDocKeys = new Set();
  for (const [key, doc] of index.docs.entries()) {
    if (filter(doc)) allowedDocKeys.add(key);
  }
  
  // Semantic
  const semanticRaw = await semanticSearch(query, index.indexEpoch, allowedDocKeys) || [];
  const semanticFiltered = semanticRaw; // already pre-filtered
  
  // RRF
  const rrfMap = new Map(); // chunkId -> { score, item }
  
  const ensureRrfItem = (chunkId, docKey, sectionIdx, text, heading) => {
    if (!rrfMap.has(chunkId)) {
      rrfMap.set(chunkId, { chunkId, docKey, sectionIdx, text, heading, rrf: 0 });
    }
    return rrfMap.get(chunkId);
  };
  
  // Stage 0: Exact match bonus
  const exactDocs = [
    ...(index.attributeIndex.get(query) || []),
    ...(index.eventIndex.get(query) || []),
    ...(index.apiIndex.get(query) || [])
  ];
  
  exactDocs.forEach(match => {
    const doc = index.docs.get(match.key);
    if (doc && filter(doc)) {
      const sectionIdx = 0;
      const unit = index.sectionUnitsMap.get(`${match.key}:${sectionIdx}`);
      if (unit) {
        const chunks = getSectionChunks(index.indexEpoch, match.key, sectionIdx);
        chunks.forEach(chunkId => {
          const item = ensureRrfItem(chunkId, match.key, sectionIdx, unit.text, unit.heading);
          item.rrf += 100; // prepends to hybrid list
        });
      }
    }
  });
  
  semanticFiltered.forEach((r, idx) => {
    const rank = idx + 1;
    const unit = index.sectionUnitsMap.get(`${r.docKey}:${r.sectionIdx}`);
    if (unit) {
      const item = ensureRrfItem(r.chunkId, r.docKey, r.sectionIdx, unit.text, unit.heading);
      item.rrf += 1 / (60 + rank);
    }
  });
  
  lexicalRaw.forEach((r, idx) => {
    const rank = idx + 1;
    const docKey = r.item.key;
    const sectionIdx = r.item.sectionIdx;
    
    const chunks = getSectionChunks(index.indexEpoch, docKey, sectionIdx);
    chunks.forEach(chunkId => {
      const item = ensureRrfItem(chunkId, docKey, sectionIdx, r.item.text, r.item.heading);
      item.rrf += 1 / (60 + rank);
    });
  });
  
  let candidates = Array.from(rrfMap.values());
  candidates.sort((a, b) => {
    if (b.rrf !== a.rrf) return b.rrf - a.rrf;
    return a.chunkId.localeCompare(b.chunkId);
  });
  
  // Diversity caps
  const finalHybrid = [];
  const cappedHybrid = [];
  const seenSections = new Set();
  const docKeyCounts = new Map();
  
  for (const c of candidates) {
    const sectionKey = `${c.docKey}:${c.sectionIdx}`;
    const count = docKeyCounts.get(c.docKey) || 0;
    
    if (seenSections.has(sectionKey) || count >= 3) {
      cappedHybrid.push(c);
    } else {
      seenSections.add(sectionKey);
      docKeyCounts.set(c.docKey, count + 1);
      finalHybrid.push(c);
    }
  }
  
  const results = [];
  
  // Fill from hybrid
  let hybridIdx = 0;
  while (results.length < max && hybridIdx < finalHybrid.length) {
    const h = finalHybrid[hybridIdx++];
    const doc = index.docs.get(h.docKey);
    results.push({
      id: h.chunkId,
      docKey: h.docKey,
      heading: h.heading,
      snippet: h.text,
      doc: doc.name,
      summary: doc.summary
    });
  }
  
  // Backfill from capped if needed
  let cappedIdx = 0;
  while (results.length < max && cappedIdx < cappedHybrid.length) {
    const h = cappedHybrid[cappedIdx++];
    const doc = index.docs.get(h.docKey);
    results.push({
      id: h.chunkId,
      docKey: h.docKey,
      heading: h.heading,
      snippet: h.text,
      doc: doc.name,
      summary: doc.summary
    });
  }

  if (results.length === 0) {
    const effectiveContext = context || "app";
    return { content: [{ type: "text", text: `No results for query "${query}" (context: ${effectiveContext}).` }] };
  }

  const lines = results.map((r) => {
    const text = (r.snippet || "").trim();
    const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    return `- **${r.doc}** › ${r.heading}: ${snippet.replace(/\n+/g, " ")} (summary: ${r.summary})`;
  });

  return { content: [{ type: "text", text: lines.join("\n") }] };
};
