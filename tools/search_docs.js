import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";

export const name = "search_docs";

export const definition = {
  title: "Search Docs",
  description:
    "Full-text fuzzy search over every section of the indexed ln-ashlar docs-mcp corpus. " +
    "Returns matching sections as '- **<doc>** › <heading>: <snippet>' lines.",
  inputSchema: {
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Maximum number of results to return (default 10)")
  }
};

export const handler = async ({ query, limit }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const max = limit ?? 10;
  const results = index.fuse.search(query, { limit: max });

  if (results.length === 0) {
    return { content: [{ type: "text", text: `No results for query "${query}".` }] };
  }

  const lines = results.map((r) => {
    const text = (r.item.text || "").trim();
    const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    return `- **${r.item.doc}** › ${r.item.heading}: ${snippet.replace(/\n+/g, " ")}`;
  });

  return { content: [{ type: "text", text: lines.join("\n") }] };
};
