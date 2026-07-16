import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");
const FIXTURE_REPO2 = path.join(__dirname, "fixtures", "ashlar-repo2");

process.env.DOCS_CORPUS_ROOTS = `${FIXTURE_REPO},${FIXTURE_REPO2}`;

const { handler: searchHandler } = await import("../tools/search_docs.js");
const { handler: listHandler } = await import("../tools/list_components.js");
const { handler: relatedHandler } = await import("../tools/get_related.js");
const { handler: componentHandler } = await import("../tools/get_component.js");
const { handler: attributeHandler } = await import("../tools/get_attribute.js");
const { handler: whoHandlesHandler } = await import("../tools/who_handles.js");

describe("search_docs — context hard rule + filters", () => {
  test("default context 'app': fake-skill-web (context web) is absent", async () => {
    const result = await searchHandler({ query: "fixture" });
    assert.doesNotMatch(result.content[0].text, /fake-skill-web/);
  });

  test("context: 'web' returns fake-skill-web", async () => {
    const result = await searchHandler({ query: "fixture", context: "web", classification: "skill" });
    assert.match(result.content[0].text, /fake-skill-web/);
  });

  test("context-neutral (non-skill) docs are always eligible, regardless of the context param", async () => {
    const appResult = await searchHandler({ query: "fixture", classification: "simple" });
    const webResult = await searchHandler({ query: "fixture", context: "web", classification: "simple" });
    assert.match(appResult.content[0].text, /ln-fake/);
    assert.match(webResult.content[0].text, /ln-fake/);
  });

  test("context: 'web' excludes the app-context 'fake-skill'", async () => {
    const result = await searchHandler({ query: "fixture", context: "web", classification: "skill" });
    assert.doesNotMatch(result.content[0].text, /bind click handlers to bare/);
  });

  test("classification/domain/status/tags filters narrow results; summary is shown", async () => {
    const result = await searchHandler({
      query: "fixture",
      classification: "simple",
      domain: "frontend",
      status: "stable",
      tags: ["fake"]
    });
    const text = result.content[0].text;
    assert.match(text, /ln-fake/);
    assert.match(text, /summary:/);
  });
});

describe("list_components — filters, components-only scope", () => {
  test("only components/ folder docs are listed (css/patterns/guides/doctrine/skills excluded)", async () => {
    const result = await listHandler({});
    const text = result.content[0].text;
    assert.match(text, /ln-fake/);
    assert.doesNotMatch(text, /fake-css/);
    assert.doesNotMatch(text, /fake-guide/);
  });

  test("domain filter narrows to a single domain", async () => {
    const result = await listHandler({ domain: "backend" });
    const text = result.content[0].text;
    assert.match(text, /ln-fake-service/);
    assert.doesNotMatch(text, /\| ln-fake \|/);
  });

  test("classification + tags filters combine", async () => {
    const result = await listHandler({ classification: "simple", tags: ["fake"] });
    assert.match(result.content[0].text, /ln-fake/);
  });
});

describe("disambiguation — cross-root duplicate name never guessed", () => {
  test("get_related('fake-guide') without domain returns an ambiguous disambiguation listing both domains", async () => {
    const result = await relatedHandler({ name: "fake-guide" });
    const text = result.content[0].text;
    assert.match(text, /Ambiguous name "fake-guide"/);
    assert.match(text, /domain: frontend/);
    assert.match(text, /domain: backend/);
  });

  test("get_related('fake-guide', domain: 'backend') resolves uniquely", async () => {
    const result = await relatedHandler({ name: "fake-guide", domain: "backend" });
    const text = result.content[0].text;
    assert.doesNotMatch(text, /Ambiguous/);
    assert.match(text, /Related documents for "fake-guide"/);
  });

  test("get_component('fake-guide') is also ambiguous without domain", async () => {
    const result = await componentHandler({ name: "fake-guide" });
    assert.match(result.content[0].text, /Ambiguous name "fake-guide"/);
  });
});

describe("get_attribute / who_handles — domain narrows, does not force disambiguation", () => {
  test("get_attribute with domain filters the declaration list", async () => {
    const result = await attributeHandler({ attribute: "data-ln-fake-service", domain: "backend" });
    assert.match(result.content[0].text, /ln-fake-service/);
  });

  test("who_handles with domain filters emitters/listeners", async () => {
    const result = await whoHandlesHandler({ event: "ln:fake:activate", domain: "frontend" });
    assert.match(result.content[0].text, /ln-fake/);
  });
});
