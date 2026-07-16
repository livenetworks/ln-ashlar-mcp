import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { validateCorpus } from "../tools/ashlar/validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");
const FIXTURE_REPO2 = path.join(__dirname, "fixtures", "ashlar-repo2");

describe("validateCorpus — single root", () => {
  const [root] = validateCorpus([FIXTURE_REPO]);

  test("every fixture file appears exactly once in the report", () => {
    assert.equal(root.files.length, 17);
    const files = root.files.map((r) => r.file);
    const unique = new Set(files);
    assert.equal(unique.size, files.length);
    assert.ok(files.includes("components/ln-fake.md"));
    assert.ok(files.includes("components/ln-broken.md"));
    assert.ok(files.includes("components/ln-fake-service.md"));
    assert.ok(files.includes("components/ln-empty-service.md"));
    assert.ok(files.includes("components/ln-nohtml.md"));
    assert.ok(files.includes("components/ln-stub.md"));
    assert.ok(files.includes("css/fake-css.md"));
    assert.ok(files.includes("patterns/fake-pattern.md"));
    assert.ok(files.includes("doctrine/fake-doctrine.md"));
    assert.ok(files.includes("guides/fake-guide.md"));
    assert.ok(files.includes("skills/app/fake-skill.md"));
    assert.ok(files.includes("skills/web/fake-skill-web.md"));
    assert.ok(files.includes("skills/app/fake-skill-context.md"));
    assert.ok(files.includes("skills/app/fake-skill-source.md"));
    assert.ok(files.includes("skills/app/fake-skill-outlink.md"));
    assert.ok(files.includes("skills/root-skill.md"));
    assert.ok(files.includes("skills/mobile/whatever.md"));
  });

  test("ln-fake.md is fully valid (empty problems)", () => {
    const entry = root.files.find((r) => r.file === "components/ln-fake.md");
    assert.deepEqual(entry.problems, []);
  });

  test("ln-broken.md reports the expected contract violations", () => {
    const entry = root.files.find((r) => r.file === "components/ln-broken.md");
    const joined = entry.problems.join(" | ");

    assert.match(joined, /Slug mismatch/);
    assert.match(joined, /does not match folder/);
    assert.match(joined, /Expected exactly 7/);
    assert.match(joined, /unexpected columns/);
    assert.match(joined, /Invalid status "bogus"/);
    assert.doesNotMatch(joined, /Broken link/);
  });

  test("ln-fake-service.md (classification service, js blocks) is fully valid", () => {
    const entry = root.files.find((r) => r.file === "components/ln-fake-service.md");
    assert.deepEqual(entry.problems, []);
  });

  test("ln-empty-service.md (classification service, zero blocks) is fully valid", () => {
    const entry = root.files.find((r) => r.file === "components/ln-empty-service.md");
    assert.deepEqual(entry.problems, []);
  });

  test("ln-nohtml.md (classification simple, §2 with no html block) reports exactly one problem", () => {
    const entry = root.files.find((r) => r.file === "components/ln-nohtml.md");
    assert.equal(entry.problems.length, 1);
    assert.match(
      entry.problems[0],
      /Section 2 must contain at least one ```html block \(required for classification simple\)/
    );
  });

  test("ln-stub.md (no frontmatter) reports exactly the missing-frontmatter finding", () => {
    const entry = root.files.find((r) => r.file === "components/ln-stub.md");
    assert.deepEqual(entry.problems, ["Missing or unparseable frontmatter"]);
  });

  test("fake-css.md is valid; its dangling link is NOT a finding", () => {
    const entry = root.files.find((r) => r.file === "css/fake-css.md");
    assert.deepEqual(entry.problems, []);
  });

  test("fake-pattern.md, fake-guide.md, fake-doctrine.md, and the clean skill fixtures are all valid", () => {
    for (const file of [
      "patterns/fake-pattern.md",
      "guides/fake-guide.md",
      "doctrine/fake-doctrine.md",
      "skills/app/fake-skill.md",
      "skills/web/fake-skill-web.md"
    ]) {
      const entry = root.files.find((r) => r.file === file);
      assert.deepEqual(entry.problems, [], `${file} should be valid`);
    }
  });

  test("skills/app/fake-skill-context.md: a `context:` frontmatter key is a finding, doc still indexable (only that finding)", () => {
    const entry = root.files.find((r) => r.file === "skills/app/fake-skill-context.md");
    assert.deepEqual(entry.problems, [
      "`context` is not a frontmatter key; for skills it derives from the subfolder"
    ]);
  });

  test("skills/app/fake-skill-source.md: a `source:` key on a skill is a finding, doc still indexable (only that finding)", () => {
    const entry = root.files.find((r) => r.file === "skills/app/fake-skill-source.md");
    assert.deepEqual(entry.problems, ["`source` is not supported for skills (standalone, no code source)"]);
  });

  test("skills/app/fake-skill-outlink.md: an outward link is a finding (only that finding)", () => {
    const entry = root.files.find((r) => r.file === "skills/app/fake-skill-outlink.md");
    assert.equal(entry.problems.length, 1);
    assert.match(entry.problems[0], /Skill link "\.\.\/components\/ln-toggle\.md" is invalid/);
  });

  test("skills/root-skill.md: a skill file directly under skills/ is flagged and never crashes", () => {
    const entry = root.files.find((r) => r.file === "skills/root-skill.md");
    assert.deepEqual(entry.problems, ["Skill file must live in a context subfolder: app|web|wordpress"]);
  });

  test("skills/mobile/whatever.md: an unknown context subfolder is flagged and never crashes", () => {
    const entry = root.files.find((r) => r.file === "skills/mobile/whatever.md");
    assert.deepEqual(entry.problems, [
      'Unknown skill context subfolder "mobile"; expected one of app|web|wordpress'
    ]);
  });
});

describe("validateCorpus — duplicate name within a root", () => {
  test("a third fixture root with two files declaring the same name flags both", () => {
    const dupRoot = path.join(__dirname, "fixtures", "ashlar-repo-dup");
    const [root] = validateCorpus([dupRoot]);
    const a = root.files.find((r) => r.file === "components/dup-a.md");
    const b = root.files.find((r) => r.file === "components/dup-b.md");
    assert.ok(a && b);
    assert.ok(a.problems.some((p) => p.includes('Duplicate name "ln-dup"')));
    assert.ok(b.problems.some((p) => p.includes('Duplicate name "ln-dup"')));
  });
});

describe("validateCorpus — multi-root grouping", () => {
  test("returns one entry per configured root, each grouping its own files", () => {
    const results = validateCorpus([FIXTURE_REPO, FIXTURE_REPO2]);
    assert.equal(results.length, 2);
    assert.equal(results[0].rootPath, FIXTURE_REPO);
    assert.equal(results[1].rootPath, FIXTURE_REPO2);
    assert.ok(results[1].files.some((f) => f.file === "components/ln-second.md"));
  });
});
