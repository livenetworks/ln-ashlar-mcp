import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";
import { findByName, renderAmbiguous } from "./ashlar/resolve.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "get_component";

export const definition = {
  title: "Get Component",
  description:
    ROUTER_FIRST_HINT +
    "Return the full raw markdown (frontmatter + body, verbatim) for a single ln-ashlar docs-mcp " +
    "document by its registered name. When the same name exists in more than one configured " +
    "corpus root, an optional 'domain' input disambiguates; without it, an ambiguous name " +
    "returns a disambiguation listing instead of guessing.",
  inputSchema: {
    name: z.string().describe("Document name as registered in the corpus (e.g. 'ln-toggle')"),
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

  return { content: [{ type: "text", text: resolved.doc.raw }] };
};
