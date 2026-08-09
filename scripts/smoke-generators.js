#!/usr/bin/env node
// scripts/smoke-generators.js
//
// Рендерира ги СИТЕ generate_ln_* алатки со репрезентативен влез, со вклучен
// LN_STRICT_TEMPLATE. Две работи ги фаќа:
//
//   1. Генератор што воопшто не се рендерира (throw, или isError одговор).
//   2. Data клуч што темплејтот не го содржи — види template_engine.js.
//      Токму тоа помина незабележано кога `_src/tables/table.html` го изгуби
//      {{thead_attrs}}: builders.js го пресметуваше data-ln-sort, темплејтот
//      немаше каде да го стави, сортирањето беше мртво во секоја data-driven
//      табела, и НИТУ ЕДНА постоечка проверка не пријави ништо.
//
// Влезот е намерно минимален-но-репрезентативен: доволно за да се допре секоја
// гранка што емитува markup (sortable + filterable колона, select поле со
// опции, вгнездена содржина), не и целосно покритие. Ова не е тест-suite.
//
// Употреба: npm run smoke:generators     (exit 1 при наод)

process.env.LN_STRICT_TEMPLATE = "1";

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { z } from "zod";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS_DIR = path.join(REPO_ROOT, "tools");

const KNOWN_ICONS = new Set([
	"arrow-down", "arrow-up", "arrows-sort", "chevron-down", "cloud-upload",
	"edit", "filter", "inbox", "minus", "plus", "search", "x"
]);

const COLUMNS = [{ field: "name", label: "Име", sortable: true, filterable: true }];
const FIELDS = [
	{ name: "name", label: "Име", type: "text", required: true },
	{ name: "role", label: "Улога", type: "select", options: [{ label: "Админ", value: "admin" }] }
];

/** Репрезентативен влез по алатка. Нова generate_ln_* алатка МОРА да добие запис тука. */
const FIXTURES = {
	generate_ln_accordion: { id: "acc", panels: [{ title: "А", content: "<p>x</p>" }] },
	generate_ln_card: { id: "card", title: "Наслов", content: "<p>x</p>" },
	generate_ln_crud_module: {
		id: "users-module", resource: "users", resource_title: "Корисници",
		resource_singular: "Корисник", columns: COLUMNS, form_fields: FIELDS
	},
	generate_ln_data_coordinator: {
		id: "coord", resource: "users", store_id: "users",
		children_html: "<div>дете</div>", window: 50
	},
	generate_ln_dictionary: { component: "table", entries: [{ key: "k", value: "v" }] },
	generate_ln_dropdown: { id: "dd", trigger_label: "Мени", items: [{ title: "Ставка", href: "#x" }] },
	generate_ln_empty_state: { id: "empty" },
	generate_ln_form: { id: "form", action: "/api/users", fields: FIELDS },
	generate_ln_modal: { id: "modal", title: "Наслов", body_html: "<p>x</p>" },
	generate_ln_page: { title: "Страница" },
	generate_ln_popover: { id: "pop", content_html: "<p>x</p>" },
	generate_ln_search: { id: "search", target_id: "users" },
	generate_ln_sort: { target: "users", fields: [{ field: "name", label: "Име" }] },
	generate_ln_stat_card: { id: "stat", label: "Вкупно", value: "42", trend: "+12.5%", trend_direction: "up" },
	generate_ln_stepper: { id: "step", steps: [{ label: "Чекор" }] },
	generate_ln_table: {
		id: "tbl", name: "users", source: "users", columns: COLUMNS,
		empty_title: "Празно", modal_id: "m", form_id: "f"
	},
	generate_ln_tabs: { id: "tabs", tabs: [{ key: "info", title: "Инфо", content: "<p>x</p>" }] },
	generate_ln_timeline: { id: "tl", items: [{ title: "Настан", timestamp: "2026-01-01" }] },
	generate_ln_upload: { id: "up", name: "file", action_url: "/upload" }
};

async function main() {
	const generators = fs
		.readdirSync(TOOLS_DIR)
		.filter((f) => f.startsWith("generate_ln_") && f.endsWith(".js"))
		.map((f) => f.replace(/\.js$/, ""))
		.sort();

	const failures = [];

	// Нов генератор без фикстура е тивка дупка во покритието — пријави ја.
	for (const g of generators) {
		if (!FIXTURES[g]) failures.push(`${g}: нема фикстура во scripts/smoke-generators.js`);
	}
	for (const g of Object.keys(FIXTURES)) {
		if (!generators.includes(g)) failures.push(`${g}: фикстура за непостоечка алатка`);
	}

	let rendered = 0;
	for (const g of generators) {
		if (!FIXTURES[g]) continue;
		try {
			const mod = await import(pathToFileURL(path.join(TOOLS_DIR, `${g}.js`)).href);

			// Валидирај ја фикстурата наспроти вистинската zod схема ПРЕД да
			// повикаш. Без ова, фикстура со застарено име на поле (`target`
			// наместо `target_id`, `label` наменесто `title`) тивко поминува:
			// handler-от прима undefined, рендерира деградиран излез, и smoke-от
			// пријавува зелено додека реалниот пат воопшто не е допрен. MCP
			// секогаш валидира пред handler — оваа скрипта мора да го прави
			// истото за да мери нешто вистинско.
			const parsed = z.object(mod.definition.inputSchema).safeParse(FIXTURES[g]);
			if (!parsed.success) {
				const issue = parsed.error.issues[0];
				failures.push(`${g}: фикстурата не ја задоволува схемата — ${issue.path.join(".") || "(root)"}: ${issue.message}`);
				continue;
			}

			const result = await mod.handler(parsed.data);
			if (result?.isError) {
				failures.push(`${g}: врати isError — ${result.content?.[0]?.text?.slice(0, 120)}`);
				continue;
			}
			if (!result?.content?.[0]?.text) {
				failures.push(`${g}: празен одговор`);
				continue;
			}

			let text = result.content[0].text;
			if (g === "generate_ln_stat_card") {
				const extraDown = await mod.handler({ ...parsed.data, trend_direction: "down" });
				const extraNeutral = await mod.handler({ ...parsed.data, trend_direction: "neutral" });
				text += "\n" + (extraDown?.content?.[0]?.text || "") + "\n" + (extraNeutral?.content?.[0]?.text || "");
			}

			for (const m of text.matchAll(/#lnc?-([a-z0-9-]+)/g)) {
				if (!KNOWN_ICONS.has(m[1])) {
					failures.push(`${g}: непозната икона "#ln-${m[1]}" — ако е нова, додај ја во KNOWN_ICONS по проверка на tabler.io/icons`);
				}
			}

			rendered++;
		} catch (e) {
			failures.push(`${g}: ${e.message.slice(0, 200)}`);
		}
	}

	console.log(`smoke-generators: рендерирани ${rendered}/${generators.length} генератори (строг режим)`);

	if (!failures.length) {
		console.log("smoke-generators: договорот темплејт↔builder е цел ✓");
		return;
	}

	console.error(`\nsmoke-generators: ${failures.length} проблем(и):\n`);
	for (const f of failures) console.error(`  ${f}`);
	process.exit(1);
}

main();
