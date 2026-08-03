import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "list_components";

export const definition = {
  title: "List Components",
  description:
    ROUTER_FIRST_HINT +
    "List every indexed ln-ashlar docs-mcp component (components/ folder only, across all " +
    "configured corpus roots) as a markdown table with name, classification, status, domain, " +
    "summary and tags. Optionally filter by classification, domain, status and/or tags " +
    "(any-match).",
  inputSchema: {
    classification: z
      .enum(["simple", "coordinator", "service"])
      .optional()
      .describe("Filter the listing to a single classification"),
    domain: z
      .enum(["frontend", "backend", "process"])
      .optional()
      .describe("Filter the listing to a single domain (absent frontmatter domain defaults to 'frontend')"),
    status: z.enum(["draft", "stable"]).optional().describe("Filter the listing to a single status"),
    tags: z.array(z.string()).optional().describe("Filter to docs matching any of these tags")
  }
};

export const handler = async ({ classification, domain, status, tags } = {}) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  let rows = index.registry.filter((doc) => doc.folder === "components");
  if (classification) rows = rows.filter((doc) => doc.classification === classification);
  if (domain) rows = rows.filter((doc) => doc.domain === domain);
  if (status) rows = rows.filter((doc) => doc.status === status);
  if (tags && tags.length) {
    rows = rows.filter((doc) => (doc.tags ?? []).some((t) => tags.includes(t)));
  }

  if (rows.length === 0) {
    return { content: [{ type: "text", text: "No components found for the given filters." }] };
  }

  const lines = [
    "| Name | Classification | Status | Domain | Summary | Tags |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (doc) =>
        `| ${doc.name} | ${doc.classification ?? ""} | ${doc.status ?? ""} | ${doc.domain ?? ""} | ${doc.summary ?? ""} | ${(doc.tags ?? []).join(", ")} |`
    )
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
};
