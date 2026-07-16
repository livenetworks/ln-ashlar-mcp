import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";
import { findByName, renderAmbiguous } from "./ashlar/resolve.js";

export const name = "get_events";

export const definition = {
  title: "Get Events",
  description:
    "Return the CustomEvents contract for a single ln-ashlar document: events it Emits and " +
    "events it Listens to, including cancelable flag and detail shape. Optional 'domain' " +
    "disambiguates a name that exists in multiple corpus roots.",
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

  const events = resolved.doc.parsed.events || [];
  if (events.length === 0) {
    return { content: [{ type: "text", text: `"${docName}" declares no events.` }] };
  }

  const emits = events.filter((e) => e.direction === "Emits");
  const listens = events.filter((e) => e.direction === "Listens");

  const renderRows = (rows) =>
    rows
      .map((e) => `| ${e.event} | ${e.cancelable ?? ""} | ${e.detail ?? ""} | ${e.description ?? ""} |`)
      .join("\n");

  const header = "| Event | Cancelable | `detail` Object | Description |\n| --- | --- | --- | --- |";

  const sections = [];
  sections.push(`Emits (${emits.length}):\n${emits.length ? `${header}\n${renderRows(emits)}` : "(none)"}`);
  sections.push(`Listens (${listens.length}):\n${listens.length ? `${header}\n${renderRows(listens)}` : "(none)"}`);

  return { content: [{ type: "text", text: `Events for "${docName}":\n\n${sections.join("\n\n")}` }] };
};
