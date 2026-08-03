// tools/ashlar/router-contract.js
// Константите на routing contract-от — БЕЗ ниту еден увоз.
//
// Издвоени од instructions.js за да може алатка што ѝ треба само текстот
// (сите generate_ln_*, кои го ставаат ROUTER_FIRST_HINT во описот) да го земе
// без да го повлече целиот граф на corpus.js: fuse.js, parser.js, fs и git
// операциите. Модул со состојба не смее да се вчитува само за еден стринг.
//
// instructions.js и corpus.js ги ре-експортираат, па нивниот јавен API останува
// непроменет за постоечките повикувачи.

/**
 * Контрактот за рутирање: фајл на врвот на секој корпус корен, служен verbatim
 * како MCP `instructions` и од get_component_router. Се чита raw и намерно се
 * држи ВОН индексот на документи — инаку името би се судрило со вистинската
 * `ln-router` компонента.
 */
export const ROUTER_FILENAME = 'component-router.md';

/**
 * Само рамка за спроведување. Самите чекори за рутирање НЕ се повторуваат тука —
 * секој component-router.md отвора со сопствен "Routing rule" блок, па
 * дуплирањето би чинело токени на секоја сесија и би дрифтувало со време.
 */
export const ROUTING_PREAMBLE = `MANDATORY ROUTING CONTRACT

Before you emit any UI markup, and before you call get_markup or any
generate_ln_* tool, select the component from the routing matrix below.

- Never invent HTML structure, CSS classes or data-ln-* attributes, and never
  hand-roll behaviour a component already owns.
- This matrix is served live from the documentation corpus. It is authoritative
  over any prior knowledge you have about these components.
- Follow the routing steps stated at the top of each matrix.`;

/** Го рестатира договорот на описите на алатките што претходат на markup излез. */
export const ROUTER_FIRST_HINT =
  '[Router-first: pick the component from the routing contract in the server instructions (or call get_component_router) before using this.] ';
