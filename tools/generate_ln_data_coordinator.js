import { z } from "zod";
import { buildCoordinator, COORDINATOR_DICT_ENTRIES } from "./snippets/builders.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_data_coordinator";

export const definition = {
	title: "Generate ln-ashlar Data Coordinator",
	description:
		ROUTER_FIRST_HINT +
		"Генерира Layer 2 data coordinator со data-ln-data-store (IndexedDB кеш) и " +
		"data-ln-api-connector (мрежен конектор), плус hidden i18n речник. " +
		"И координаторот и store-от се именуваат преку `id` — маркер-атрибутите се БЕЗ вредност. " +
		"store_id е името што го бараат data-ln-*-source, data-ln-search, data-ln-filter и data-ln-sort. " +
		"Кога има вгнездена содржина коренот е <div> и НЕ е hidden; празен омот е <ul> со <li> деца.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за координаторот (на пр. 'documents-coordinator')"),
		resource: z.string().describe("Име на ресурсот (на пр. 'documents', 'users', 'products')"),
		store_id: z
			.string()
			.optional()
			.describe("id на store-от — таргет за -source/search/filter/sort. Default: вредноста на `resource`."),
		api_path: z
			.string()
			.default("/api")
			.describe("Ресурсна патека — вредност на data-ln-api-path (на пр. '/api/users')"),
		api_base_url: z.string().optional().describe("Опционален data-ln-api-base-url кога API-то е на друг хост"),
		store_indexes: z
			.array(z.string())
			.optional()
			.describe("Полиња за IndexedDB индекси (data-ln-data-store-indexes). Индексирај само она по што се бара."),
		search_fields: z
			.array(z.string())
			.optional()
			.describe("Полиња низ кои пребарува data-ln-search (data-ln-data-store-search-fields)"),
		window: z
			.number()
			.optional()
			.describe("Резидентни редови за виртуелизација (data-ln-data-store-window). Конфигурацијата е на store-от, не на приказот."),
		window_page: z.number().optional().describe("Големина на страница при довлекување (data-ln-data-store-window-page)"),
		window_threshold: z.number().optional().describe("Prefetch маргина во редови (data-ln-data-store-window-threshold)"),
		children_html: z
			.string()
			.optional()
			.describe("Вгнездени компоненти (табела, модал…). Кога е зададено, коренот станува <div> без hidden."),
		dict_entries: z
			.array(z.object({ key: z.string(), value: z.string() }))
			.optional()
			.describe("i18n пораки за грешки. Празна листа = без речник.")
	}
};

export const handler = async ({
	id,
	resource,
	store_id,
	api_path = "/api",
	api_base_url,
	store_indexes = [],
	search_fields = [],
	window: windowSize,
	window_page,
	window_threshold,
	children_html = "",
	dict_entries
}) =>
	htmlResult(
		buildCoordinator({
			id,
			resource,
			storeId: store_id,
			apiPath: api_path,
			apiBaseUrl: api_base_url,
			storeIndexes: store_indexes,
			searchFields: search_fields,
			window: windowSize,
			windowPage: window_page,
			windowThreshold: window_threshold,
			childrenHtml: children_html,
			dictEntries: dict_entries ?? COORDINATOR_DICT_ENTRIES
		})
	);
