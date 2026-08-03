// tools/snippets/template_engine.js
//
// Вчитување и рендерирање на чистите HTML темплејти од `_src/`.
//
// Два вида замена, со различни правила за безбедност:
//   `data`  — {{key}} променливи. Escape-ирани СЕКОГАШ, освен ако вредноста е
//             обвиткана со raw(). Така корисничкиот текст не може да излезе од
//             атрибут или да вметне markup.
//   `slots` — <!-- KEY_SLOT -->. Секогаш raw, бидејќи слотовите примаат
//             веќе-генериран markup од другите builder-и. Содржината се
//             ре-индентира според позицијата на слот коментарот.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Патека релативна на ОВОЈ модул, не на process.cwd() — серверот и тестовите
// може да се стартуваат од било кој директориум.
const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "_src");

const RAW = Symbol("ln.raw");

/**
 * Означи вредност како веќе-безбеден HTML што НЕ треба да се escape-ира.
 * Користи го за атрибут-фрагменти и вгнезден markup:
 *   compileTemplate(tpl, { hidden_attr: raw(" hidden"), title: userInput })
 * @param {string} value
 * @returns {{[RAW]: true, value: string}}
 */
export function raw(value) {
	return { [RAW]: true, value: value == null ? "" : String(value) };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isRaw(value) {
	return Boolean(value) && typeof value === "object" && value[RAW] === true;
}

/**
 * Escape за HTML текстуална содржина и за вредности во двојни наводници.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
	if (value == null) return "";
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Разреши вредност во финален стринг: raw() поминува, сè друго се escape-ира.
 * @param {unknown} value
 * @returns {string}
 */
function resolveValue(value) {
	if (isRaw(value)) return value.value;
	return escapeHtml(value);
}

/**
 * Вчитува чист HTML темплејт од `_src/`.
 * @param {string} relativePath на пр. 'base/page-shell.html'
 * @returns {string}
 */
export function loadTemplate(relativePath) {
	const filePath = path.join(SRC_DIR, relativePath);
	if (!fs.existsSync(filePath)) {
		throw new Error(`Темплејт фајлот не постои: ${filePath}`);
	}
	return fs.readFileSync(filePath, "utf-8");
}

/**
 * Нормализира водечка празнина во TABS. Мешани префикси (`\t  `) се
 * разрешуваат детерминистички: табовите се шират на 2 спејса, потоа секои
 * 2 спејса стануваат TAB. Празните редови остануваат празни.
 * @param {string} code
 * @returns {string}
 */
export function indentWithTabs(code) {
	if (!code) return "";
	return code
		.split("\n")
		.map((line) => {
			const match = line.match(/^[ \t]+/);
			if (!match) return line;
			const expanded = match[0].replace(/\t/g, "  ").length;
			return "\t".repeat(Math.ceil(expanded / 2)) + line.slice(match[0].length);
		})
		.join("\n");
}

/**
 * Префиксира секој непразен ред со `depth` табови. Се користи при вметнување
 * на вгнезден блок за да не се изгуби хиерархијата.
 * @param {string} html
 * @param {number} depth
 * @returns {string}
 */
export function indentBlock(html, depth) {
	if (!html || depth <= 0) return html ?? "";
	const pad = "\t".repeat(depth);
	return html
		.split("\n")
		.map((line) => (line.trim() ? pad + line : line))
		.join("\n");
}

/**
 * Ре-индентира блок според веќе постоечкиот префикс на слот коментарот.
 * @param {string} html
 * @param {string} prefix водечката празнина на редот со слотот
 * @returns {string}
 */
function reindentToPrefix(html, prefix) {
	const lines = html.split("\n");
	// Првиот ред го наследува префиксот од самиот слот коментар.
	return lines.map((line, i) => (i === 0 ? line : line.trim() ? prefix + line : line)).join("\n");
}

/**
 * Ги гради двата прифатени облика на слот маркер за дадено име.
 * @param {string} name
 * @returns {string[]}
 */
function slotMarkers(name) {
	return [`<!-- ${name.toUpperCase()}_SLOT -->`, `<!-- SLOT:${name} -->`];
}

/**
 * Замена на буквален маркер со функциски replacer — така `$&`, `` $` `` и `$'`
 * во вредноста остануваат буквални наместо да се толкуваат како replacement
 * patterns.
 * @param {string} source
 * @param {string} marker
 * @param {(prefix: string) => string} produce прима водечка празнина на редот
 * @returns {string}
 */
function replaceMarker(source, marker, produce) {
	if (!source.includes(marker)) return source;
	const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	// Го фаќаме и водечкиот whitespace за да знаеме на која длабочина сме.
	const pattern = new RegExp(`([ \\t]*)${escaped}`, "g");
	return source.replace(pattern, (_match, prefix) => prefix + produce(prefix));
}

/**
 * Комплетно рендерирање на темплејт со променливи и слотови.
 *
 * @param {string} templateStr HTML стрингот на темплејтот
 * @param {Record<string, unknown>} [data] {{key}} променливи (escape-ирани освен raw())
 * @param {Record<string, string>} [slots] <!-- KEY_SLOT --> содржина (секогаш raw)
 * @returns {string} финален HTML со TAB индентација
 */
export function compileTemplate(templateStr, data = {}, slots = {}) {
	let result = templateStr;

	// 1. Слотови — raw содржина, ре-индентирана според позицијата на маркерот.
	//    Празнината околу слот содржината никогаш не носи значење, па се сече —
	//    инаку вгнездените builder-и оставаат празни редови по себе.
	for (const [slotName, slotValue] of Object.entries(slots)) {
		const value = (slotValue ?? "").replace(/^\s*\n/, "").replace(/\s+$/, "");
		for (const marker of slotMarkers(slotName)) {
			// Празен слот на сопствен ред — тргни го целиот ред, не остава празнина.
			if (!value) {
				const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				result = result.replace(new RegExp(`^[ \\t]*${escaped}[ \\t]*\\n`, "gm"), "");
			}
			result = replaceMarker(result, marker, (prefix) => reindentToPrefix(value, prefix));
		}
	}

	// 2. Неисполнетите слотови се бришат заедно со нивниот ред кога се сами.
	result = result.replace(/^[ \t]*<!-- [A-Z0-9_]+_SLOT -->[ \t]*\n/gm, "");
	result = result.replace(/^[ \t]*<!-- SLOT:[a-zA-Z0-9_]+ -->[ \t]*\n/gm, "");
	result = result.replace(/<!-- [A-Z0-9_]+_SLOT -->/g, "");
	result = result.replace(/<!-- SLOT:[a-zA-Z0-9_]+ -->/g, "");

	// 3. {{key}} променливи — САМО декларираните клучеви. Неисполнетите остануваат
	//    недопрени: `{{ price }}` е валидна ln-ashlar fillTemplate синтакса
	//    (види ln-table.md, data-driven row template), а корисничката содржина
	//    може да носи Blade/Vue изрази.
	for (const [key, value] of Object.entries(data)) {
		const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const varPattern = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, "g");
		const resolved = resolveValue(value);
		result = result.replace(varPattern, () => resolved);
	}

	// Трејлинг празнина никогаш не носи значење, а се насобира при вгнездување.
	return indentWithTabs(result).replace(/\s+$/, "");
}
