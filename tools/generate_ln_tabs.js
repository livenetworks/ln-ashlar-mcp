import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_tabs";

export const definition = {
	title: "Generate ln-ashlar Tabs",
	description:
		"Генерира ln-ashlar табови со панели од темплејтот во _src/components/tabs.html. " +
		"Поддржува URL hash синхронизација и избор на default таб.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за табовите"),
		default_tab: z.string().optional().describe("Клуч на подразбирливиот активен таб"),
		tabs: z
			.array(
				z.object({
					key: z.string().describe("Уникатен клуч на табот (на пр. 'info', 'settings')"),
					title: z.string().describe("Наслов на копчето за табот"),
					content: z.string().describe("HTML содржина за панелот на табот")
				})
			)
			.describe("Листа на табови и нивни содржини")
	}
};

export const handler = async ({ id, default_tab, tabs = [] }) => {
	const tabsTpl = loadTemplate("components/tabs.html");
	const activeKey = default_tab || tabs[0]?.key || "tab-1";

	const navLinks = tabs.map((tab) => {
		return `    <a href="#${id}:${tab.key}" data-ln-tab class="ln-tab-link">${tab.title}</a>`;
	});

	const panels = tabs.map((tab) => {
		const isHidden = tab.key === activeKey ? "" : ' class="hidden"';
		return `  <section data-ln-panel="${tab.key}"${isHidden}>
		${tab.content}
	</section>`;
	});

	const htmlOutput = compileTemplate(
		tabsTpl,
		{ id, default_tab: activeKey },
		{
			nav: navLinks.join("\n"),
			panels: panels.join("\n")
		}
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
