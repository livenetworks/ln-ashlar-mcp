import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_popover";

export const definition = {
	title: "Generate ln-ashlar Popover",
	description:
		"Генерира data-ln-popover контејнер снипет од темплејтот во _src/components/popover.html. " +
		"Може да содржи филтри, пребарување, листи или обична содржина. Се поврзува преку data-ln-popover-for.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за поповерот (се совпаѓа со data-ln-popover-for)"),
		custom_class: z.string().optional().describe("Дополнителни CSS класи"),
		hidden: z.boolean().default(false).describe("Дали поповерот е скриен по подразбирање"),
		content_html: z.string().optional().describe("Вгнездена HTML содржина (на пр. филтер или search снипет)")
	}
};

export const handler = async ({
	id,
	custom_class = "",
	hidden = false,
	content_html = ""
}) => {
	const popoverTpl = loadTemplate("components/popover.html");
	const customClassStr = custom_class ? ` ${custom_class}` : "";
	const hiddenAttr = hidden ? " hidden" : "";

	const htmlOutput = compileTemplate(
		popoverTpl,
		{
			id,
			custom_class: customClassStr,
			hidden_attr: hiddenAttr
		},
		{
			content: content_html
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
