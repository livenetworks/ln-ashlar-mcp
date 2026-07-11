import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";

export const name = "get_component";

export const definition = {
  title: "Get Component",
  description:
    "Return the full raw markdown (frontmatter + body, verbatim) for a single ln-ashlar docs-mcp " +
    "document by its registered name.",
  inputSchema: {
    name: z.string().describe("Document name as registered in the corpus (e.g. 'ln-fake')")
  }
};

export const handler = async ({ name: docName }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const doc = index.docs.get(docName);
  if (!doc) {
    const suggestions = closest(docName, Array.from(index.docs.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${docName}".${suffix}` }] };
  }

  return { content: [{ type: "text", text: doc.raw }] };
};
