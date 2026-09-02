import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";
import { findByName, renderAmbiguous } from "./ashlar/resolve.js";

export const name = "get_api";

export const definition = {
  title: "Get Programmatic JS API",
  description:
    "Return the programmatic JavaScript API methods declared by a component or service " +
    "(e.g. 'ln-router', 'ln-core', 'ln-helpers'). Returns method names, signatures, parameters, " +
    "return types, and descriptions from the canonical documentation.",
  inputSchema: {
    name: z.string().describe("Component or service name, e.g. 'ln-router', 'ln-core'"),
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

  const doc = resolved.doc;
  const jsApi = doc.parsed.jsApi || [];

  if (jsApi.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `"${docName}" (status: ${doc.status ?? "stable"}) declares no programmatic JS API methods — see get_attribute / get_events for its declarative contract.`
        }
      ]
    };
  }

  const escapePipe = (val) => (val == null ? "" : String(val).replace(/\|/g, "\\|"));

  const rows = jsApi
    .map(
      (m) =>
        `| \`${escapePipe(m.method)}\` | \`${escapePipe(m.parameters)}\` | \`${escapePipe(m.return)}\` | ${escapePipe(m.description)} |`
    )
    .join("\n");

  const text = [
    `Programmatic JS API for "${docName}" (status: ${doc.status ?? "stable"}):`,
    "",
    "| Method | Parameters | Return | Description |",
    "| --- | --- | --- | --- |",
    rows
  ].join("\n");

  return { content: [{ type: "text", text }] };
};
