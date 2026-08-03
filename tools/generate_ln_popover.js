import { z } from "zod";
import { loadTemplate, compileTemplate, raw, escapeHtml } from "./snippets/template_engine.js";
import { flag } from "./snippets/builders.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_popover";

export const definition = {
	title: "Generate ln-ashlar Popover",
	description:
		ROUTER_FIRST_HINT +
		"Генерира data-ln-popover контејнер. Се отвора од тригер со data-ln-popover-for=\"{id}\". " +
		"Може да содржи филтри, пребарување или обична содржина.",
	inputSchema: {
		id: z.string().describe("Уникатен ID (се совпаѓа со data-ln-popover-for на тригерот)"),
		custom_class: z.string().optional().describe("Дополнителни CSS класи"),
		hidden: z.boolean().default(false).describe("Дали е скриен по подразбирање"),
		content_html: z.string().optional().describe("Вгнездена HTML содржина")
	}
};

export const handler = async ({ id, custom_class, hidden = false, content_html = "" }) =>
	htmlResult(
		compileTemplate(
			loadTemplate("components/popover.html"),
			{
				id,
				custom_class: raw(custom_class ? ` ${escapeHtml(custom_class)}` : ""),
				hidden_attr: raw(flag("hidden", hidden))
			},
			{ content: content_html }
		)
	);
