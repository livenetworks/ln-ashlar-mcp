import { search, docCount } from "./knowledge/search.js";
import { notConfiguredMessage } from "./ashlar/corpus.js";
import { z } from "zod";

export const name = "knowledge_search";

export const definition = {
  title: "Knowledge Search",
  description: "MANDATORY ARCHITECTURE SEARCH: Search official project documentation, layer 1/layer 2 coordinators, mixins, and knowledge files for ln-ashlar. Call this before answering component architecture questions.",
  inputSchema: {
    q: z.string().describe("Search query term"),
    limit: z.number().optional().describe("Maximum number of results to return (default 10)")
  }
};

// Compile a highly informative developer instruction block
const GLOBAL_CONTEXT_GUIDELINE = `
================================================================================
CRITICAL LN-ASHLAR ARCHITECTURE GUIDELINES & MINDSET
(Always adhere to these guidelines when authoring, modifying, or styling code)
================================================================================

1. CORE PHILOSOPHY PRINCIPLES:
   - HTML describes WHAT, not HOW: Use semantic HTML only. No presentational/utility classes in markup (no flex, grid, gap, text-secondary).
   - Style via @include on semantic selectors: Use "#user-table { @include table-base; }", NOT "<table class='table'>".
   - Every color is a CSS variable: Use hsl(var(--color-primary)), never hardcoded hex codes.
   - JS is attribute-driven, zero init: Bind via data-ln-* attributes, auto-init via MutationObserver.

2. OPERATIONAL MINDSET & WIRING:
   - Markup Is the Application: JS never builds/generates UI chrome (buttons, options, modal shells).
   - Behavior Is Attached, Not Owned: Components communicate via CustomEvents by element ID. DOM position is irrelevant (teleport-safe).
   - CSS Owns All Presentation: JS only toggles classes/attributes (e.g., .ln-filter-active). SCSS owns visual state styles.
   - Click-triggered wiring -> Declarative attributes (e.g., data-ln-modal-for="modal-id", data-ln-fill-form="form-id").
   - Programmatic flows -> Use coordinators (e.g., window.lnCore.lnFill(el, record)).

3. COMMON SCSS MIXINS & LOOKUPS (Instead of X, @include Y):
   - Spacing: @include p(X), px(X), py(X), m(X), mx(X), my(X), gap(X)
   - Layout: @include flex, flex-col, flex-center, items-center, justify-between, w-full, h-full, size(X)
   - Typography: @include text-xs, text-sm, text-base, text-lg, text-xl, font-normal, font-bold, truncate
   - Core Components: @include card, alert, table-base, button-base, input-base

Note for Agent:
If you need to read the full file contents of any documentation file (e.g., mixins.md or mindset.md), call the "knowledge_read" tool with the file's filePath.
================================================================================
`;

export const handler = async ({ q, limit }) => {
  try {
    if (docCount() === 0) {
      return {
        content: [{ type: "text", text: notConfiguredMessage() }],
        isError: true
      };
    }
    const results = search(q, limit);
    const responseText = `Search results for query "${q}":\n` + 
                         JSON.stringify(results, null, 2) + 
                         `\n\n` + 
                         GLOBAL_CONTEXT_GUIDELINE;
    return {
      content: [{ type: "text", text: responseText }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
};
