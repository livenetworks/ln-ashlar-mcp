import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");
const FIXTURE_REPO2 = path.join(__dirname, "fixtures", "ashlar-repo2");

// The legacy knowledge index resolves its roots through the same env knob as
// the ashlar corpus — no hardcoded resources/ln-ashlar anywhere.
process.env.DOCS_CORPUS_ROOTS = `${FIXTURE_REPO},${FIXTURE_REPO2}`;

const { docs } = await import("../tools/knowledge/loader.js");
const { docCount, search } = await import("../tools/knowledge/search.js");
const { handler: knowledgeReadHandler } = await import("../tools/knowledge_read.js");
const { handler: getLnSchemaHandler } = await import("../tools/get_ln_schema.js");

describe("knowledge index across configured roots", () => {
  test("indexes markdown from every root, prefixed with the root label", () => {
    assert.ok(docCount() > 0);
    assert.ok(docs.some((d) => d.filePath.startsWith("ashlar-repo/")));
    assert.ok(docs.some((d) => d.filePath.startsWith("ashlar-repo2/")));
  });

  test("indexes files the ashlar corpus skips (README.md, _-prefixed)", () => {
    assert.ok(docs.some((d) => d.filePath === "ashlar-repo/docs-mcp/README.md"));
    assert.ok(docs.some((d) => d.filePath === "ashlar-repo/docs-mcp/components/_draft.md"));
  });

  test("search returns hits from the indexed roots", () => {
    const results = search("fake");
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
  });
});

describe("knowledge_read root resolution", () => {
  test("reads a root-label prefixed path as emitted by knowledge_search", async () => {
    const result = await knowledgeReadHandler({ filePath: "ashlar-repo/docs-mcp/README.md" });
    assert.equal(result.isError, undefined);
    assert.ok(result.content[0].text.length > 0);
  });

  test("reads a plain repo-relative path against the configured roots", async () => {
    const result = await knowledgeReadHandler({ filePath: "docs-mcp/components/ln-fake.md" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /ln-fake/);
  });

  test("rejects a path traversal attempt", async () => {
    const result = await knowledgeReadHandler({ filePath: "../../../etc/passwd" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Access denied/);
  });

  test("reports a missing file inside the root as not found", async () => {
    const result = await knowledgeReadHandler({ filePath: "docs-mcp/nope.md" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /File not found/);
  });

  test("refuses to read a directory", async () => {
    const result = await knowledgeReadHandler({ filePath: "docs-mcp" });
    assert.equal(result.isError, true);
  });
});

describe("get_ln_schema", () => {
  test("errors when no configured root carries the schema", async () => {
    const result = await getLnSchemaHandler({});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /docs-mcp\/schemas/);
  });
});
