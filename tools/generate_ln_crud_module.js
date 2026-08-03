import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";
import { buildCoordinator, buildTable, buildModal, buildEmptyState } from "./snippets/builders.js";
import { fieldSchema } from "./snippets/field_schema.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_crud_module";

export const definition = {
	title: "Generate ln-ashlar Full CRUD Module",
	description:
		ROUTER_FIRST_HINT +
		"Генерира комплетен Local-First CRUD модул во еден снипет: modal coordinator омот, data coordinator " +
		"(store + api connector + i18n речник), data table со сортирање/филтри/empty state, и modal со форма. " +
		"Компонира преку споделените builder-и — сите data-ln-* атрибути се проверени наспроти ln-ashlar изворот.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за модулот (на пр. 'users-module')"),
		resource: z.string().describe("Име на ресурсот/ентитетот (на пр. 'users', 'products')"),
		resource_title: z.string().describe("Наслов за модулот (на пр. 'Корисници')"),
		resource_singular: z.string().describe("Еднина за копчето за креирање (на пр. 'Корисник')"),
		api_url: z.string().default("/api").describe("Базна API патека; ресурсот се додава ако веќе не е таму"),
		columns: z
			.array(
				z.object({
					field: z.string(),
					label: z.string(),
					sortable: z.boolean().optional(),
					sort_type: z.enum(["string", "number", "date"]).optional(),
					filterable: z.boolean().optional()
				})
			)
			.describe("Листа на колони за табелата"),
		store_indexes: z
			.array(z.string())
			.optional()
			.describe("Полиња за IndexedDB индекси. Default: само сортабилните и филтрабилните колони."),
		form_fields: z.array(fieldSchema).describe("Полиња за формата за креирање/уредување")
	}
};

/**
 * Спој ја базната патека со ресурсот без regex врз неконтролиран влез.
 * @param {string} apiUrl
 * @param {string} resource
 * @returns {string}
 */
function resolveEndpoint(apiUrl, resource) {
	const base = apiUrl.replace(/\/+$/, "");
	const suffix = `/${resource}`;
	return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

export const handler = async ({
	id,
	resource,
	resource_title,
	resource_singular,
	api_url = "/api",
	columns = [],
	store_indexes,
	form_fields = []
}) => {
	const modalId = `${id}-modal`;
	const formId = `${resource}-form`;
	const endpoint = resolveEndpoint(api_url, resource);

	// Индексирај само она по што навистина се бара/сортира — секоја колона е
	// непотребен IndexedDB индекс врз потенцијално долги текстуални полиња.
	const indexes =
		store_indexes ?? columns.filter((c) => c.sortable || c.filterable).map((c) => c.field);

	const tableHtml = buildTable({
		id: `${id}-table`,
		name: resource,
		mode: "data-driven",
		source: resource,
		selectable: true,
		actions: true,
		columns,
		modalId,
		formId,
		emptyStateHtml: buildEmptyState({
			id: `${id}-empty`,
			title: `Нема пронајдено ${resource_title.toLowerCase()}`,
			description: `Сè уште немате внесено ${resource_title.toLowerCase()}. Кликнете подолу за да додадете.`,
			actionLabel: `Додај ${resource_singular}`,
			actionModalId: modalId
		})
	});

	const modalHtml = buildModal({
		id: modalId,
		resource,
		titleSingular: resource_singular,
		// Координаторот е веќе на ниво на модулот — не дуплирај го.
		wrap: false,
		formConfig: {
			id: formId,
			action: endpoint,
			method: "post",
			action_edit: `${endpoint}/:id`,
			action_method: "PUT",
			submit_label: "Зачувај",
			fields: form_fields
		}
	});

	const coordinatorHtml = buildCoordinator({
		id: `${id}-coordinator`,
		resource,
		apiPath: endpoint,
		storeIndexes: indexes,
		childrenHtml: `<!-- Табела -->\n${tableHtml}\n\n<!-- Модал со форма -->\n${modalHtml}`
	});

	return htmlResult(
		compileTemplate(
			loadTemplate("modules/crud.html"),
			{ id, resource_title, resource_singular, modal_id: modalId },
			{ data_coordinator: coordinatorHtml }
		)
	);
};
