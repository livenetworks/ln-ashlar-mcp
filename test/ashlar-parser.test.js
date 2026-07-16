import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../tools/ashlar/frontmatter.js";
import { parseDoc, parseTable } from "../tools/ashlar/parser.js";

describe("parseFrontmatter", () => {
  test("parses flat scalars", () => {
    const md = "---\nname: ln-fake\nstatus: stable\n---\nBody text";
    const { data, body } = parseFrontmatter(md);
    assert.equal(data.name, "ln-fake");
    assert.equal(data.status, "stable");
    assert.equal(body, "Body text");
  });

  test("parses inline lists", () => {
    const md = "---\ntags: [a, b, c]\n---\nBody";
    const { data } = parseFrontmatter(md);
    assert.deepEqual(data.tags, ["a", "b", "c"]);
  });

  test("parses block lists", () => {
    const md = "---\ntags:\n  - a\n  - b\n---\nBody";
    const { data } = parseFrontmatter(md);
    assert.deepEqual(data.tags, ["a", "b"]);
  });

  test("returns null data when no frontmatter present", () => {
    const md = "# Just a heading\n\nSome body.";
    const { data, body } = parseFrontmatter(md);
    assert.equal(data, null);
    assert.equal(body, md);
  });

  test("strips surrounding quotes from scalars", () => {
    const md = '---\nsummary: "quoted value"\n---\nBody';
    const { data } = parseFrontmatter(md);
    assert.equal(data.summary, "quoted value");
  });

  test("source may be a block list (array support)", () => {
    const md = "---\nsource:\n  - js/ln-fake/a.js\n  - js/ln-fake/b.js\n---\nBody";
    const { data } = parseFrontmatter(md);
    assert.deepEqual(data.source, ["js/ln-fake/a.js", "js/ln-fake/b.js"]);
  });
});

