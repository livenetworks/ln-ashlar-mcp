import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";

export const name = "who_handles";

export const definition = {
  title: "Who Handles",
  description:
    "Reverse lookup: given a CustomEvent name, list every document that Emits it and every " +
    "document that Listens to it, grouped by direction. Useful for tracing cross-component " +
    "event wiring. Optional 'domain' narrows the result list across corpus roots.",
  inputSchema: {
    event: z.string().describe("Event name to look up, e.g. 'ln-toggle:open'"),
    domain: z
      .enum(["frontend", "backend", "process"])
      .optional()
      .describe("Narrow results to documents in a single domain")
  }
};

export const handler = async ({ event, domain }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const key = (event ?? "").trim();
  let matches = index.eventIndex.get(key) || [];
  if (domain) matches = matches.filter((m) => m.domain === domain);

  if (matches.length === 0) {
    const suggestions = closest(key, Array.from(index.eventIndex.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${event}".${suffix}` }] };
  }

  const emitters = matches.filter((m) => m.direction === "Emits");
  const listeners = matches.filter((m) => m.direction === "Listens");

  const renderList = (rows) =>
    rows.length ? rows.map((m) => `- **${m.doc}** (${m.domain}) — ${m.description ?? ""}`).join("\n") : "(none)";

  const text = [
    `Event \`${key}\`:`,
    "",
    `Emits:\n${renderList(emitters)}`,
    "",
    `Listens:\n${renderList(listeners)}`
  ].join("\n");

  return { content: [{ type: "text", text }] };
};
