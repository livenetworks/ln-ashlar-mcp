import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";

export const name = "who_handles";

export const definition = {
  title: "Who Handles",
  description:
    "Reverse lookup: given a CustomEvent name, list every document that emits it and every " +
    "document that listens to it, grouped by direction. Useful for tracing cross-component " +
    "event wiring.",
  inputSchema: {
    event: z.string().describe("Event name to look up, e.g. 'ln:fake:activate'")
  }
};

export const handler = async ({ event }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const key = (event ?? "").trim();
  const matches = index.eventIndex.get(key);
  if (!matches || matches.length === 0) {
    const suggestions = closest(key, Array.from(index.eventIndex.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${event}".${suffix}` }] };
  }

  const emitters = matches.filter((m) => m.direction === "Емитува");
  const listeners = matches.filter((m) => m.direction === "Слуша");

  const renderList = (rows) =>
    rows.length ? rows.map((m) => `- **${m.doc}** — ${m.description ?? ""}`).join("\n") : "(none)";

  const text = [
    `Event \`${key}\`:`,
    "",
    `Емитува:\n${renderList(emitters)}`,
    "",
    `Слуша:\n${renderList(listeners)}`
  ].join("\n");

  return { content: [{ type: "text", text }] };
};
