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
});

describe("parseDoc — markup extraction", () => {
  test("extracts base markup and variants", () => {
    const md = [
      "## 2. Минимален HTML Маркап и Варијанти на Употреба",
      "",
      "### Базен HTML Маркап",
      "",
      "```html",
      "<div data-ln-fake=\"true\"></div>",
      "```",
      "",
      "### Варијанта 1: Со икона",
      "",
      "```html",
      "<div data-ln-fake=\"true\"><i></i></div>",
      "```",
      "",
      "### Варијанта 2: Без икона",
      "",
      "```html",
      "<div data-ln-fake=\"true\"></div>",
      "```"
    ].join("\n");

    const { markup } = parseDoc(md);
    assert.equal(markup.base.code, '<div data-ln-fake="true"></div>');
    assert.equal(markup.base.lang, "html");
    assert.equal(markup.variants.length, 2);
    assert.equal(markup.variants[0].title, "Варијанта 1: Со икона");
    assert.equal(markup.variants[0].lang, "html");
    assert.match(markup.variants[0].code, /<i><\/i>/);
  });

  test("treats a single html block with no ### subheadings as base", () => {
    const md = [
      "## 2. Комплетен HTML Маркап",
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
      "## 2. Минимален HTML Маркап и Варијанти на Употреба",
      "",
      "### Базен HTML Маркап",
      "",
      "```js",
      "import { lnFake } from \"ln-ashlar\";",
      "```",
      "",
      "### Варијанта 1: Со опции",
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
      "## 2. Минимален HTML Маркап и Варијанти на Употреба",
      "",
      "### Базен HTML Маркап",
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

describe("parseDoc — table extraction", () => {
  test("extracts attribute table rows", () => {
    const md = [
      "## 3. Декларативен API Договор (Атрибути и Настани)",
      "",
      "### Табела со Атрибути",
      "",
      "| Атрибут | Елемент | Тип / Вредности | Стандардна вредност | Опис |",
      "| --- | --- | --- | --- | --- |",
      "| `data-ln-fake-action` | `div` | `string` | `none` | Акција при клик |"
    ].join("\n");

    const { attributes } = parseDoc(md);
    assert.equal(attributes.length, 1);
    assert.equal(attributes[0].attribute, "data-ln-fake-action");
    assert.equal(attributes[0].element, "div");
    assert.equal(attributes[0].description, "Акција при клик");
  });

  test("extracts events table rows with direction", () => {
    const md = [
      "## 3. Декларативен API Договор (Атрибути и Настани)",
      "",
      "### Настани (Events API)",
      "",
      "| Настан | Насока | Cancelable | Опис | `detail` Објект |",
      "| --- | --- | --- | --- | --- |",
      "| `ln:fake:activate` | Емитува | Да | Fires on activate | `{ id }` |",
      "| `ln:fake:refresh` | Слуша | Не | Listens for refresh | `{}` |"
    ].join("\n");

    const { events } = parseDoc(md);
    assert.equal(events.length, 2);
    assert.equal(events[0].event, "ln:fake:activate");
    assert.equal(events[0].direction, "Емитува");
    assert.equal(events[1].direction, "Слуша");
  });

  test("extracts scss api table rows", () => {
    const md = [
      "## 3. SCSS API (Миксини, Класи и Токени)",
      "",
      "| Име | Вид | Параметри / Вредности | Опис |",
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
      "## 3. Вклучени Компоненти",
      "",
      "| Компонента | Улога во патернот |",
      "| --- | --- |",
      "| `ln-fake` | Главна компонента |"
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
