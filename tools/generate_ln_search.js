import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_search";

export const definition = {
	title: "Generate ln-ashlar Search Input",
	description:
		"Генерира самостоен Search инпут снипет со data-ln-search од темплејтот во _src/components/search.html. " +
		"Овој снипет може да се користи самостојно, во поповери или во навигациски ленти.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за search контејнерот"),
		target_id: z.string().describe("ID на целната табела или листа што се пребарува (data-ln-search)"),
		search_items: z.string().default("label").describe("Полиња за пребарување (data-ln-search-items)"),
		placeholder: z.string().default("Пребарај...").describe("Текст во полето (placeholder)"),
		label: z.string().default("Пребарај").describe("ARIA label за пристапност")
	}
};

export const handler = async ({
	id,
	target_id,
	search_items = "label",
	placeholder = "Пребарај...",
	label = "Пребарај"
}) => {
	const searchTpl = loadTemplate("components/search.html");

	const htmlOutput = compileTemplate(searchTpl, {
		id,
		target_id,
		search_items,
		placeholder,
		label
	});

	return {
		content: [
			{
				type: "text",
				text: `\`\`\`html\n${htmlOutput}\n\`\`\``
			}
		]
	};
};
