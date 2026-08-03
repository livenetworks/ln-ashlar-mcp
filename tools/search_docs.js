import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "search_docs";

export const definition = {
  title: "Search Docs",
  description:
    ROUTER_FIRST_HINT +
    "Full-text fuzzy search over every section of the indexed ln-ashlar docs-mcp corpus " +
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

export const handler = async ({ query, limit, classification, domain, context, status, tags }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const effectiveContext = context || "app";
  const max = limit ?? 10;

  const results = index.fuse
    .search(query)
    .filter((r) => {
      const doc = index.docs.get(r.item.key);
      if (!doc) return false;
      // Context filters skills only; context-neutral (non-skill) docs always pass.
      if (doc.folder === "skills" && doc.context !== effectiveContext) return false;
      if (classification && doc.classification !== classification) return false;
      if (domain && doc.domain !== domain) return false;
      if (status && doc.status !== status) return false;
      if (tags && tags.length && !(doc.tags ?? []).some((t) => tags.includes(t))) return false;
      return true;
    })
    .slice(0, max);

  if (results.length === 0) {
    return { content: [{ type: "text", text: `No results for query "${query}" (context: ${effectiveContext}).` }] };
  }

  const lines = results.map((r) => {
    const doc = index.docs.get(r.item.key);
    const text = (r.item.text || "").trim();
    const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    return `- **${r.item.doc}** › ${r.item.heading}: ${snippet.replace(/\n+/g, " ")} (summary: ${doc.summary})`;
  });

  return { content: [{ type: "text", text: lines.join("\n") }] };
};
