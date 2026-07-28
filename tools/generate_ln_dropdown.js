import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_dropdown";

export const definition = {
	title: "Generate ln-ashlar Dropdown",
	description:
		"Генерира ln-ashlar dropdown мени од темплејтот во _src/components/dropdown.html.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за dropdown менито"),
		trigger_label: z.string().default("Мени").describe("Текст на копчето за отворање"),
		items: z
			.array(
				z.object({
					title: z.string().describe("Текст на опцијата"),
					href: z.string().optional().describe("URL линк (ако е линк)"),
					divider: z.boolean().optional().describe("Дали да вметне линија разделител")
				})
			)
			.describe("Листа на ставки во менито")
	}
};

export const handler = async ({ id, trigger_label = "Мени", items = [] }) => {
	const dropdownTpl = loadTemplate("components/dropdown.html");

	const menuItems = items.map((item) => {
		if (item.divider) {
			return `    <li><hr class="ln-dropdown-divider"></li>`;
		}
		if (item.href) {
			return `    <li><a href="${item.href}" class="ln-dropdown-item">${item.title}</a></li>`;
		}
		return `    <li><button type="button" class="ln-dropdown-item">${item.title}</button></li>`;
	});

	const htmlOutput = compileTemplate(
		dropdownTpl,
		{
			id,
			trigger_label
		},
		{
			items: menuItems.join("\n")
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
