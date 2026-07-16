import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const CLI_PATH = path.join(REPO_ROOT, "tools", "ashlar", "lint-cli.js");
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");
const FIXTURE_REPO2 = path.join(__dirname, "fixtures", "ashlar-repo2");

describe("tools/ashlar/lint-cli.js", () => {
  test("exit 1 + ln-broken.md listed when the fixture root has findings", () => {
    const result = spawnSync("node", [CLI_PATH, FIXTURE_REPO], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /components\/ln-broken\.md/);
  });

  test("exit 0 against a clean-only root (ashlar-repo2)", () => {
    const result = spawnSync("node", [CLI_PATH, FIXTURE_REPO2], { encoding: "utf8" });
    assert.equal(result.status, 0);
  });

  test("exit 2 when no corpus roots configured and no args given", () => {
    const result = spawnSync("node", [CLI_PATH], {
      encoding: "utf8",
      env: { ...process.env, DOCS_CORPUS_ROOTS: "", ASHLAR_DOCS_REPO: "" }
    });
    assert.equal(result.status, 2);
  });
});
