import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(__dirname, "fixtures", "ashlar-repo");

process.env.ASHLAR_DOCS_REPO = FIXTURE_REPO;

const { handler } = await import("../tools/get_markup.js");

describe("get_markup handler", () => {
  test("ln-fake-service: returns a js fence with the import line, not isError", async () => {
    const result = await handler({ name: "ln-fake-service" });
    const text = result.content[0].text;
    assert.ok(!result.isError);
    assert.match(text, /```js/);
    assert.match(text, /import \{ lnFakeService \} from "ln-ashlar";/);
  });

  test("ln-empty-service: returns the service hint, not isError, no closest-match fallback", async () => {
    const result = await handler({ name: "ln-empty-service" });
    const text = result.content[0].text;
    assert.ok(!result.isError);
    assert.match(text, /позадински API/);
    assert.match(text, /get_component \/ get_attribute/);
    assert.doesNotMatch(text, /Closest matches/);
  });

  test("ln-fake: identical html behavior (base code, html fence, variant titles listed)", async () => {
    const result = await handler({ name: "ln-fake" });
    const text = result.content[0].text;
    assert.ok(!result.isError);
    assert.match(text, /```html/);
    assert.match(text, /<div data-ln-fake="true"><\/div>/);
    assert.match(text, /Варијанта 1: Со икона/);
    assert.match(text, /Варијанта 2: Без икона/);
  });
});
