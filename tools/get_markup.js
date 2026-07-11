import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";

export const name = "get_markup";

export const definition = {
  title: "Get Markup",
  description:
    "Return the canonical markup for a component or pattern. Without 'variant', returns " +
    "the base markup plus a list of available variant titles. With 'variant' (case-insensitive " +
    "substring match against variant titles), returns that specific variant's code block. " +
    "Service-classified docs (backend APIs without markup) return ```js usage blocks instead " +
    "of ```html; a service doc with zero declared blocks is a valid (non-error) result pointing " +
    "to get_component / get_attribute for its API contract.",
  inputSchema: {
    name: z.string().describe("Document name, e.g. 'ln-fake'"),
    variant: z.string().optional().describe("Variant title or substring, e.g. 'Со икона'")
  }
};

export const handler = async ({ name: docName, variant }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const markup = index.markupIndex.get(docName);
  if (!markup) {
    const suggestions = closest(docName, Array.from(index.markupIndex.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${docName}".${suffix}` }] };
  }

  const doc = index.docs.get(docName);
  const classification = doc ? doc.classification : null;

  if (!markup.base && markup.variants.length === 0 && classification === "service") {
    return {
      content: [
        {
          type: "text",
          text:
            `„${docName}" е позадински API без markup — види §3 Декларативен API Договор ` +
            `преку get_component / get_attribute.`
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
