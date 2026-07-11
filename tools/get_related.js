import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";

export const name = "get_related";

export const definition = {
  title: "Get Related",
  description:
    "Return the documents linked to and from a given document (the corpus link graph), " +
    "grouped as 'Outgoing' and 'Incoming', each with its summary.",
  inputSchema: {
    name: z.string().describe("Document name, e.g. 'ln-fake'")
  }
};

export const handler = async ({ name: docName }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const doc = index.docs.get(docName);
  const neighbors = index.linkGraph.get(docName);
  if (!doc || !neighbors) {
    const suggestions = closest(docName, Array.from(index.docs.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${docName}".${suffix}` }] };
  }

  const renderList = (names) =>
    names.length
      ? names.map((n) => `- **${n}** — ${index.docs.get(n)?.summary ?? ""}`).join("\n")
      : "(none)";

  const text = [
    `Related documents for "${docName}":`,
    "",
    `Outgoing:\n${renderList(neighbors.outgoing)}`,
    "",
    `Incoming:\n${renderList(neighbors.incoming)}`
  ].join("\n");

  return { content: [{ type: "text", text }] };
};
