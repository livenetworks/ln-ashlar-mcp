#!/usr/bin/env node
// scripts/sync-ln-attrs.js
//
// Ја гради врската меѓу ln-ashlar кодот и HTML генераторите во tools/snippets.
//
// Генераторите НЕ смеат да го читаат ln-ashlar репозиториумот во runtime —
// configuredRoots() враќа [] кога корпусот не е конфигуриран (види
// test/knowledge-unconfigured.test.js), а серверот мора да работи и тогаш.
// Затоа овој скрипт се пушта рачно, а резултатот се КОМИТИРА.
//
// Употреба:
//   npm run sync:ln-attrs                        (чита DOCS_CORPUS_ROOTS / ASHLAR_DOCS_REPO)
//   npm run sync:ln-attrs -- --root=c:/path/to/ln-ashlar
//   npm run sync:ln-attrs -- --check             (не пишува; exit 1 ако има дрифт)
//
// Изворот на вистина е СЛОЈ 1 — `js/**` и `scss/**`, т.е. кодот што навистина
// чита атрибути. НЕ схемата: docs-mcp/schemas/ln-ashlar-attributes-schema.json
// заостанува зад кодот (нема data-ln-table-body, data-ln-table-store,
// data-ln-table-col-sort-icon иако ln-table ги чита).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { configuredRoots } from "../tools/ashlar/corpus.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(REPO_ROOT, "tools", "snippets", "attributes.generated.js");
const SCHEMA_REL = "docs-mcp/schemas/ln-ashlar-attributes-schema.json";

/** Каде во ln-ashlar репозиториумот се бараат атрибути (Слој 1). */
const SOURCE_DIRS = [
	{ dir: "js", exts: [".js", ".scss"] },
	{ dir: "scss", exts: [".scss"] }
];

const ATTR_RE = /data-ln-[a-z0-9-]+/g;

/**
 * Резолвирај ги ashlar repo root-овите: --root аргумент има предност,
 * инаку постоечкиот env механизам од tools/ashlar/corpus.js.
 * @param {string[]} argv
 * @returns {string[]}
 */
function resolveRoots(argv) {
	const explicit = argv
		.filter((a) => a.startsWith("--root="))
		.map((a) => a.slice("--root=".length).trim())
		.filter(Boolean);
	if (explicit.length) return explicit.map((r) => path.resolve(r));
	return configuredRoots().map((r) => path.resolve(r));
}

/**
 * @param {string} dir
 * @param {string[]} exts
 * @param {string[]} [acc]
 * @returns {string[]}
 */
function walk(dir, exts, acc = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return acc;
	}
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, exts, acc);
		else if (exts.includes(path.extname(entry.name))) acc.push(full);
	}
	return acc;
}

/**
 * Собери ги сите data-ln-* атрибути што ги чита кодот на ln-ashlar.
 * @param {string[]} roots
 * @returns {{ attrs: Set<string>, filesScanned: number, rootsUsed: string[] }}
 */
function collectFromCode(roots) {
	const attrs = new Set();
	const rootsUsed = [];
	let filesScanned = 0;

	for (const root of roots) {
		let touched = false;
		for (const { dir, exts } of SOURCE_DIRS) {
			const base = path.join(root, dir);
			if (!fs.existsSync(base)) continue;
			touched = true;
			for (const file of walk(base, exts)) {
				filesScanned++;
				const text = fs.readFileSync(file, "utf-8");
				for (const match of text.matchAll(ATTR_RE)) attrs.add(match[0]);
			}
		}
		if (touched) rootsUsed.push(root);
	}

	return { attrs, filesScanned, rootsUsed };
}

/**
 * Прочитај ги атрибутите декларирани во схемата — само за drift извештајот.
 * @param {string[]} roots
 * @returns {Set<string>}
 */
function collectFromSchema(roots) {
	const attrs = new Set();
	for (const root of roots) {
		const file = path.join(root, SCHEMA_REL);
		if (!fs.existsSync(file)) continue;
		let parsed;
		try {
			parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
		} catch {
			continue;
		}
		for (const component of Object.values(parsed.components ?? {})) {
			for (const attr of Object.keys(component.attributes ?? {})) attrs.add(attr);
		}
	}
	return attrs;
}

/**
 * data-ln-table-col-sort → tableColSort
 * @param {string} attr
 * @returns {string}
 */
function toSymbol(attr) {
	return attr
		.slice("data-ln-".length)
		.split("-")
		.filter(Boolean)
		.map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
		.join("");
}

/**
 * @param {Set<string>} attrs
 * @returns {string}
 */
