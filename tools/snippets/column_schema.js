// tools/snippets/column_schema.js
//
// ЕДИНСТВЕНАТА дефиниција на колона за сите генератори.
//
// Порано generate_ln_table.js и generate_ln_crud_module.js имаа по своја копија
// на истата shape и веќе беа разидени — table верзијата имаше `.describe()` на
// секое поле, crud немаше ниту едно. Тоа е точно истиот дрифт што ги остави
// сите <select> празни и заради кој постои field_schema.js. Држи ја дефиницијата
// тука за да не може да се повтори.

import { z } from "zod";

export const SORT_TYPES = ["string", "number", "date"];

export const columnSchema = z.object({
	field: z.string().describe("Клуч на полето во записот"),
	label: z.string().describe("Наслов на колоната"),
	sortable: z
		.boolean()
		.optional()
		.describe("Копче за сортирање. Data-driven: data-ln-sort-field на <th> + data-ln-sort на <thead>. SSR: data-ln-table-sort."),
	sort_type: z
		.enum(SORT_TYPES)
		.optional()
		.describe("Тип за споредба — САМО во SSR режим (data-ln-table-sort). Data-driven споредбата ја прави store-от."),
	filterable: z.boolean().optional().describe("Додава popover филтер врзан на изворот на податоци"),
	searchable: z
		.boolean()
		.optional()
		.describe(
			"Полето влегува во data-ln-data-store-search-fields. Дефолт: true за текстуални колони. " +
				"Постави false за нумерички/датумски — full-text низ нив само внесува шум."
		)
});

export const columnsSchema = z.array(columnSchema);

/** @typedef {z.infer<typeof columnSchema>} LnColumn */
