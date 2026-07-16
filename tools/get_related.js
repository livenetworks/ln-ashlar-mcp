import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";
import { findByName, renderAmbiguous } from "./ashlar/resolve.js";

export const name = "get_related";

export const definition = {
  title: "Get Related",
  description:
    "Return the documents linked to and from a given document (the corpus link graph), " +
    "grouped as 'Outgoing' and 'Incoming', each with its summary. Dangling relative links to " +
    "not-yet-authored docs are valid and shown as '(planned)'. Optional 'domain' disambiguates " +
    "a name that exists in multiple corpus roots.",
  inputSchema: {
    name: z.string().describe("Document name, e.g. 'ln-toggle'"),
    domain: z
      .enum(["frontend", "backend", "process"])
      .optional()
      .describe("Disambiguate a name that exists in multiple corpus roots")
  }
};

export const handler = async ({ name: docName, domain }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const resolved = findByName(index, docName, domain);

  if (resolved.status === "notfound") {
    const suggestions = closest(docName, Array.from(index.byName.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${docName}".${suffix}` }] };
  }

  if (resolved.status === "ambiguous") {
    return { content: [{ type: "text", text: renderAmbiguous(docName, resolved.matches) }] };
  }

  const neighbors = index.linkGraph.get(resolved.doc.key) || { outgoing: [], incoming: [] };

  const renderList = (entries) =>
    entries.length
      ? entries
          .map((n) =>
            n.planned
              ? `- **${n.name}** (planned — not yet authored)`
              : `- **${n.name}** — ${index.docs.get(n.key)?.summary ?? ""}`
          )
          .join("\n")
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
