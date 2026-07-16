import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { buildIndex } from "../tools/ashlar/corpus.js";
import { closest } from "../tools/ashlar/similar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");
const FIXTURE_REPO2 = path.join(__dirname, "fixtures", "ashlar-repo2");

const REPO1_NAMES = [
  "fake-css",
  "fake-doctrine",
  "fake-guide",
  "fake-pattern",
  "fake-skill",
  "fake-skill-context",
  "fake-skill-outlink",
  "fake-skill-source",
  "fake-skill-web",
  "ln-empty-service",
  "ln-fake",
  "ln-fake-service",
  "ln-nohtml",
  "ln-other"
].sort();

describe("buildIndex — single root (README + _draft ignored, ln-stub excluded for missing frontmatter)", () => {
  const index = buildIndex([FIXTURE_REPO]);

  test("index is built (no .git dir, root signature is null)", () => {
    assert.ok(index);
    assert.equal(index.roots.length, 1);
    assert.equal(index.roots[0].signature, null);
  });

  test("registry has exactly the 14 real docs of root 1 (skills/root-skill.md and skills/mobile/whatever.md are skipped)", () => {
    assert.equal(index.registry.length, 14);
    const names = index.registry.map((d) => d.name).sort();
    assert.deepEqual(names, REPO1_NAMES);
  });

  test("ln-stub.md (no frontmatter at all) is excluded from the registry without crashing", () => {
    assert.ok(!index.byName.has("ln-stub"));
  });

  test("skills/root-skill.md (misplaced, not in a context subfolder) is excluded from the registry without crashing", () => {
    assert.ok(!index.byName.has("root-skill"));
  });

  test("skills/mobile/whatever.md (unknown context subfolder) is excluded from the registry without crashing", () => {
    assert.ok(!index.byName.has("whatever"));
  });

  test("markupIndex entries for ln-fake-service carry lang fields", () => {
    const key = index.byName.get("ln-fake-service")[0];
    const markup = index.markupIndex.get(key);
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

  test("eventIndex splits by direction (Emits/Listens)", () => {
    const activate = index.eventIndex.get("ln:fake:activate");
    const refresh = index.eventIndex.get("ln:fake:refresh");
    assert.ok(activate && activate.length === 1);
    assert.equal(activate[0].direction, "Emits");
    assert.ok(refresh && refresh.length === 1);
    assert.equal(refresh[0].direction, "Listens");
  });

  test("non-skill docs are context-neutral (context: null); skills carry the folder-derived context", () => {
    const fakeKey = index.byName.get("ln-fake")[0];
    const fake = index.docs.get(fakeKey);
    assert.equal(fake.domain, "frontend");
    assert.equal(fake.context, null);

    const appSkillKey = index.byName.get("fake-skill")[0];
    const appSkill = index.docs.get(appSkillKey);
    assert.equal(appSkill.context, "app");

    const webSkillKey = index.byName.get("fake-skill-web")[0];
    const webSkill = index.docs.get(webSkillKey);
    assert.equal(webSkill.context, "web");
  });

  test("a forbidden `context:`/`source:` frontmatter key on a skill does not block indexing (folder-derived context wins)", () => {
    const key = index.byName.get("fake-skill-context")[0];
    const doc = index.docs.get(key);
    assert.equal(doc.context, "app");

    const sourceKey = index.byName.get("fake-skill-source")[0];
    const sourceDoc = index.docs.get(sourceKey);
    assert.equal(sourceDoc.context, "app");
  });

  test("linkGraph incoming/outgoing are symmetric between ln-fake and fake-css", () => {
    const fakeKey = index.byName.get("ln-fake")[0];
    const cssKey = index.byName.get("fake-css")[0];
    const fake = index.linkGraph.get(fakeKey);
    const css = index.linkGraph.get(cssKey);
    assert.ok(fake.outgoing.some((n) => n.name === "fake-css" && !n.planned));
    assert.ok(css.incoming.some((n) => n.name === "ln-fake" && !n.planned));
    assert.ok(css.outgoing.some((n) => n.name === "ln-fake" && !n.planned));
    assert.ok(fake.incoming.some((n) => n.name === "fake-css" && !n.planned));
  });

  test("dangling link on fake-css is present in linkGraph, flagged planned", () => {
    const cssKey = index.byName.get("fake-css")[0];
    const css = index.linkGraph.get(cssKey);
    const planned = css.outgoing.find((n) => n.planned);
    assert.ok(planned);
    assert.equal(planned.name, "not-written-yet");
  });

  test("fuse search finds a section by a word from its body", () => {
    const results = index.fuse.search("fake sizing");
    assert.ok(results.length > 0);
  });
});

describe("buildIndex — federated (two roots)", () => {
  const index = buildIndex([FIXTURE_REPO, FIXTURE_REPO2]);

  test("registry includes both roots' docs", () => {
    const names = index.registry.map((d) => d.name);
    assert.ok(names.includes("ln-fake")); // root 1
    assert.ok(names.includes("ln-second")); // root 2
  });

  test("duplicate name 'fake-guide' across roots is present under two distinct keys", () => {
    const keys = index.byName.get("fake-guide");
    assert.equal(keys.length, 2);
    const docs = keys.map((k) => index.docs.get(k));
    const domains = docs.map((d) => d.domain).sort();
    assert.deepEqual(domains, ["backend", "frontend"]);
  });

  test("a unique name in root 2 resolves normally", () => {
    const keys = index.byName.get("ln-second");
    assert.equal(keys.length, 1);
    assert.equal(index.docs.get(keys[0]).rootIndex, 1);
  });

  test("same skill name 'fake-skill' in different roots AND different contexts resolves to two distinct entries", () => {
    const keys = index.byName.get("fake-skill");
    assert.equal(keys.length, 2);
    const docs = keys.map((k) => index.docs.get(k));
    const byContext = new Map(docs.map((d) => [d.context, d]));
    assert.equal(byContext.get("app").rootIndex, 0);
    assert.equal(byContext.get("web").rootIndex, 1);
  });
});

describe("similar.closest", () => {
  test("returns ln-fake for a near-miss key among real doc names", () => {
    const index = buildIndex([FIXTURE_REPO]);
    const names = Array.from(index.byName.keys());
    const suggestions = closest("ln-fak", names);
    assert.ok(suggestions.includes("ln-fake"));
  });
});
