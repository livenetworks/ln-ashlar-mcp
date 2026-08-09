import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { z } from "zod";

import { KNOWN_LN_ATTRS, ATTR } from "../tools/snippets/attributes.generated.js";
import { compileTemplate, raw, escapeHtml } from "../tools/snippets/template_engine.js";
import { buildCoordinator, buildTable, buildModal, buildField } from "../tools/snippets/builders.js";
import { configuredRoots } from "../tools/ashlar/corpus.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ATTR_RE = /data-ln-[a-z0-9-]+/g;

/** @param {string} dir @param {string[]} [acc] */
function walk(dir, acc = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, acc);
		else acc.push(full);
	}
	return acc;
}

/** Секој фајл што емитува markup: темплејтите, builder-ите и генераторите. */
function emittingFiles() {
	const files = walk(path.join(REPO_ROOT, "tools", "snippets", "_src"));
	files.push(path.join(REPO_ROOT, "tools", "snippets", "builders.js"));
	for (const f of fs.readdirSync(path.join(REPO_ROOT, "tools"))) {
		if (f.startsWith("generate_ln_") && f.endsWith(".js")) files.push(path.join(REPO_ROOT, "tools", f));
	}
	return files;
}

/** Изврши генератор низ zod, точно како што прави MCP серверот. */
async function runTool(toolFile, input) {
	const mod = await import(`../tools/${toolFile}`);
	const parsed = z.object(mod.definition.inputSchema).parse(input);
	const result = await mod.handler(parsed);
	return result.content[0].text.replace(/^```html\n/, "").replace(/\n```$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────

describe("attribute conformance", () => {
	test("ниту еден емитуван data-ln-* не е ghost", () => {
		const ghosts = new Map();
		for (const file of emittingFiles()) {
			const text = fs.readFileSync(file, "utf-8");
			for (const match of text.matchAll(ATTR_RE)) {
				if (KNOWN_LN_ATTRS.has(match[0])) continue;
				const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
				if (!ghosts.has(match[0])) ghosts.set(match[0], new Set());
				ghosts.get(match[0]).add(rel);
			}
		}
		const report = [...ghosts].map(([a, files]) => `${a} <- ${[...files].join(", ")}`).join("\n");
		assert.equal(
			ghosts.size,
			0,
			`Атрибути што ниту JS ниту SCSS во ln-ashlar не ги чита:\n${report}\n` +
				`Ако ln-ashlar навистина ги воведе, пушти \`npm run sync:ln-attrs\`.`
		);
	});

	test("allowlist-от е непразен и ги содржи носечките атрибути", () => {
		assert.ok(KNOWN_LN_ATTRS.size > 100, `премалку атрибути: ${KNOWN_LN_ATTRS.size}`);
		for (const a of ["data-ln-table", "data-ln-form", "data-ln-modal", "data-ln-data-coordinator"]) {
			assert.ok(KNOWN_LN_ATTRS.has(a), `недостасува ${a}`);
		}
	});
});

describe("attributes.generated.js е свеж", { skip: configuredRoots().length ? false : "корпусот не е конфигуриран" }, () => {
	test("--check не пријавува дрифт", async () => {
		try {
			execFileSync(process.execPath, [path.join(REPO_ROOT, "scripts", "sync-ln-attrs.js"), "--check"], {
				cwd: REPO_ROOT,
				stdio: "pipe"
			});
		} catch (err) {
			assert.fail(`attributes.generated.js е застарен — пушти \`npm run sync:ln-attrs\`.\n${err.stdout}`);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────

describe("template engine", () => {
	test("вредностите се escape-ираат — не може да се излезе од атрибут", () => {
		const out = compileTemplate('<input placeholder="{{p}}">', { p: 'a" onfocus=alert(1) x="' });
		assert.equal(out, '<input placeholder="a&quot; onfocus=alert(1) x=&quot;">');
		assert.ok(!out.includes('" onfocus'));
	});

	test("raw() поминува неescape-ирано", () => {
		assert.equal(compileTemplate("<ul{{a}}>", { a: raw(" hidden") }), "<ul hidden>");
	});

	test("$& и $` во вредност остануваат буквални", () => {
		assert.equal(compileTemplate("<h1>{{x}}</h1>", { x: "Cena 100$&USD" }), "<h1>Cena 100$&amp;USD</h1>");
		assert.equal(compileTemplate("<p><!-- B_SLOT --></p>", {}, { b: "A $` B" }), "<p>A $` B</p>");
	});

	test("{{ }} во slot содржина преживува — тоа е ln-ashlar fillTemplate синтакса", () => {
		const out = compileTemplate("<tr><!-- ROW_SLOT --></tr>", {}, { row: "<td>{{ price }}</td>" });
		assert.equal(out, "<tr><td>{{ price }}</td></tr>");
	});

	test("декларираните клучеви и понатаму се заменуваат", () => {
		assert.equal(compileTemplate("<i>{{a}} {{ b }}</i>", { a: "1", b: "2" }), "<i>1 2</i>");
	});

	test("вгнездената содржина се ре-индентира според слотот", () => {
		const out = compileTemplate("<div>\n\t<span>\n\t\t<!-- I_SLOT -->\n\t</span>\n</div>", {}, { i: "<b>x</b>\n<b>y</b>" });
		assert.equal(out, "<div>\n\t<span>\n\t\t<b>x</b>\n\t\t<b>y</b>\n\t</span>\n</div>");
	});

	test("нема мешани TAB+space префикси во излезот", async () => {
		const html = await runTool("generate_ln_crud_module.js", {
			id: "m",
			resource: "users",
			resource_title: "Корисници",
			resource_singular: "Корисник",
			columns: [{ field: "name", label: "Име", sortable: true }],
			form_fields: [{ name: "n", label: "Име", required: true }]
		});
		const mixed = html.split("\n").filter((l) => /^\t+ | +\t/.test(l));
		assert.deepEqual(mixed, [], `редови со мешана индентација:\n${mixed.join("\n")}`);
	});

	test("темплејтите се вчитуваат независно од cwd", () => {
		// Во дете-процес со друг cwd, не преку process.chdir(): мутирањето на cwd
		// на тековниот процес е видливо за секој друг тест што трча паралелно.
		// Свеж процес го тестира и вистинскиот пат — модулот се иницијализира од нула.
		const toolUrl = pathToFileURL(path.join(REPO_ROOT, "tools", "generate_ln_search.js")).href;
		const out = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`import(${JSON.stringify(toolUrl)})` +
					`.then((m) => m.handler({ id: "s", target_id: "t" }))` +
					`.then((r) => process.stdout.write(r.content[0].text))`
			],
			{ cwd: path.parse(REPO_ROOT).root, encoding: "utf-8" }
		);
		assert.match(out, /data-ln-search="t"/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────

describe("CRUD модулот произведува жив markup", () => {
	/** @type {string} */
	let html;
	/** Структурните проверки гледаат само вистински елементи — коментарите не се DOM. */
	let dom;

	test("генерирање", async () => {
		html = await runTool("generate_ln_crud_module.js", {
			id: "users-module",
			resource: "users",
			resource_title: "Корисници",
			resource_singular: "Корисник",
			api_url: "/api",
			columns: [
				{ field: "name", label: "Име", sortable: true, sort_type: "string" },
				{ field: "status", label: "Статус", filterable: true }
			],
			form_fields: [
				{ name: "name", label: "Име", type: "text", required: true },
				{ name: "role", label: "Улога", type: "select", options: [{ value: "a", label: "Админ" }] }
			]
		});
		assert.ok(html.length > 0);
		dom = html.replace(/<!--[\s\S]*?-->/g, "");
	});

	test("B1: ништо што содржи табела или модал не е hidden", () => {
		// Координаторот со деца не смее да носи hidden — тоа го криеше целиот модул.
		assert.doesNotMatch(dom, /<div[^>]*data-ln-data-coordinator[^>]*\shidden/);
		const coordinator = dom.slice(dom.indexOf("data-ln-data-coordinator"));
		assert.match(coordinator, /data-ln-table=/, "табелата мора да е внатре во координаторот");
	});

	test("B2: API конекторот има endpoint како вредност", () => {
		assert.match(html, /data-ln-api-connector/);
		assert.match(html, /data-ln-api-path="\/api\/users"/);
		assert.doesNotMatch(html, /data-ln-api-url/);
	});

	test("B3: индексите го користат точното име", () => {
		assert.match(html, /data-ln-data-store-indexes="/);
		assert.doesNotMatch(html, /data-ln-store-indexes=/);
	});

	test("B4: постои data-ln-modal-coordinator предок над тригерите и dialog-от", () => {
		const start = dom.indexOf("data-ln-modal-coordinator");
		assert.ok(start !== -1, "недостасува координаторот — тригерите би биле мртви");
		const scope = dom.slice(start);
		assert.match(scope, /data-ln-modal-for=/, "тригерот мора да е внатре во координаторот");
		assert.match(scope, /<dialog/, "dialog-от мора да е внатре во координаторот");
	});

	test("B5: data-ln-form-action-edit е патека, не булов атрибут", () => {
		assert.match(html, /data-ln-form-action-edit="\/api\/users\/:id"/);
		assert.match(html, /data-ln-form-action-method="PUT"/);
		assert.doesNotMatch(html, /data-ln-form-action-edit(?![=\w-])/);
	});

	test("B6: нема non-<li> деца во <ul>", () => {
		for (const block of dom.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g)) {
			const direct = block[1].replace(/<li\b[\s\S]*?<\/li>/g, "");
			assert.doesNotMatch(direct, /<(div|section|dialog|table|template|article)\b/, `невалидно дете во <ul>:\n${block[0].slice(0, 200)}`);
		}
	});

	test("B7: <select> ги задржува опциите низ zod", () => {
		const select = html.match(/<select[\s\S]*?<\/select>/);
		assert.ok(select, "нема <select>");
		assert.match(select[0], /<option value="a">Админ<\/option>/);
	});

	test("H1/H2: сортирањето и селекцијата се навистина вклучени", () => {
		// CRUD модулот е секогаш data-driven, па користи data-ln-sort, а не data-ln-table-sort
		assert.match(html, /data-ln-sort="users"/);
		assert.match(html, /data-ln-table-selectable/);
	});

	test("H3: filterable колоната го задржува data-ln-table-col", () => {
		const th = html.match(/<th[^>]*data-ln-table-filter-col[^>]*>/);
		assert.ok(th, "нема filterable колона");
		assert.match(th[0], /data-ln-table-col="status"/);
	});

	test("H4: row action го користи вистинскиот атрибут", () => {
		assert.match(html, /data-ln-table-row-action="edit"/);
		assert.match(html, /data-ln-fill-form="users-form"/);
		assert.doesNotMatch(html, /data-ln-table-row-edit/);
	});

	test("H5: empty state е <template data-ln-table-empty> внатре во табелата", () => {
		const table = dom.slice(dom.indexOf("data-ln-table="));
		assert.match(table, /<template data-ln-table-empty>/);
	});

	test("H6: речникот го користи buildDict образецот", () => {
		assert.match(html, /<ul hidden>/);
		assert.match(html, /data-ln-data-coordinator-dict="auth"/);
		assert.doesNotMatch(html, /data-ln-dict-key/);
	});

	test("H7: редовите носат data-ln-table-row-id", () => {
		assert.match(html, /<tr data-ln-table-row data-ln-table-row-id=/);
	});

	test("нема <a href='#'> копчиња за затворање", () => {
		assert.doesNotMatch(html, /<a href="#"[^>]*data-ln-modal-close/);
		assert.match(html, /<button type="button"[^>]*data-ln-modal-close/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────

describe("builders", () => {
	test("координатор без деца е компактен ul и смее да е hidden", () => {
		const html = buildCoordinator({ id: "c", resource: "users", apiPath: "/api/users" });
		assert.match(html, /<ul data-ln-data-coordinator id="c" hidden>/);
	});

	test("координатор со деца е div и НЕ е hidden", () => {
		const html = buildCoordinator({ id: "c", resource: "users", childrenHtml: "<p>x</p>" });
		assert.match(html, /<div data-ln-data-coordinator id="c">/);
		assert.doesNotMatch(html, /data-ln-data-coordinator[^>]*hidden/);
	});

	test("модалот по default се обвиткува во координатор, со wrap:false не", () => {
		assert.match(buildModal({ id: "m", title: "T" }), /data-ln-modal-coordinator/);
		assert.doesNotMatch(buildModal({ id: "m", title: "T", wrap: false }), /data-ln-modal-coordinator/);
	});

	test("поле без валидација не носи празна листа со грешки", () => {
		assert.doesNotMatch(buildField({ name: "a", label: "A" }, "f"), /data-ln-validate-errors/);
		assert.match(buildField({ name: "a", label: "A", required: true }, "f"), /data-ln-validate-errors/);
	});

	test("ред темплејтот се именува како {data-ln-table}-row", () => {
		const html = buildTable({ id: "t", name: "products", source: "products", columns: [{ field: "a", label: "A" }] });
		assert.match(html, /data-ln-template="products-row"/);
	});

	test("корисничкиот текст во колона label не може да инјектира markup", () => {
		const html = buildTable({ id: "t", name: "x", mode: "ssr", columns: [{ field: "a", label: '<script>alert(1)</script>' }] });
		assert.doesNotMatch(html, /<script>/);
		assert.match(html, /&lt;script&gt;/);
	});
});

describe("сите генератори враќаат валиден MCP envelope", () => {
	const samples = {
		"generate_ln_page.js": { title: "Тест" },
		"generate_ln_crud_module.js": {
			id: "m", resource: "users", resource_title: "К", resource_singular: "К",
			columns: [{ field: "n", label: "N" }], form_fields: [{ name: "n", label: "N" }]
		},
		"generate_ln_table.js": { id: "t", name: "u", columns: [{ field: "a", label: "A" }] },
		"generate_ln_form.js": { id: "f", action: "/api/x", fields: [{ name: "a", label: "A" }] },
		"generate_ln_modal.js": { id: "x-modal", title: "T" },
		"generate_ln_data_coordinator.js": { id: "c", resource: "u" },
		"generate_ln_dictionary.js": { component: "table", entries: [{ key: "k", value: "v" }] },
		"generate_ln_empty_state.js": { id: "e" },
		"generate_ln_card.js": { id: "c", title: "T", content: "<p>x</p>" },
		"generate_ln_search.js": { id: "s", target_id: "t" },
		"generate_ln_popover.js": { id: "p" },
		"generate_ln_accordion.js": { id: "a", panels: [{ title: "T", content: "<p>x</p>" }] },
		"generate_ln_tabs.js": { id: "tb", tabs: [{ key: "a", title: "A", content: "<p>x</p>" }] },
		"generate_ln_dropdown.js": { id: "d", items: [{ title: "A", href: "/a" }] },
		"generate_ln_upload.js": { id: "u", action_url: "/api/files" },
		"generate_ln_sort.js": { target: "users", fields: [{ field: "name", label: "Име" }] },
		"generate_ln_stat_card.js": { id: "sc", label: "L", value: "1" },
		"generate_ln_stepper.js": { id: "st", steps: [{ label: "Еден", status: "complete" }] },
		"generate_ln_timeline.js": { id: "tl", items: [{ title: "T", timestamp: "сега" }] }
	};

	const toolFiles = fs
		.readdirSync(path.join(REPO_ROOT, "tools"))
		.filter((f) => f.startsWith("generate_ln_") && f.endsWith(".js"));

	test("секој генератор има sample во тестот", () => {
		const missing = toolFiles.filter((f) => !(f in samples));
		assert.deepEqual(missing, [], `нов генератор без тест покриеност: ${missing.join(", ")}`);
	});

	for (const file of toolFiles) {
		test(file, async () => {
			const html = await runTool(file, samples[file] ?? {});
			assert.ok(html.trim().length > 0, "празен излез");
			assert.doesNotMatch(html, /undefined|\[object Object\]/, "протечена JS вредност");
			assert.doesNotMatch(html, /\s+$/, "трејлинг празнина");
		});
	}
});
