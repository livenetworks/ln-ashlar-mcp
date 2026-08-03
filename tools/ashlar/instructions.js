// tools/ashlar/instructions.js
// The routing contract delivered to the model. Like persona.js, the framing
// lives ONLY on the server — the matrix itself is authored in the corpus
// (`<root>/docs-mcp/component-router.md`) and is never copied into this repo.
//
// Two delivery channels share this module:
//   - buildInstructions() → the MCP `instructions` field, sent in the
//     initialize result and placed by the client in the model's system prompt.
//     This is the only push-based channel in MCP: it costs no tool call and is
//     present before the model emits its first token.
//   - ROUTER_FIRST_HINT → prefixed onto the descriptions of the corpus lookup
//     tools, so the rule is restated at the moment a component is chosen.

import { ensureIndex, ROUTER_FILENAME } from './corpus.js';

/**
 * Enforcement framing only. The routing steps themselves are NOT repeated
 * here — every component-router.md opens with its own "Routing rule" block,
 * so duplicating it would cost tokens on every session and drift over time.
 */
export const ROUTING_PREAMBLE = `MANDATORY ROUTING CONTRACT

Before you emit any UI markup, and before you call get_markup or any
generate_ln_* tool, select the component from the routing matrix below.

- Never invent HTML structure, CSS classes or data-ln-* attributes, and never
  hand-roll behaviour a component already owns.
- This matrix is served live from the documentation corpus. It is authoritative
  over any prior knowledge you have about these components.
- Follow the routing steps stated at the top of each matrix.`;

/** Restates the contract on the tool descriptions that precede markup output. */
export const ROUTER_FIRST_HINT =
  '[Router-first: pick the component from the routing contract in the server instructions (or call get_component_router) before using this.] ';

/**
 * Render one root's routing matrix with a header identifying its corpus root,
 * so a federated server's sections stay attributable.
 * @param {{rootLabel:string, body:string}} router
 * @returns {string}
 */
export function renderRouterSection(router) {
  return `--- ${router.rootLabel} / component router ---\n\n${router.body}`;
}

/**
 * Shared "no routing contract found" text, naming the file authors must add.
 * @param {string[]} rootLabels
 * @returns {string}
 */
export function noRouterMessage(rootLabels) {
  const where = rootLabels.length
    ? rootLabels.map((l) => `${l}/docs-mcp/${ROUTER_FILENAME}`).join(', ')
    : `<root>/docs-mcp/${ROUTER_FILENAME}`;
  return `No routing contract found. Expected at: ${where}`;
}

/**
 * Build the MCP `instructions` payload: the enforcement preamble followed by
 * every configured root's routing matrix, verbatim, in configured root order.
 *
 * Built per session rather than at boot, so a corpus commit is picked up by the
 * next session without restarting the server (ensureIndex() rebuilds on git
 * HEAD change).
 *
 * @returns {Promise<string|null>} null when unconfigured or when no root
 *   carries a routing contract — the caller then omits `instructions`
 *   entirely rather than sending an empty rule.
 */
export async function buildInstructions() {
  const index = await ensureIndex();
  if (!index || !index.routers.length) return null;

  return [ROUTING_PREAMBLE, ...index.routers.map(renderRouterSection)].join('\n\n');
}
