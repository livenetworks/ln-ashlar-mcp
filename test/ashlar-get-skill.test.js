import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");
const FIXTURE_REPO2 = path.join(__dirname, "fixtures", "ashlar-repo2");

process.env.DOCS_CORPUS_ROOTS = `${FIXTURE_REPO},${FIXTURE_REPO2}`;

const { handler } = await import("../tools/get_skill.js");
const { SKILL_PERSONA } = await import("../tools/ashlar/persona.js");

describe("get_skill handler", () => {
  test("valid skill, default context 'app': persona present + body present, not isError", async () => {
    const result = await handler({ name: "fake-skill" });
    const text = result.content[0].text;
    assert.ok(!result.isError);
    assert.ok(text.startsWith(SKILL_PERSONA));
    assert.match(text, /## Summary/);
    assert.match(text, /Rule \(fixture only\)/);
  });

  test("persona text is NOT present in the fixture file on disk", () => {
    const filePath = path.join(FIXTURE_REPO, "docs-mcp", "skills", "app", "fake-skill.md");
    const raw = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(raw, /senior UI\/UX designer/);
  });

  test("unknown name: not-found + closest among skills only", async () => {
    const result = await handler({ name: "fake-skil" });
    const text = result.content[0].text;
    assert.match(text, /Not found/);
    assert.match(text, /fake-skill/);
  });

  test("result never mixes contexts: fake-skill (app) vs fake-skill-web (web) serve different bodies", async () => {
    const app = await handler({ name: "fake-skill" });
    const web = await handler({ name: "fake-skill-web", context: "web" });
    assert.notEqual(app.content[0].text, web.content[0].text);
  });

  test("(name, context) resolution: same name 'fake-skill' in two different roots+contexts resolves distinctly", async () => {
    const appResult = await handler({ name: "fake-skill", context: "app" });
    const webResult = await handler({ name: "fake-skill", context: "web" });
    assert.ok(!appResult.isError);
    assert.ok(!webResult.isError);
    assert.notEqual(appResult.content[0].text, webResult.content[0].text);
    assert.match(webResult.content[0].text, /root 2/);
  });

  test("default context 'app' does not resolve root 2's web-context 'fake-skill'", async () => {
    const result = await handler({ name: "fake-skill" });
    assert.doesNotMatch(result.content[0].text, /root 2/);
  });
});
