#!/usr/bin/env node
// scripts/lint-snippets.js
//
// Conformance: секој data-ln-* што го емитува генератор МОРА да постои во
// ln-ashlar.
//
// Ова е втората половина од договорот што го чува sync-ln-attrs.js.
// sync:ln-attrs --check гарантира дека attributes.generated.js е свеж наспроти
// ln-ashlar. ОВАА скрипта гарантира дека _src/**.html и builders-ите користат
// само атрибути од тој сет. Без неа, снипет со избришан или измислен атрибут
// изгледа точно, не фрла никаде, и тивко не работи кај корисникот.
//
// Порано ова беше test/snippets.test.js. Тестовите се тргнати; проверката не
// смее да си оди со нив — таа е единственото нешто што ги држи генераторите
// врзани за реалноста.
//
// Употреба: npm run lint:snippets     (exit 1 при наод)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { KNOWN_LN_ATTRS, ATTR } from "../tools/snippets/attributes.generated.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ATTR_RE = /data-ln-[a-z0-9-]+/g;
const ATTR_REF_RE = /\bATTR\.([a-zA-Z0-9_]+)\b/g;

/** Директориуми што се скенираат, релативно на коренот на репото. */
const SCAN = [
	{ dir: "tools/snippets/_src", exts: [".html"] },
	{ dir: "tools/snippets", exts: [".js"] },
	{ dir: "tools", exts: [".js"] }
];

/** Генерираниот фајл ги СОДРЖИ сите атрибути по дефиниција — не се проверува сам. */
const SKIP_FILES = new Set([path.join(REPO_ROOT, "tools", "snippets", "attributes.generated.js")]);

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

function main() {
	const files = new Set();
	for (const { dir, exts } of SCAN) {
		for (const f of walk(path.join(REPO_ROOT, dir), exts)) {
			if (!SKIP_FILES.has(f)) files.add(f);
		}
	}

	const ghosts = new Map(); // attr -> Set<relPath>
	const undefinedAttrs = new Map(); // prop -> Set<relPath>
	let scanned = 0;

	for (const file of files) {
		scanned++;
		const text = fs.readFileSync(file, "utf-8");

		// 1. Ghost data-ln-* attributes check
		for (const match of text.matchAll(ATTR_RE)) {
			if (KNOWN_LN_ATTRS.has(match[0])) continue;
			if (!ghosts.has(match[0])) ghosts.set(match[0], new Set());
			ghosts.get(match[0]).add(path.relative(REPO_ROOT, file));
		}

		// 2. Undefined ATTR property reference check (JS files only)
		if (path.extname(file) === ".js") {
			for (const match of text.matchAll(ATTR_REF_RE)) {
				const prop = match[1];
				if (prop in ATTR) continue;
				if (!undefinedAttrs.has(prop)) undefinedAttrs.set(prop, new Set());
				undefinedAttrs.get(prop).add(path.relative(REPO_ROOT, file));
			}
		}
	}

	console.log(`lint-snippets: скенирани ${scanned} фајлови наспроти ${KNOWN_LN_ATTRS.size} познати атрибути`);

	let hasErrors = false;

	if (ghosts.size > 0) {
		hasErrors = true;
		console.error(`\nlint-snippets: ${ghosts.size} атрибут(и) што НЕ постојат во ln-ashlar:\n`);
		for (const [attr, where] of [...ghosts].sort()) {
			console.error(`  ${attr}`);
			for (const f of [...where].sort()) console.error(`      ${f}`);
		}
		console.error(
			"\nСекој од нив е тивко скршен снипет. Или е печатна грешка, или ln-ashlar\n" +
				"го избришал атрибутот. Ако е второто — пушти `npm run sync:ln-attrs`\n" +
				"и поправи го генераторот што сè уште го емитува."
		);
	}

	if (undefinedAttrs.size > 0) {
		hasErrors = true;
		console.error(`\nlint-snippets: ${undefinedAttrs.size} невалидна ATTR.* референца(и) во JS генераторите:\n`);
		for (const [prop, where] of [...undefinedAttrs].sort()) {
			console.error(`  ATTR.${prop} (evaluates to undefined)`);
			for (const f of [...where].sort()) console.error(`      ${f}`);
		}
		console.error(
			"\nСекоја од овие референци се обидува да пристапи до негенериран или избришан атрибут.\n" +
				"Поправете ги овие референци во соодветните генератори."
		);
	}

	if (hasErrors) {
		process.exit(1);
	}

	console.log("lint-snippets: нема ghost атрибути или невалидни ATTR референци ✓");
}

main();
