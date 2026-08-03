import { test, describe } from "node:test";
import assert from "node:assert/strict";

// No corpus root at all. The legacy knowledge loader used to read a hardcoded
// resources/ln-ashlar at module scope and throw ENOENT, taking the whole
// server.js import chain down before app.listen. Importing it must be safe.
process.env.DOCS_CORPUS_ROOTS = "";
process.env.ASHLAR_DOCS_REPO = "";

const { docs, loadDocs } = await import("../tools/knowledge/loader.js");
const { docCount } = await import("../tools/knowledge/search.js");
const { handler: knowledgeReadHandler } = await import("../tools/knowledge_read.js");
const { handler: knowledgeSearchHandler } = await import("../tools/knowledge_search.js");
const { handler: getLnSchemaHandler } = await import("../tools/get_ln_schema.js");

describe("knowledge layer with no configured corpus root", () => {
  test("importing the loader yields an empty index instead of throwing", () => {
    assert.deepEqual(docs, []);
    assert.deepEqual(loadDocs(), []);
    assert.equal(docCount(), 0);
  });

  test("knowledge_search reports not-configured rather than 'no results'", async () => {
    const result = await knowledgeSearchHandler({ q: "button" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not configured/i);
  });

  test("knowledge_read reports not-configured", async () => {
    const result = await knowledgeReadHandler({ filePath: "README.md" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not configured/i);
  });

  test("get_ln_schema errors instead of serving an in-repo copy", async () => {
    const result = await getLnSchemaHandler({});
    assert.equal(result.isError, true);
  });
});