describe("parseDoc — section splitting", () => {
  test("splits ## and ### headings, is immune to headings inside fenced code", () => {
    const md = [
      "## 1. First",
      "Text one.",
      "### 1a. Nested",
      "Nested text.",
      "```",
      "## not a heading",
      "```",
      "## 2. Second",
      "Text two."
    ].join("\n");

    const { sections } = parseDoc(md);
    const titles = sections.map((s) => s.rawTitle);
    assert.deepEqual(titles, ["1. First", "1a. Nested", "2. Second"]);

    const first = sections.find((s) => s.rawTitle === "1. First");
    assert.match(first.text, /## not a heading/);

    const second = sections.find((s) => s.rawTitle === "2. Second");
    assert.equal(second.number, 2);
    assert.equal(second.text, "Text two.");
  });

  test("guide/doctrine/skill: '## Summary' is detected as the first top-level section", () => {
    const md = ["## Summary", "", "2-3 sentences.", "", "---", "", "Free-form body."].join("\n");
    const { sections } = parseDoc(md);
    const top = sections.filter((s) => s.level === 2);
    assert.equal(top[0].title, "Summary");
  });
});

describe("parseDoc — markup extraction", () => {
  test("extracts base markup and variants", () => {
    const md = [
      "## 2. Minimal HTML Markup & Usage Variants",
      "",
      "### Base HTML Markup",
      "",
      "```html",
      "<div data-ln-fake=\"true\"></div>",
      "```",
      "",
      "### Variant 1: With Icon",
      "",
      "```html",
      "<div data-ln-fake=\"true\"><i></i></div>",
      "```",
      "",
      "### Variant 2: Without Icon",
      "",
      "```html",
      "<div data-ln-fake=\"true\"></div>",
      "```"
    ].join("\n");

    const { markup } = parseDoc(md);
    assert.equal(markup.base.code, '<div data-ln-fake="true"></div>');
    assert.equal(markup.base.lang, "html");
    assert.equal(markup.variants.length, 2);
    assert.equal(markup.variants[0].title, "Variant 1: With Icon");
    assert.equal(markup.variants[0].lang, "html");
    assert.match(markup.variants[0].code, /<i><\/i>/);
  });

  test("treats a single html block with no ### subheadings as base", () => {
    const md = [
      "## 2. Complete HTML Markup",
      "",
      "```html",
      "<div data-ln-pattern=\"fake\"></div>",
      "```"
    ].join("\n");

    const { markup } = parseDoc(md);
    assert.equal(markup.base.code, '<div data-ln-pattern="fake"></div>');
    assert.equal(markup.base.lang, "html");
    assert.equal(markup.variants.length, 0);
  });

  test("service classification: base extracted with lang js, javascript label normalizes to js", () => {
    const md = [
      "---",
      "classification: service",
      "---",
      "## 2. Minimal HTML Markup & Usage Variants",
      "",
      "### Base HTML Markup",
      "",
      "```js",
      "import { lnFake } from \"ln-ashlar\";",
      "```",
      "",
      "### Variant 1: With Options",
      "",
      "```javascript",
      "lnFake.init({ debug: true });",
      "```"
    ].join("\n");

    const { markup } = parseDoc(md);
    assert.equal(markup.base.lang, "js");
    assert.match(markup.base.code, /import \{ lnFake \}/);
    assert.equal(markup.variants.length, 1);
    assert.equal(markup.variants[0].lang, "js");
    assert.match(markup.variants[0].code, /lnFake\.init/);
  });

  test("a js block in a NON-service doc's §2 is ignored by the parser", () => {
    const md = [
      "## 2. Minimal HTML Markup & Usage Variants",
      "",
      "### Base HTML Markup",
      "",
      "```js",
      "shouldBeIgnored();",
      "```"
    ].join("\n");

    const { markup } = parseDoc(md);
    assert.equal(markup.base, null);
    assert.equal(markup.variants.length, 0);
  });
});

describe("parseDoc — table extraction (English contract, subheading-located)", () => {
  test("extracts attribute table rows located under '### Attributes Table' inside §3", () => {
    const md = [
      "## 3. Declarative API Contract (Attributes & Events)",
      "",
      "### Attributes Table",
      "",
      "| Attribute | Element | Type / Values | Default | Description |",
      "| --- | --- | --- | --- | --- |",
      "| `data-ln-fake-action` | `div` | `string` | `none` | Action on click |"
    ].join("\n");

    const { attributes } = parseDoc(md);
    assert.equal(attributes.length, 1);
    assert.equal(attributes[0].attribute, "data-ln-fake-action");
    assert.equal(attributes[0].element, "div");
    assert.equal(attributes[0].description, "Action on click");
  });

  test("extracts events table rows located under '### Events API' inside §3, with Emits/Listens direction", () => {
    const md = [
      "## 3. Declarative API Contract (Attributes & Events)",
      "",
      "### Events API",
      "",
      "| Event | Direction | Cancelable | Description | `detail` Object |",
      "| --- | --- | --- | --- | --- |",
      "| `ln:fake:activate` | Emits | Yes | Fires on activate | `{ id }` |",
      "| `ln:fake:refresh` | Listens | No | Listens for refresh | `{}` |"
    ].join("\n");

    const { events } = parseDoc(md);
    assert.equal(events.length, 2);
    assert.equal(events[0].event, "ln:fake:activate");
    assert.equal(events[0].direction, "Emits");
    assert.equal(events[1].direction, "Listens");
  });

  test("attributes/events tables outside §3 (no matching parent §2 title) are not extracted", () => {
    const md = [
      "## 3. Something Else Entirely",
      "",
      "### Attributes Table",
      "",
      "| Attribute | Element | Type / Values | Default | Description |",
      "| --- | --- | --- | --- | --- |",
      "| `data-ln-x` | `div` | `string` | `none` | Should not be picked up |"
    ].join("\n");

    const { attributes } = parseDoc(md);
    assert.equal(attributes.length, 0);
  });

  test("extracts scss api table rows", () => {
    const md = [
      "## 3. SCSS API (Mixins, Classes & Tokens)",
      "",
      "| Name | Kind | Parameters / Values | Description |",
      "| --- | --- | --- | --- |",
      "| `fake-mixin` | mixin | `$size` | Applies sizing |"
    ].join("\n");

    const { scssApi } = parseDoc(md);
    assert.equal(scssApi.length, 1);
    assert.equal(scssApi[0].name, "fake-mixin");
    assert.equal(scssApi[0].kind, "mixin");
  });

  test("extracts included-components table rows", () => {
    const md = [
      "## 3. Included Components",
      "",
      "| Component | Role in the Pattern |",
      "| --- | --- |",
      "| `ln-fake` | Main component |"
    ].join("\n");

    const { includedComponents } = parseDoc(md);
    assert.equal(includedComponents.length, 1);
    assert.equal(includedComponents[0].component, "ln-fake");
  });

  test("parseTable is a generic GFM pipe table helper", () => {
    const lines = ["| A | B |", "| --- | --- |", "| 1 | 2 |"];
    const { columns, rows } = parseTable(lines);
    assert.deepEqual(columns, ["A", "B"]);
    assert.deepEqual(rows, [["1", "2"]]);
  });

  test("Events header cell keeps its backticks: '`detail` Object'", () => {
    const md = [
      "## 3. Declarative API Contract (Attributes & Events)",
      "",
      "### Events API",
      "",
      "| Event | Direction | Cancelable | Description | `detail` Object |",
      "| --- | --- | --- | --- | --- |",
      "| `ln:x:y` | Emits | No | . | `{}` |"
    ].join("\n");
    const { columns } = parseTable(md.split("\n").slice(4));
    assert.equal(columns[4], "`detail` Object");
  });
});

describe("parseDoc — link extraction", () => {
  test("extracts relative markdown links, ignores http and in-code links", () => {
    const md = [
      "See [broken](./ln-broken.md) and [css](../css/fake-css.md#anchor).",
      "Also see [external](https://example.com/x.md) which must be ignored.",
      "```",
      "[in-code](./ignored.md)",
      "```"
    ].join("\n");

    const { links } = parseDoc(md);
    assert.deepEqual(links, ["./ln-broken.md", "../css/fake-css.md"]);
  });
});
