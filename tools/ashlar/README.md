# tools/ashlar — server-side notes

This directory is the shared library backing the `ashlar-docs` MCP tools
(`tools/get_component.js`, `tools/list_components.js`, etc.). It is NOT a
tool itself — `server.js`'s auto-loader only scans files directly in
`tools/*.js` and skips directories, so nothing here is auto-registered.

The **authoritative parsing/authoring contract** lives in the corpus itself:
`resources/ln-ashlar/docs-mcp/README.md` + `resources/ln-ashlar/docs-mcp/_templates/*.md`.
This file only documents server-side config and decisions that don't belong
in the corpus contract.

## Configuration

- `DOCS_CORPUS_ROOTS` — comma-separated list of REPO ROOT paths (each root's
  corpus lives at `<root>/docs-mcp/`). Federated model: the server reads N
  corpora. Entries are trimmed; empty entries dropped.
- `ASHLAR_DOCS_REPO` — legacy single-root fallback, used only when
  `DOCS_CORPUS_ROOTS` is unset.
- Neither set, or no configured root has a readable `docs-mcp/` folder → the
  server degrades gracefully: one `console.warn`, empty index, every tool
  responds with a clear "not configured" text (never a throw).

## Decisions

### Name-collision policy (federated corpus keying)

- Internal registry key = `"<rootIndex>:<name>"` (root order = the order
  roots appear in `DOCS_CORPUS_ROOTS`). Every registry entry additionally
  carries: root path, root label, relPath, folder, classification, status,
  domain, context, summary, tags, source.
- `name` uniqueness is enforced only **within one root**. A duplicate `name`
  inside the same root is a `validate_docs` finding on both files; at
  index-build time the first file (directory read order) wins and the
  duplicate is skipped with a warning.
- The same `name` in **different** roots is legal. A name-only lookup
  (`get_component`, `get_markup`, `get_events`, `get_related`, `get_skill`,
  the exact-name tier of `get_doctrine`) that matches multiple roots returns
  a **disambiguation response**: it lists every match with its `domain` and
  root label, and instructs the caller to pass a `domain` filter. The server
  never silently picks one — this is an anti-hallucination guarantee.
- `get_attribute` and `who_handles` are list-returning tools by design
  (multiple components may legitimately share an attribute/event name); an
  optional `domain` input on those two narrows the result list rather than
  triggering the disambiguation flow.
- Rationale: corpora live in separate repos with separate authors — global
  `name` uniqueness is unenforceable at authoring time. Relative markdown
  links never cross roots, so the `linkGraph` is unaffected by this policy.

### Context: folder-derived, skills only

`context` is **not** a frontmatter key for any document. For skills it is
derived from the subfolder the file lives in: `skills/app/`, `skills/web/`,
`skills/wordpress/`. Every other indexed doc is **context-neutral**
(`context: null` in the index) — components/css/patterns/guides/doctrine
never carry a context.

`skills/` is the ONLY indexed folder read recursively (exactly one level of
context subfolders). The other five folders are never recursed into.

- A skill file directly under `skills/` (not in a context subfolder) is
  skipped from the index; `validate_docs`/lint-cli report a finding
  ("skill file must live in a context subfolder: app|web|wordpress").
- A file inside an unknown `skills/<name>/` subfolder (e.g. `skills/mobile/`)
  is skipped from the index; a finding is reported per file inside.
- A `context:` key present in ANY document's frontmatter (skill or not) is a
  finding ("`context` is not a frontmatter key; for skills it derives from
  the subfolder") — the doc is still indexed; for skills the folder-derived
  context wins unconditionally over the (ignored) frontmatter value.
- `source:` present on a skill is a finding ("standalone, no code source");
  the doc is still indexed. `source` stays supported for every other
  classification, unchanged.
- Skill links: every markdown link in a skill body must match `./<name>.md`
  (same-folder relative, no `../`, no path segment beyond the leading `./`).
  A link that doesn't match is a finding. Dangling `./` sibling links
  (not-yet-authored) remain valid, non-findings — this is unchanged from the
  general dangling-link rule.

Because context rules are, by design, often *opposite* between contexts
(density, motion, decoration flip between apps and presentational sites),
the server **never mixes two `context` values in one served result set**.
`search_docs`'s `context` param (default `"app"`) filters **skills only** —
context-neutral (non-skill) docs are always eligible regardless of the
`context` param, since the hard "never mix two contexts" rule only applies
to the one document type that actually carries a context.

### Skill name keying: (name, context)

The same skill `name` may legally exist in two different context
subfolders of the same root (e.g. `skills/app/ux.md` and `skills/web/ux.md`)
— they are distinct documents. `get_skill` resolves by `(name, context)`
(context defaults to `"app"`); the internal registry key includes the
context for skills (`"<rootIndex>:<name>:<context>"`) precisely so this
doesn't collide.

Name-uniqueness-within-a-root is adjusted accordingly:
- Non-skill docs: unique by `name`, as before.
- Skills: unique by `name` **per context**, not globally within the root.
- A skill and a non-skill sharing the same `name` in the same root is
  legal (separate namespaces) — the simplest consistent rule, chosen over
  cross-namespace uniqueness because skills and non-skills serve entirely
  different lookup paths (`get_skill` vs. `get_component`/`get_related`/etc.).
  Note this means a bare-name lookup via `get_related`/`get_component` does
  not distinguish skill context; that's an accepted limitation outside this
  decision's scope — those tools were never context-aware.

### Persona injection (get_skill)

The `SKILL_PERSONA` constant (`tools/ashlar/persona.js`) is prepended to
`get_skill` responses by the server. It is never authored inside a skill
document — see `docs-mcp/_templates/skill.md` "No persona sections."

### Dangling relative links

A relative markdown link that doesn't resolve to an indexed file is a valid
"planned" reference to a not-yet-authored doc, not a validation error. The
corpus `linkGraph` still records the edge, marked `planned: true`.

## CLI linter

```
node tools/ashlar/lint-cli.js [rootPath...]
```

With no args, lints the configured roots (`DOCS_CORPUS_ROOTS` / legacy
`ASHLAR_DOCS_REPO`). Args, when given, override env config. Exit codes:
`0` clean, `1` findings present, `2` no corpus configured. Also exposed as
the npm script `npm run lint:docs`.
