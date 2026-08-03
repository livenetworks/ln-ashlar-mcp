import { z } from "zod";
import { ensureIndex, notConfiguredMessage } from "./ashlar/corpus.js";
import { noRouterMessage, renderRouterSection } from "./ashlar/instructions.js";

export const name = "get_component_router";

export const definition = {
  title: "Get Component Router",
  description:
    "Return the authoritative component-selection matrix (docs-mcp/component-router.md) for the " +
    "configured corpus root(s): which component to use for what, and what not to use it for. " +
    "SELECTION ONLY — it contains no markup; once you have the component name, call get_markup " +
    "for canonical HTML, get_attribute for the attribute contract and get_events / who_handles " +
    "for wiring. The same matrix is already delivered in this server's instructions; call this " +
    "tool to re-read it. Optional 'root' returns a single corpus root's matrix.",
  inputSchema: {
    root: z
      .string()
      .optional()
      .describe("Corpus root label, e.g. 'ln-ashlar'; omit to return every configured root's matrix")
  }
};

export const handler = async ({ root } = {}) => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const rootLabels = index.roots.filter((r) => r.ok).map((r) => r.label);

  if (!index.routers.length) {
    return { content: [{ type: "text", text: noRouterMessage(rootLabels) }] };
  }

  let selected = index.routers;

  if (root) {
    const needle = root.trim().toLowerCase();
    selected = index.routers.filter((r) => r.rootLabel.toLowerCase() === needle);
    if (!selected.length) {
      // Never guess which root was meant — same doctrine as the corpus
      // name-collision disambiguation.
      const available = index.routers.map((r) => r.rootLabel).join(", ");
      return {
        content: [
          {
            type: "text",
            text: `No routing contract for root "${root}". Roots that have one: ${available}`
          }
        ]
      };
    }
  }

  return {
    content: [{ type: "text", text: selected.map(renderRouterSection).join("\n\n") }]
  };
};
