import { z } from "zod";
import { loadTemplate, compileTemplate, escapeHtml, indentBlock } from "./snippets/template_engine.js";
import { ATTR } from "./snippets/attributes.generated.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_accordion";

export const definition = {
	title: "Generate ln-ashlar Accordion",
	description:
		ROUTER_FIRST_HINT +
		"Генерира акордеон со N панели. Секој панел е <li> со <button data-ln-toggle-for> тригер " +
		"и <section data-ln-toggle> панел — data-ln-toggle носи 'open'/'closed' како состојба.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за акордеон омотот"),
		panels: z
			.array(
				z.object({
					id: z.string().optional().describe("Прилагоден ID за панелот"),
					title: z.string().describe("Наслов на панелот"),
					content: z.string().describe("HTML содржина на панелот"),
					open: z.boolean().optional().describe("Дали панелот е почетно отворен")
				})
			)
			.describe("Листа на панели")
	}
};

export const handler = async ({ id, panels = [] }) => {
	const compiled = panels.map((panel, i) => {
		const panelId = panel.id || `${id}-panel-${i + 1}`;
		// data-ln-toggle е СОСТОЈБА: 'open' | 'closed'. Гол атрибут не е валидна состојба.
		const state = panel.open ? "open" : "closed";
		return `\t<li>
		<button type="button" class="ln-accordion-header" ${ATTR.toggleFor}="${escapeHtml(panelId)}" aria-expanded="${panel.open ? "true" : "false"}">
			${escapeHtml(panel.title)}
			<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-chevron-down"></use></svg>
		</button>
		<section id="${escapeHtml(panelId)}" ${ATTR.toggle}="${state}" class="ln-collapsible">
			<article class="ln-collapsible-body">
${indentBlock(panel.content, 4)}
			</article>
		</section>
	</li>`;
	});

	return htmlResult(
		compileTemplate(loadTemplate("components/accordion.html"), { id }, { panels: compiled.join("\n") })
	);
};
