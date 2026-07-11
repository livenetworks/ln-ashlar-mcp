import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { validateCorpus } from "../tools/ashlar/validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");

describe("validateCorpus", () => {
  const results = validateCorpus(FIXTURE_REPO);

  test("every fixture file appears exactly once in the report", () => {
    assert.equal(results.length, 9);
    const files = results.map((r) => r.file);
    const unique = new Set(files);
    assert.equal(unique.size, files.length);
    assert.ok(files.includes("components/ln-fake.md"));
    assert.ok(files.includes("components/ln-broken.md"));
    assert.ok(files.includes("components/ln-fake-service.md"));
    assert.ok(files.includes("components/ln-empty-service.md"));
    assert.ok(files.includes("components/ln-nohtml.md"));
    assert.ok(files.includes("css/fake-css.md"));
    assert.ok(files.includes("patterns/fake-pattern.md"));
    assert.ok(files.includes("doctrine/fake-doctrine.md"));
    assert.ok(files.includes("guides/fake-guide.md"));
  });

  test("ln-fake.md is fully valid (empty problems)", () => {
    const entry = results.find((r) => r.file === "components/ln-fake.md");
    assert.deepEqual(entry.problems, []);
  });

  test("ln-broken.md reports the expected contract violations", () => {
    const entry = results.find((r) => r.file === "components/ln-broken.md");
    const joined = entry.problems.join(" | ");

    assert.match(joined, /Slug mismatch/);
    assert.match(joined, /does not match folder/);
    assert.match(joined, /7.*sections|Expected exactly 7/);
    assert.match(joined, /unexpected columns/);
    assert.match(joined, /Broken link/);
    assert.match(joined, /Missing required frontmatter field: "tags"/);
  });

  test("ln-fake-service.md (classification service, js blocks) is fully valid", () => {
    const entry = results.find((r) => r.file === "components/ln-fake-service.md");
    assert.deepEqual(entry.problems, []);
  });

  test("ln-empty-service.md (classification service, zero blocks) is fully valid", () => {
    const entry = results.find((r) => r.file === "components/ln-empty-service.md");
    assert.deepEqual(entry.problems, []);
  });

  test("ln-nohtml.md (classification simple, §2 with no html block) reports exactly one problem", () => {
    const entry = results.find((r) => r.file === "components/ln-nohtml.md");
    assert.equal(entry.problems.length, 1);
    assert.match(
      entry.problems[0],
      /Section 2 must contain at least one ```html block \(required for classification simple\)/
    );
  });
});
