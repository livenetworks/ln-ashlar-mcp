import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";

export const name = "get_doctrine";

export const definition = {
  title: "Get Doctrine",
  description:
    "Without 'topic': list all doctrine/ and guides/ documents (name, status, summary). " +
    "With 'topic': return the full markdown of the best-matching doctrine/guide document, " +
    "matched by name, tags, summary, then full-text search.",
  inputSchema: {
    topic: z.string().optional().describe("Topic keyword to search for among doctrine/guide docs")
  }
};

export const handler = async ({ topic } = {}) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const scope = index.registry.filter((d) => d.folder === "doctrine" || d.folder === "guides");

  if (!topic) {
    if (scope.length === 0) {
      return { content: [{ type: "text", text: "No doctrine/guide documents indexed." }] };
    }
    const lines = [
      "| Name | Status | Summary |",
      "| --- | --- | --- |",
      ...scope.map((d) => `| ${d.name} | ${d.status ?? ""} | ${d.summary ?? ""} |`)
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  const lower = topic.toLowerCase();
  let best = scope.find((d) => d.name.toLowerCase() === lower);

  if (!best) {
    best = scope.find((d) => (d.tags || []).some((t) => t.toLowerCase().includes(lower)));
  }

  if (!best) {
    best = scope.find((d) => (d.summary || "").toLowerCase().includes(lower));
  }

  if (!best) {
    const scopeNames = new Set(scope.map((d) => d.name));
    const fuseResults = index.fuse.search(topic);
    const hit = fuseResults.find((r) => scopeNames.has(r.item.doc));
    if (hit) best = scope.find((d) => d.name === hit.item.doc);
  }

  if (!best) {
    const suggestions = closest(topic, scope.map((d) => d.name));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${topic}".${suffix}` }] };
  }

  const doc = index.docs.get(best.name);
  return { content: [{ type: "text", text: doc.raw }] };
};
