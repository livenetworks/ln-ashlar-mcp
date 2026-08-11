import { z } from "zod";
import { buildTable, buildEmptyState } from "./snippets/builders.js";
import { columnSchema } from "./snippets/column_schema.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_table";

export const definition = {
	title: "Generate ln-ashlar Table",
	description:
		ROUTER_FIRST_HINT +
		"Генерира ln-ashlar табела во SSR или Data-Driven режим. " +
		"Режимот 'data-driven' БАРА `source` (id на ln-data-store) — data-ln-table-source е тоа што го вклучува режимот. " +
		"Без извор на податоци подај 'ssr'. " +
		"Во data-driven (со `source`) сортирањето го поседува store-от: <thead> добива data-ln-sort, " +
		"а <th> data-ln-sort-field — data-ln-table-col-sort сам по себе НЕ сортира. " +
		"data-ln-table-sort е само за SSR. Виртуелизацијата се конфигурира на табелата " +
		"(data-ln-table-window), не на store-от. Empty state оди како " +
		"<template data-ln-table-empty> внатре во коренот.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за контејнерот на табелата"),
		name: z.string().describe("Вредност на data-ln-table; ред темплејтот се бара како '{name}-row'"),
		mode: z
			.enum(["ssr", "data-driven"])
			.default("data-driven")
			.describe(
				"Режим. 'data-driven' БАРА `source` — data-ln-table-source е тоа што го вклучува режимот. " +
					"Без извор на податоци подај 'ssr'."
			),
		source: z
			.string()
			.optional()
			.describe("id на ln-data-store; го вклучува data-driven режимот и е таргет за сортирање/филтри"),
		selectable: z.boolean().default(false).describe("Мулти-селекција (data-ln-table-selectable + row чекбокси)"),
		actions: z.boolean().default(true).describe("Колона со дејства (уреди)"),
		modal_id: z.string().optional().describe("ID на модалот што го отвора копчето за уредување"),
		form_id: z.string().optional().describe("ID на формата што ја полни копчето за уредување (data-ln-fill-form)"),
		empty_title: z.string().optional().describe("Наслов за empty state. Изостави за да нема empty state."),
		empty_description: z.string().optional().describe("Опис за empty state"),
		columns: z.array(columnSchema).describe("Листа на колони")
	}
};

export const handler = async ({
	id,
	name,
	mode = "data-driven",
	source,
	selectable = false,
	actions = true,
	modal_id,
	form_id,
	empty_title,
	empty_description,
	columns = []
}) => {
	try {
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
				columns,
				modalId: modal_id,
				formId: form_id,
				emptyStateHtml
			})
		);
	} catch (e) {
		return { content: [{ type: "text", text: e.message }], isError: true };
	}
};
