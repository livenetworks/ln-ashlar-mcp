import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";
import { findByName, renderAmbiguous } from "./ashlar/resolve.js";

export const name = "get_markup";

export const definition = {
  title: "Get Markup",
  description:
    "Return the canonical markup for a component or pattern. Without 'variant', returns " +
    "the base markup plus a list of available variant titles. With 'variant' (case-insensitive " +
    "substring match against variant titles), returns that specific variant's code block. " +
    "Service-classified docs (backend APIs without markup) return ```js usage blocks instead " +
    "of ```html; a service doc with zero declared blocks is a valid (non-error) result pointing " +
    "to get_component / get_attribute for its API contract. Optional 'domain' disambiguates a " +
    "name that exists in multiple corpus roots.",
  inputSchema: {
    name: z.string().describe("Document name, e.g. 'ln-toggle'"),
    variant: z.string().optional().describe("Variant title or substring, e.g. 'With Icon'"),
    domain: z
      .enum(["frontend", "backend", "process"])
      .optional()
      .describe("Disambiguate a name that exists in multiple corpus roots")
  }
};

export const handler = async ({ name: docName, variant, domain }) => {
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

  const doc = resolved.doc;
  const markup = index.markupIndex.get(doc.key);

  if (!markup.base && markup.variants.length === 0 && doc.classification === "service") {
    return {
      content: [
        {
          type: "text",
          text: `"${docName}" is a background API with no markup — see §3 Declarative API Contract via get_component / get_attribute.`
        }
      ]
    };
  }

  if (!variant) {
    const variantList = markup.variants.length
      ? markup.variants.map((v) => `- ${v.title}`).join("\n")
      : "(no variants declared)";
    const base = markup.base
      ? `\`\`\`${markup.base.lang}\n${markup.base.code}\n\`\`\``
      : "(no base markup declared)";
    return {
      content: [
        {
          type: "text",
          text: `Base markup for "${docName}":\n\n${base}\n\nAvailable variants:\n${variantList}`
        }
      ]
    };
  }

  const needle = variant.toLowerCase();
  const match = markup.variants.find((v) => v.title.toLowerCase().includes(needle));
  if (!match) {
    const available = markup.variants.length
      ? markup.variants.map((v) => `- ${v.title}`).join("\n")
      : "(no variants declared)";
    return {
      content: [
        {
          type: "text",
          text: `Not found: variant "${variant}" on "${docName}". Available variants:\n${available}`
        }
      ]
    };
  }

  return {
    content: [{ type: "text", text: `${match.title}:\n\n\`\`\`${match.lang}\n${match.code}\n\`\`\`` }]
  };
};
