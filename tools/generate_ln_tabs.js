import { z } from "zod";
import { loadTemplate, compileTemplate, escapeHtml, indentBlock } from "./snippets/template_engine.js";
import { ATTR } from "./snippets/attributes.generated.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_tabs";

export const definition = {
	title: "Generate ln-ashlar Tabs",
	description:
		ROUTER_FIRST_HINT +
		"Генерира табови со панели. Со trigger='anchor' добиваш URL hash deep-linking (#id:key) " +
		"со гол data-ln-tab; со trigger='button' добиваш data-ln-tab='{key}'. " +
		"Неактивните панели носат class='hidden' — тоа е конвенцијата во ln-tabs.md.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за табовите"),
		trigger: z
			.enum(["anchor", "button"])
			.default("anchor")
			.describe("'anchor' = hash deep-linkable; 'button' = обични копчиња"),
		default_tab: z.string().optional().describe("Клуч на подразбирливиот активен таб"),
		tabs: z
			.array(
				z.object({
					key: z.string().describe("Уникатен клуч на табот (на пр. 'info', 'settings')"),
					title: z.string().describe("Наслов на копчето/линкот"),
					content: z.string().describe("HTML содржина за панелот")
				})
			)
			.min(1)
			.describe("Листа на табови и нивни содржини")
	}
};

export const handler = async ({ id, trigger = "anchor", default_tab, tabs = [] }) => {
	const activeKey = default_tab || tabs[0]?.key;

	const nav = tabs.map((tab) =>
		trigger === "anchor"
			? `\t<a href="#${escapeHtml(id)}:${escapeHtml(tab.key)}" ${ATTR.tab}>${escapeHtml(tab.title)}</a>`
			: `\t<button type="button" ${ATTR.tab}="${escapeHtml(tab.key)}">${escapeHtml(tab.title)}</button>`
	);

	const panels = tabs.map((tab) => {
		const hidden = tab.key === activeKey ? "" : ' class="hidden"';
		return `<section ${ATTR.panel}="${escapeHtml(tab.key)}"${hidden}>\n${indentBlock(tab.content, 1)}\n</section>`;
	});

	return htmlResult(
		compileTemplate(
			loadTemplate("components/tabs.html"),
			{ id, default_tab: activeKey },
			{ nav: nav.join("\n"), panels: panels.join("\n") }
		)
	);
};