function renderModule(attrs) {
	const sorted = [...attrs].sort();

	const bySymbol = new Map();
	for (const attr of sorted) {
		const symbol = toSymbol(attr);
		if (bySymbol.has(symbol)) {
			throw new Error(`Колизија на симбол "${symbol}": ${bySymbol.get(symbol)} и ${attr}`);
		}
		bySymbol.set(symbol, attr);
	}

	const entries = [...bySymbol].map(([symbol, attr]) => `\t${symbol}: "${attr}"`).join(",\n");
	const list = sorted.map((a) => `\t"${a}"`).join(",\n");

	return `// tools/snippets/attributes.generated.js
//
// ⚠ ГЕНЕРИРАН ФАЈЛ — НЕ УРЕДУВАЈ РАЧНО.
// Регенерирај со: npm run sync:ln-attrs
//
// Извор: ln-ashlar \`js/**\` + \`scss/**\` (кодот што навистина чита атрибути),
// НЕ docs-mcp схемата — таа заостанува зад кодот.
//
// Committed намерно: генераторите мора да работат и кога ln-ashlar репозиториумот
// не е достапен (configuredRoots() враќа [] — види test/knowledge-unconfigured.test.js).

/**
 * Симболички пристап до вистинските ln-ashlar атрибути.
 * Користи го во generate_ln_*.js наместо литерални стрингови.
 * @type {Readonly<Record<string, string>>}
 */
export const ATTR = Object.freeze({
${entries}
});

/**
 * Целото множество валидни ln-ashlar атрибути — го троши conformance тестот
 * во test/snippets.test.js за да ги фати ghost атрибутите во _src/**.html.
 * @type {ReadonlySet<string>}
 */
export const KNOWN_LN_ATTRS = new Set([
${list}
]);

/** Број на атрибути во моментот на генерирање. */
export const ATTR_COUNT = ${sorted.length};
`;
}

function main() {
	const argv = process.argv.slice(2);
	const checkOnly = argv.includes("--check");
	const roots = resolveRoots(argv);

	if (!roots.length) {
		console.error(
			"sync-ln-attrs: нема конфигуриран ln-ashlar root.\n" +
				"  Постави DOCS_CORPUS_ROOTS или ASHLAR_DOCS_REPO, или подај --root=<патека>."
		);
		process.exit(1);
	}

	const { attrs, filesScanned, rootsUsed } = collectFromCode(roots);

	if (!rootsUsed.length) {
		console.error(
			`sync-ln-attrs: ниту еден root нема js/ или scss/ поддиректориум: ${roots.join(", ")}`
		);
		process.exit(1);
	}
	if (!attrs.size) {
		console.error(`sync-ln-attrs: скенирани ${filesScanned} фајлови, но не е најден ниту еден data-ln-* атрибут.`);
		process.exit(1);
	}

	const module = renderModule(attrs);
	const previous = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf-8") : null;
	const changed = previous !== module;

	// Drift извештај: схема наспроти код.
	const schemaAttrs = collectFromSchema(roots);
	const inSchemaNotInCode = [...schemaAttrs].filter((a) => !attrs.has(a)).sort();
	const inCodeNotInSchema = [...attrs].filter((a) => !schemaAttrs.has(a)).sort();

	console.log(`sync-ln-attrs: root(s): ${rootsUsed.join(", ")}`);
	console.log(`  скенирани фајлови: ${filesScanned}`);
	console.log(`  атрибути во кодот: ${attrs.size}`);
	console.log(`  атрибути во схемата: ${schemaAttrs.size}`);

	if (inSchemaNotInCode.length) {
		console.log(`\n  ⚠ во СХЕМАТА, нема во кодот (${inSchemaNotInCode.length}) — можни ln-ashlar докс багови:`);
		for (const a of inSchemaNotInCode) console.log(`      ${a}`);
	}
	if (inCodeNotInSchema.length) {
		console.log(`\n  ⚠ во КОДОТ, нема во схемата (${inCodeNotInSchema.length}) — схемата заостанува:`);
		for (const a of inCodeNotInSchema) console.log(`      ${a}`);
	}

	if (checkOnly) {
		if (changed) {
			console.error("\nsync-ln-attrs --check: attributes.generated.js е застарен. Пушти `npm run sync:ln-attrs`.");
			process.exit(1);
		}
		console.log("\nsync-ln-attrs --check: свеж ✓");
		return;
	}

	if (!changed) {
		console.log("\nsync-ln-attrs: без промени ✓");
		return;
	}

	fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
	fs.writeFileSync(OUT_FILE, module, "utf-8");
	console.log(`\nsync-ln-attrs: запишан ${path.relative(REPO_ROOT, OUT_FILE)} (${attrs.size} атрибути)`);
}

main();
