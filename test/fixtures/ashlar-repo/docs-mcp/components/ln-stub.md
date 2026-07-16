This fixture has no frontmatter block at all — used to test that a doc with
missing/unparseable frontmatter is skipped from the index (single warn, never
a crash) and reported by validate_docs as "Missing or unparseable
frontmatter".

## 1. Body Only

There is no `---` frontmatter delimiter above this heading.
