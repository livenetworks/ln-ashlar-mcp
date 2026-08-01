import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_table";

export const definition = {
	title: "Generate ln-ashlar Table",
	description:
		"Генерира ln-ashlar табела во SSR или Data-Driven режим од темплејтот во _src/tables/table.html. " +
		"Поддржува колони за селекција, сортирање, филтрирање со popover, data-ln-field врски и <template> редови со дејства (edit/delete).",
	inputSchema: {
		id: z.string().describe("Уникатен ID за контејнерот на табелата"),
		name: z.string().describe("Име на ентитетот за data-ln-table (на пр. 'products')"),
		mode: z.enum(["ssr", "data-driven"]).default("data-driven").describe("Режим на работа"),
		source: z.string().optional().describe("Име на ресурсот/моделот за data-ln-table-source"),
		selectable: z.boolean().default(false).describe("Дали има колона за избор со чекбокс"),
		actions: z.boolean().default(true).describe("Дали да содржи колона за дејства (уредување/бришење)"),
		windowed: z.number().optional().describe("Број на ставки за виртуелизација (data-ln-table-window)"),
		columns: z
			.array(
				z.object({
					field: z.string().describe("Клуч на полето"),
					label: z.string().describe("Наслов на колоната"),
					sortable: z.boolean().optional(),
					filterable: z.boolean().optional()
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
	columns = []
}) => {
	const tableTpl = loadTemplate("tables/table.html");

	const sourceAttr = source ? ` data-ln-table-source="${source}"` : "";
	const windowAttr = windowed ? ` data-ln-table-window="${windowed}"` : "";

	// 1. Header Columns
	const headerCols = [];
	if (selectable) {
		headerCols.push(`
				<th data-ln-table-col-select>
					<input type="checkbox" aria-label="Избери ги сите">
				</th>`);
	}

	const popovers = [];

	columns.forEach((col) => {
		let sortBtn = "";
		if (col.sortable) {
			sortBtn = `
					<button type="button" data-ln-table-col-sort aria-label="Сортирај по ${col.label}">
						<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-sort"></use></svg>
					</button>`;
		}

		let filterBtn = "";
		if (col.filterable) {
			const popoverId = `filter-${id}-${col.field}`;
			filterBtn = `
					<button type="button" class="ln-table-filter" data-ln-table-col-filter data-ln-popover-for="${popoverId}" aria-label="Филтрирај по ${col.label}">
						<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-filter"></use></svg>
					</button>`;

			popovers.push(`
<!-- Popover Filter for ${col.label} -->
<div data-ln-popover id="${popoverId}" class="ln-popover">
	<input type="search" data-ln-search="${popoverId}-list" placeholder="Пребарај...">
	<ul id="${popoverId}-list" data-ln-filter="${id}">
		<li>
			<label>
				<input type="checkbox" data-ln-filter-key="${col.field}" data-ln-filter-reset checked> Сите
			</label>
		</li>
	</ul>
</div>`);
		}

		const filterAttr = col.filterable ? ` data-ln-table-filter-col="${col.field}"` : ` data-ln-table-col="${col.field}"`;
		headerCols.push(`
				<th${filterAttr}>
					${col.label}${sortBtn}${filterBtn}
				</th>`);
	});

	if (actions) {
		headerCols.push(`
				<th data-ln-table-col-actions>Дејства</th>`);
	}

	// 2. Template for Data-Driven Rows
	let templateSlot = "";
	if (mode === "data-driven") {
		const rowCols = [];
		if (selectable) {
			rowCols.push(`\t\t\t<td><input type="checkbox" data-ln-table-row-select aria-label="Избери ред"></td>`);
		}
		columns.forEach((col) => {
			rowCols.push(`\t\t\t<td data-ln-field="${col.field}"></td>`);
		});

		if (actions) {
			const modalId = `${id.replace(/-table$/, "")}-modal`;
			rowCols.push(`\t\t\t<td data-ln-table-cell-actions>
				<a href="#${modalId}" class="ln-btn ln-btn-icon" data-ln-modal-for="${modalId}" data-ln-table-row-edit aria-label="Уреди">
					<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-edit"></use></svg>
				</a>
			</td>`);
		}

		templateSlot = `
	<!-- Template Row for Client-side Data-driven Render -->
	<template data-ln-template="${name}-row">
		<tr data-ln-table-row>
${rowCols.join("\n")}
		</tr>
	</template>`;
	}

	const htmlOutput = compileTemplate(
		tableTpl,
		{
			id,
			name,
			source_attr: sourceAttr,
			window_attr: windowAttr
		},
		{
			header_cols: headerCols.join("\n"),
			template: templateSlot,
			popover_filters: popovers.join("\n")
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
