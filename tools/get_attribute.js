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
    "attribute behavior. Optional 'domain' narrows the result list across corpus roots.",
  inputSchema: {
    attribute: z.string().describe("Attribute name to look up, e.g. 'data-ln-toggle-action'"),
    domain: z
      .enum(["frontend", "backend", "process"])
      .optional()
      .describe("Narrow results to components in a single domain")
  }
};

export const handler = async ({ attribute, domain }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const key = (attribute ?? "").trim();
  let matches = index.attributeIndex.get(key) || [];
  if (domain) matches = matches.filter((m) => m.domain === domain);

  if (matches.length === 0) {
    const suggestions = closest(key, Array.from(index.attributeIndex.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${attribute}".${suffix}` }] };
  }

  const lines = [
    `Attribute \`${key}\` — ${matches.length} declaration(s):`,
    "",
    "| Component | Domain | Element | Type / Values | Default | Description |",
    "| --- | --- | --- | --- | --- | --- |",
    ...matches.map(
      (m) =>
        `| ${m.component} | ${m.domain} | ${m.element ?? ""} | ${m.typeValues ?? ""} | ${m.default ?? ""} | ${m.description ?? ""} |`
    )
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
};
