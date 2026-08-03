import { z } from "zod";
import { loadTemplate, compileTemplate, escapeHtml } from "./snippets/template_engine.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_dropdown";

export const definition = {
	title: "Generate ln-ashlar Dropdown",
	description:
		ROUTER_FIRST_HINT +
		"Генерира dropdown мени: <div data-ln-dropdown> со <button data-ln-toggle-for> тригер " +
		"и <ul data-ln-toggle> мени, според канонскиот markup во ln-dropdown.md.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за dropdown-от"),
		trigger_label: z.string().default("Мени").describe("Текст на копчето за отворање"),
		items: z
			.array(
				z.object({
					title: z.string().optional().describe("Текст на опцијата"),
					href: z.string().optional().describe("URL — ако е зададено се рендерира како <a>"),
					current: z.boolean().optional().describe("Означува избрана ставка со aria-current='true'"),
					divider: z.boolean().optional().describe("Линија разделител наместо ставка")
				})
			)
			.describe("Листа на ставки во менито")
	}
};

export const handler = async ({ id, trigger_label = "Мени", items = [] }) => {
	const compiled = items.map((item) => {
		if (item.divider) return `\t<li><hr></li>`;
		const current = item.current ? ' aria-current="true"' : "";
		const label = escapeHtml(item.title ?? "");
		return item.href
			? `\t<li><a href="${escapeHtml(item.href)}"${current}>${label}</a></li>`
			: `\t<li><button type="button"${current}>${label}</button></li>`;
	});

	return htmlResult(
		compileTemplate(
			loadTemplate("components/dropdown.html"),
			{ id, trigger_label },
			{ items: compiled.join("\n") }
		)
	);
};
