import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_dictionary";

export const definition = {
	title: "Generate ln-ashlar Dictionary",
	description:
		"Генерира <ul hidden data-ln-dictionary> речник со li ставки за преводи, " +
		"системски пораки и грешки според ln-ashlar конвенциите.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за речникот (на пр. 'app-dictionary')"),
		name: z.string().default("messages").describe("Име на речникот"),
		entries: z
			.array(
				z.object({
					key: z.string().describe("Клуч на пораката (на пр. 'auth', 'network', 'conflict', 'rejected')"),
					value: z.string().describe("Текст на пораката")
				})
			)
			.describe("Листа на парови клуч-порака во речникот")
	}
};

export const handler = async ({ id, name = "messages", entries = [] }) => {
	const dictTpl = loadTemplate("components/dictionary.html");

	const items = entries.map(
		(e) => `  <li data-ln-dict-key="${e.key}">${e.value}</li>`
	);

	const htmlOutput = compileTemplate(
		dictTpl,
		{
			id,
			name
		},
		{
			items: items.join("\n")
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
