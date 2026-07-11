import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";

export const name = "list_components";

export const definition = {
  title: "List Components",
  description:
    "List every indexed ln-ashlar docs-mcp document (components, css, patterns, guides, doctrine) " +
    "as a markdown table with name, classification, status, summary and tags. " +
    "Optionally filter by classification.",
  inputSchema: {
    classification: z
      .enum(["simple", "coordinator", "service", "css", "pattern", "guide", "doctrine"])
      .optional()
      .describe("Filter the listing to a single classification")
  }
};

export const handler = async ({ classification } = {}) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const rows = classification
    ? index.registry.filter((doc) => doc.classification === classification)
    : index.registry;

  if (rows.length === 0) {
    const text = classification
      ? `No documents found for classification "${classification}".`
      : "No documents indexed.";
    return { content: [{ type: "text", text }] };
  }

  const lines = [
    "| Name | Classification | Status | Summary | Tags |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (doc) =>
        `| ${doc.name} | ${doc.classification ?? ""} | ${doc.status ?? ""} | ${doc.summary ?? ""} | ${(doc.tags ?? []).join(", ")} |`
    )
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
};
