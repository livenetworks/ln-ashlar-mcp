import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { closest } from "./ashlar/similar.js";

export const name = "get_events";

export const definition = {
  title: "Get Events",
  description:
    "Return the CustomEvents contract for a single ln-ashlar document: events it emits " +
    "(Емитува) and events it listens to (Слуша), including cancelable flag and detail shape.",
  inputSchema: {
    name: z.string().describe("Document name, e.g. 'ln-fake'")
  }
};

export const handler = async ({ name: docName }) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const doc = index.docs.get(docName);
  if (!doc) {
    const suggestions = closest(docName, Array.from(index.docs.keys()));
    const suffix = suggestions.length ? ` Closest matches: ${suggestions.join(", ")}` : "";
    return { content: [{ type: "text", text: `Not found: "${docName}".${suffix}` }] };
  }

  const events = doc.parsed.events || [];
  if (events.length === 0) {
    return { content: [{ type: "text", text: `"${docName}" declares no events.` }] };
  }

  const emits = events.filter((e) => e.direction === "Емитува");
  const listens = events.filter((e) => e.direction === "Слуша");

  const renderRows = (rows) =>
    rows
      .map((e) => `| ${e.event} | ${e.cancelable ?? ""} | ${e.detail ?? ""} | ${e.description ?? ""} |`)
      .join("\n");

  const header = "| Настан | Cancelable | detail Објект | Опис |\n| --- | --- | --- | --- |";

  const sections = [];
  sections.push(
    `Емитува (${emits.length}):\n${emits.length ? `${header}\n${renderRows(emits)}` : "(none)"}`
  );
  sections.push(
    `Слуша (${listens.length}):\n${listens.length ? `${header}\n${renderRows(listens)}` : "(none)"}`
  );

  return { content: [{ type: "text", text: `Events for "${docName}":\n\n${sections.join("\n\n")}` }] };
};
