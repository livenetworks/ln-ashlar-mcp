import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { buildIndex } from "../tools/ashlar/corpus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");
const FIXTURE_REPO2 = path.join(__dirname, "fixtures", "ashlar-repo2");
const FIXTURE_REPO_DUP = path.join(__dirname, "fixtures", "ashlar-repo-dup"); // has no component-router.md

process.env.DOCS_CORPUS_ROOTS = `${FIXTURE_REPO},${FIXTURE_REPO2}`;

const { handler: routerHandler } = await import("../tools/get_component_router.js");
const { buildInstructions, ROUTING_PREAMBLE, ROUTER_FIRST_HINT } = await import(
  "../tools/ashlar/instructions.js"
);

describe("buildIndex — routing contract loading", () => {
  const index = buildIndex([FIXTURE_REPO, FIXTURE_REPO2]);

  test("one router entry per root that carries component-router.md, in configured root order", () => {
    assert.equal(index.routers.length, 2);
    assert.deepEqual(
      index.routers.map((r) => r.rootLabel),
      ["ashlar-repo", "ashlar-repo2"]
    );
    assert.deepEqual(
      index.routers.map((r) => r.rootIndex),
      [0, 1]
    );
  });

  test("body is the raw file content, verbatim", () => {
    assert.match(index.routers[0].body, /FIXTURE-ROUTER-ROOT-ONE/);
    assert.match(index.routers[0].body, /Golden Rules/);
    assert.match(index.routers[1].body, /FIXTURE-ROUTER-ROOT-TWO/);
    assert.equal(index.routers[0].relPath, "component-router.md");
  });

  test("a root without a routing contract contributes no entry and does not throw", () => {
    const mixed = buildIndex([FIXTURE_REPO_DUP, FIXTURE_REPO]);
    assert.equal(mixed.routers.length, 1);
    assert.equal(mixed.routers[0].rootLabel, "ashlar-repo");
    assert.equal(mixed.roots.length, 2, "both roots are still indexed");
  });

  test("no configured root has one → empty routers, index still built", () => {
    const none = buildIndex([FIXTURE_REPO_DUP]);
    assert.deepEqual(none.routers, []);
    assert.ok(none.registry.length > 0);
  });

  // The router must stay OUT of the document index: it has no frontmatter, and
  // indexing it would put a `component-router` name into the same namespace as
  // the real `ln-router` component.
  test("the router is not indexed as a document", () => {
    assert.ok(!index.byName.has("component-router"));
    assert.ok(!index.docs.has("0:component-router"));
    assert.ok(!index.registry.some((d) => d.name === "component-router"));
  });

  test("adding the fixture router did not change the indexed document count", () => {
    assert.equal(buildIndex([FIXTURE_REPO]).registry.length, 14);
  });
});

describe("buildInstructions — the MCP instructions payload", () => {
  test("preamble followed by every root's matrix, verbatim", async () => {
    const instructions = await buildInstructions();
    assert.ok(instructions);
    assert.ok(instructions.startsWith(ROUTING_PREAMBLE));
    assert.match(instructions, /MANDATORY ROUTING CONTRACT/);
    assert.match(instructions, /--- ashlar-repo \/ component router ---/);
    assert.match(instructions, /--- ashlar-repo2 \/ component router ---/);
    assert.match(instructions, /FIXTURE-ROUTER-ROOT-ONE/);
    assert.match(instructions, /FIXTURE-ROUTER-ROOT-TWO/);
  });

  test("preamble forbids inventing markup and claims authority over prior knowledge", () => {
    assert.match(ROUTING_PREAMBLE, /Never invent HTML/);
    assert.match(ROUTING_PREAMBLE, /authoritative/);
  });

  test("returns null when unconfigured, so the caller omits instructions entirely", async () => {
    const saved = process.env.DOCS_CORPUS_ROOTS;
    process.env.DOCS_CORPUS_ROOTS = "";
    process.env.ASHLAR_DOCS_REPO = "";
    try {
      assert.equal(await buildInstructions(), null);
    } finally {
      process.env.DOCS_CORPUS_ROOTS = saved;
    }
  });

  test("returns null when configured roots carry no routing contract", async () => {
    const saved = process.env.DOCS_CORPUS_ROOTS;
    process.env.DOCS_CORPUS_ROOTS = FIXTURE_REPO_DUP;
    try {
      assert.equal(await buildInstructions(), null);
    } finally {
      process.env.DOCS_CORPUS_ROOTS = saved;
    }
  });
});

describe("get_component_router", () => {
  test("without 'root': every configured root's matrix, root-labelled", async () => {
    const result = await routerHandler({});
    const text = result.content[0].text;
    assert.match(text, /--- ashlar-repo \/ component router ---/);
    assert.match(text, /--- ashlar-repo2 \/ component router ---/);
    assert.match(text, /FIXTURE-ROUTER-ROOT-ONE/);
    assert.match(text, /FIXTURE-ROUTER-ROOT-TWO/);
  });

  test("'root' narrows to a single corpus root", async () => {
    const result = await routerHandler({ root: "ashlar-repo2" });
    const text = result.content[0].text;
    assert.match(text, /FIXTURE-ROUTER-ROOT-TWO/);
    assert.doesNotMatch(text, /FIXTURE-ROUTER-ROOT-ONE/);
  });

  test("'root' matching is case-insensitive and trimmed", async () => {
    const result = await routerHandler({ root: "  AshLar-Repo2 " });
    assert.match(result.content[0].text, /FIXTURE-ROUTER-ROOT-TWO/);
  });

  test("unknown root lists the available roots instead of guessing", async () => {
    const result = await routerHandler({ root: "nope" });
    const text = result.content[0].text;
    assert.match(text, /No routing contract for root "nope"/);
    assert.match(text, /ashlar-repo, ashlar-repo2/);
    assert.doesNotMatch(text, /FIXTURE-ROUTER-ROOT/);
  });

  test("configured but no root carries a contract → names the expected file path", async () => {
    const saved = process.env.DOCS_CORPUS_ROOTS;
    process.env.DOCS_CORPUS_ROOTS = FIXTURE_REPO_DUP;
    try {
      const result = await routerHandler({});
      assert.match(result.content[0].text, /No routing contract found/);
      assert.match(result.content[0].text, /ashlar-repo-dup\/docs-mcp\/component-router\.md/);
    } finally {
      process.env.DOCS_CORPUS_ROOTS = saved;
    }
  });

  test("unconfigured reports not-configured rather than throwing", async () => {
    const saved = process.env.DOCS_CORPUS_ROOTS;
    process.env.DOCS_CORPUS_ROOTS = "";
    process.env.ASHLAR_DOCS_REPO = "";
    try {
      const result = await routerHandler({});
      assert.match(result.content[0].text, /not configured/i);
    } finally {
      process.env.DOCS_CORPUS_ROOTS = saved;
    }
  });
});

describe("router-first reinforcement on the lookup tools", () => {
  test("the four corpus lookup tools restate the contract in their description", async () => {
    const tools = await Promise.all(
      ["get_markup", "get_component", "list_components", "search_docs"].map((t) =>
        import(`../tools/${t}.js`)
      )
    );
    for (const tool of tools) {
      assert.ok(
        tool.definition.description.startsWith(ROUTER_FIRST_HINT),
        `${tool.name} description must open with the router-first hint`
      );
    }
  });

  test("the hint names the tool that serves the matrix", () => {
    assert.match(ROUTER_FIRST_HINT, /get_component_router/);
  });
});
