import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { buildIndex } from "../tools/ashlar/corpus.js";
import { closest } from "../tools/ashlar/similar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");

describe("buildIndex", () => {
  const index = buildIndex(FIXTURE_REPO);

  test("index is built (no .git dir, signature is null)", () => {
    assert.ok(index);
    assert.equal(index.head, null);
  });

  test("registry has exactly the 9 real docs (README + _draft ignored)", () => {
    assert.equal(index.registry.length, 9);
    const names = index.registry.map((d) => d.name).sort();
    assert.deepEqual(names, [
      "fake-css",
      "fake-doctrine",
      "fake-guide",
      "fake-pattern",
      "ln-empty-service",
      "ln-fake",
      "ln-fake-service",
      "ln-nohtml",
      "ln-other"
    ]);
  });

  test("markupIndex entries for ln-fake-service carry lang fields", () => {
    const markup = index.markupIndex.get("ln-fake-service");
    assert.ok(markup);
    assert.equal(markup.base.lang, "js");
    assert.equal(markup.variants.length, 1);
    assert.equal(markup.variants[0].lang, "js");
  });

  test("attributeIndex resolves data-ln-fake-action", () => {
    const matches = index.attributeIndex.get("data-ln-fake-action");
    assert.ok(matches && matches.length >= 1);
    assert.equal(matches[0].component, "ln-fake");
  });

  test("eventIndex splits by direction", () => {
    const activate = index.eventIndex.get("ln:fake:activate");
    const refresh = index.eventIndex.get("ln:fake:refresh");
    assert.ok(activate && activate.length === 1);
    assert.equal(activate[0].direction, "Емитува");
    assert.ok(refresh && refresh.length === 1);
    assert.equal(refresh[0].direction, "Слуша");
  });

  test("linkGraph incoming/outgoing are symmetric between ln-fake and fake-css", () => {
    const fake = index.linkGraph.get("ln-fake");
    const css = index.linkGraph.get("fake-css");
    assert.ok(fake.outgoing.includes("fake-css"));
    assert.ok(css.incoming.includes("ln-fake"));
    assert.ok(css.outgoing.includes("ln-fake"));
    assert.ok(fake.incoming.includes("fake-css"));
  });

  test("fuse search finds a section by a word from its body", () => {
    const results = index.fuse.search("измислена");
    assert.ok(results.length > 0);
  });
});

describe("similar.closest", () => {
  test("returns ln-fake for a near-miss key among real doc names", () => {
    const index = buildIndex(FIXTURE_REPO);
    const names = Array.from(index.docs.keys());
    const suggestions = closest("ln-fak", names);
    assert.ok(suggestions.includes("ln-fake"));
  });
});
