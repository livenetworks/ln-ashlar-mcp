import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";
import { renderAmbiguous } from "./ashlar/resolve.js";

export const name = "get_doctrine";

export const definition = {
  title: "Get Doctrine",
  description:
    "Without 'topic': list all doctrine/ and guides/ documents (name, status, summary), across " +
    "all configured corpus roots. With 'topic': return the full markdown of the best-matching " +
    "doctrine/guide document, matched by name, tags, summary, then full-text search. Optional " +
    "'domain' scopes the lookup; an exact-name match that is still ambiguous across roots " +
    "returns a disambiguation listing instead of guessing.",
  inputSchema: {
    topic: z.string().optional().describe("Topic keyword to search for among doctrine/guide docs"),
    domain: z.enum(["frontend", "backend", "process"]).optional().describe("Scope the lookup to a single domain")
  }
};

export const handler = async ({ topic, domain } = {}) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  let scope = Array.from(index.docs.values()).filter((d) => d.folder === "doctrine" || d.folder === "guides");
  if (domain) scope = scope.filter((d) => d.domain === domain);

  if (!topic) {
    if (scope.length === 0) {
      return { content: [{ type: "text", text: "No doctrine/guide documents indexed." }] };
    }
    const lines = [
      "| Name | Status | Domain | Summary |",
      "| --- | --- | --- | --- |",
      ...scope.map((d) => `| ${d.name} | ${d.status ?? ""} | ${d.domain} | ${d.summary ?? ""} |`)
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  const lower = topic.toLowerCase();
  const exactMatches = scope.filter((d) => d.name.toLowerCase() === lower);

  if (exactMatches.length > 1) {
    return { content: [{ type: "text", text: renderAmbiguous(topic, exactMatches) }] };
  }

  let best = exactMatches[0];

  if (!best) {
    best = scope.find((d) => (d.tags || []).some((t) => t.toLowerCase().includes(lower)));
  }

  if (!best) {
    best = scope.find((d) => (d.summary || "").toLowerCase().includes(lower));
  }

  if (!best) {
    const scopeKeys = new Set(scope.map((d) => d.key));
    const fuseResults = index.fuse.search(topic);
    const hit = fuseResults.find((r) => scopeKeys.has(r.item.key));
    if (hit) best = scope.find((d) => d.key === hit.item.key);
  }

  if (!best) {
    const suggestions = closest(topic, scope.map((d) => d.name));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${topic}".${suffix}` }] };
  }

  return { content: [{ type: "text", text: best.raw }] };
};
