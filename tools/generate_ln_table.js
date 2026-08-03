import { z } from "zod";
import { buildTable, buildEmptyState } from "./snippets/builders.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_table";

export const definition = {
	title: "Generate ln-ashlar Table",
	description:
		ROUTER_FIRST_HINT +
		"Генерира ln-ashlar табела во SSR или Data-Driven режим. " +
		"Сортирањето бара data-ln-table-sort на <th> (не само копчето), селекцијата бара " +
		"data-ln-table-selectable на коренот, а empty state оди како <template data-ln-table-empty> внатре во коренот.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за контејнерот на табелата"),
		name: z.string().describe("Вредност на data-ln-table; ред темплејтот се бара како '{name}-row'"),
		mode: z.enum(["ssr", "data-driven"]).default("data-driven").describe("Режим на работа"),
		source: z.string().optional().describe("Име на store-от за data-ln-table-source (го вклучува data-driven режимот)"),
		selectable: z.boolean().default(false).describe("Мулти-селекција (data-ln-table-selectable + row чекбокси)"),
		actions: z.boolean().default(true).describe("Колона со дејства (уреди)"),
		windowed: z.number().optional().describe("Број на резидентни редови за виртуелизација (data-ln-table-window)"),
		modal_id: z.string().optional().describe("ID на модалот што го отвора копчето за уредување"),
		form_id: z.string().optional().describe("ID на формата што ја полни копчето за уредување (data-ln-fill-form)"),
		empty_title: z.string().optional().describe("Наслов за empty state. Изостави за да нема empty state."),
		empty_description: z.string().optional().describe("Опис за empty state"),
		columns: z
			.array(
				z.object({
					field: z.string().describe("Клуч на полето во записот"),
					label: z.string().describe("Наслов на колоната"),
					sortable: z.boolean().optional().describe("Вклучува data-ln-table-sort + копче за сортирање"),
					sort_type: z
						.enum(["string", "number", "date"])
						.optional()
						.describe("Тип за споредба при сортирање (default 'string')"),
					filterable: z.boolean().optional().describe("Додава popover филтер за колоната")
				})
			)
			.describe("Листа на колони")
	}
};

export const handler = async ({
	id,
	name,
	mode = "data-driven",
	source,
	selectable = false,
	actions = true,
	windowed,
	modal_id,
	form_id,
	empty_title,
	empty_description,
	columns = []
}) => {
	const emptyStateHtml = empty_title
		? buildEmptyState({
				id: `${id}-empty`,
				title: empty_title,
				description: empty_description,
				actionModalId: modal_id
			})
		: "";

	return htmlResult(
		buildTable({
			id,
			name,
			mode,
			source,
			selectable,
			actions,
			windowed,
			columns,
			modalId: modal_id,
			formId: form_id,
			emptyStateHtml
		})
	);
};
