import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");

// Legacy single-root env var — DOCS_CORPUS_ROOTS intentionally left unset.
process.env.ASHLAR_DOCS_REPO = FIXTURE_REPO;

const { handler } = await import("../tools/get_component.js");

describe("legacy ASHLAR_DOCS_REPO fallback", () => {
  test("still resolves a document when only ASHLAR_DOCS_REPO is set", async () => {
    const result = await handler({ name: "ln-fake" });
    assert.ok(!result.isError);
    assert.match(result.content[0].text, /name: ln-fake/);
  });
});
