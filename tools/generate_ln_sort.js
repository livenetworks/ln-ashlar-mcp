import { z } from "zod";
import { buildSortControl } from "./snippets/builders.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_sort";

export const definition = {
	title: "Generate ln-ashlar Sort Control",
	description:
		ROUTER_FIRST_HINT +
		"Генерира самостојна ln-sort контрола (сајдбар, toolbar, sheet). " +
		"Таргетот е id-то на ln-data-store, НЕ на приказот — изворот го поседува query-то. " +
		"Кликот циклира null → asc → desc → null и праќа ln-sort:change; класите " +
		"ln-sort-asc/ln-sort-desc се исцртуваат од ехото ln-data-store:query-changed, " +
		"па две контроли врз ист store не можат да се разидат. " +
		"За сортирање во заглавје на табела користи generate_ln_table со `source` — таму " +
		"data-ln-sort оди на <thead>, а data-ln-sort-field на <th>.",
	inputSchema: {
		target: z.string().describe("id на ln-data-store што го троши барањето за сортирање"),
		fields: z
			.array(
				z.object({
					field: z.string().describe("Име на полето по кое се сортира (data-ln-sort-field)"),
					label: z.string().describe("Видлив текст на копчето")
				})
			)
			.describe("Полиња понудени за сортирање"),
		id: z.string().optional().describe("Опционален id за самата контрола")
	}
};

export const handler = async ({ target, fields = [], id }) =>
	htmlResult(buildSortControl({ target, fields, id }));
