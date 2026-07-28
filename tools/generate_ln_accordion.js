import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_accordion";

export const definition = {
	title: "Generate ln-ashlar Accordion",
	description:
		"Генерира ln-ashlar акордеон со N панели од темплејтот во _src/components/accordion.html.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за акордеон омотот"),
		panels: z
			.array(
				z.object({
					id: z.string().optional(),
					title: z.string().describe("Наслов на панелот"),
					content: z.string().describe("HTML содржина на панелот"),
					open: z.boolean().optional().describe("Дали панелот е почетно отворен")
				})
			)
			.describe("Листа на панели во акордеонот")
	}
};

export const handler = async ({ id, panels = [] }) => {
	const accTpl = loadTemplate("components/accordion.html");

	const compiledPanels = panels.map((panel, idx) => {
		const panelId = panel.id || `${id}-panel-${idx + 1}`;
		const openAttr = panel.open ? ' data-ln-toggle="open"' : " data-ln-toggle";
		return `  <li>
		<header data-ln-toggle-for="${panelId}" class="ln-accordion-header">
			${panel.title}
			<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-chevron-down"></use></svg>
		</header>
		<section id="${panelId}"${openAttr} class="ln-collapsible">
			<article class="ln-collapsible-body">
				${panel.content}
			</article>
		</section>
	</li>`;
	});

	const htmlOutput = compileTemplate(
		accTpl,
		{ id },
		{ panels: compiledPanels.join("\n") }
	);

	return {
		content: [
			{
				type: "text",
				text: `\`\`\`html\n${htmlOutput}\n\`\`\``
			}
		]
	};
};
