import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";

export const name = "get_attribute";

export const definition = {
  title: "Get Attribute",
  description:
    "Anti-hallucination contract lookup: given a data-ln-* attribute name (e.g. " +
    "'data-ln-toggle-action'), return every component that declares it, with its owning " +
    "element, type/values, default value and description. Use this instead of guessing " +
    "attribute behavior.",
  inputSchema: {
    attribute: z.string().describe("Attribute name to look up, e.g. 'data-ln-toggle-action'")
  }
};

export const handler = async ({ attribute }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const key = (attribute ?? "").trim();
  const matches = index.attributeIndex.get(key);
  if (!matches || matches.length === 0) {
    const suggestions = closest(key, Array.from(index.attributeIndex.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${attribute}".${suffix}` }] };
  }

  const lines = [
    `Attribute \`${key}\` — ${matches.length} declaration(s):`,
    "",
    "| Component | Element | Тип / Вредности | Стандардна вредност | Опис |",
    "| --- | --- | --- | --- | --- |",
    ...matches.map(
      (m) => `| ${m.component} | ${m.element ?? ""} | ${m.typeValues ?? ""} | ${m.default ?? ""} | ${m.description ?? ""} |`
    )
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
};
