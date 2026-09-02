import { z } from "zod";
import { loadTemplate, compileTemplate, raw } from "./snippets/template_engine.js";
import { attr } from "./snippets/builders.js";
import { ATTR } from "./snippets/attributes.generated.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_search";

export const definition = {
	title: "Generate ln-ashlar Search Input",
	description:
		ROUTER_FIRST_HINT +
		"Генерира search инпут. data-ln-search го носи ID на целниот контејнер, а data-ln-search-items е " +
		"CSS СЕЛЕКТОР за децата што се филтрираат (на пр. 'tbody tr', 'li') — не листа на полиња.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за search контејнерот"),
		target_id: z.string().describe("ID на целната табела/листа што се филтрира (вредност на data-ln-search)"),
		search_items: z
			.string()
			.default("tbody tr")
			.describe("CSS селектор за ставките што се филтрираат (на пр. 'tbody tr', 'li', '.ln-card')"),
		placeholder: z.string().default("Пребарај...").describe("Placeholder текст"),
		label: z.string().default("Пребарај").describe("ARIA label за пристапност")
	}
};

export const handler = async ({ id, target_id, search_items = "tbody tr", placeholder, label }) =>
	htmlResult(
		compileTemplate(loadTemplate("components/search.html"), {
			id,
			target_id,
			search_items,
			placeholder,
			label
		})
	);

