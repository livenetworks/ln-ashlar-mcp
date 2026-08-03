import { z } from "zod";
import { buildCoordinator, COORDINATOR_DICT_ENTRIES } from "./snippets/builders.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_data_coordinator";

export const definition = {
	title: "Generate ln-ashlar Data Coordinator",
	description:
		ROUTER_FIRST_HINT +
		"Генерира Layer 2 data coordinator со <data-ln-data-store> (IndexedDB кеш) и " +
		"<data-ln-api-connector> (API конектор), плус hidden i18n речник. " +
		"Кога има вгнездена содржина коренот е <div> и НЕ е hidden; празен омот е <ul> со <li> деца.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за координаторот (на пр. 'documents-coordinator')"),
		resource: z.string().describe("Име на ресурсот (на пр. 'documents', 'users', 'products')"),
		api_path: z
			.string()
			.default("/api")
			.describe("Ресурсна патека — вредност на data-ln-api-connector (на пр. '/api/users')"),
		api_base_url: z.string().optional().describe("Опционален data-ln-api-base-url кога API-то е на друг хост"),
		store_indexes: z
			.array(z.string())
			.optional()
			.describe("Полиња за IndexedDB индекси (data-ln-data-store-indexes). Индексирај само она по што се бара."),
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
	api_path = "/api",
	api_base_url,
	store_indexes = [],
	children_html = "",
	dict_entries
}) =>
	htmlResult(
		buildCoordinator({
			id,
			resource,
			apiPath: api_path,
			apiBaseUrl: api_base_url,
			storeIndexes: store_indexes,
			childrenHtml: children_html,
			dictEntries: dict_entries ?? COORDINATOR_DICT_ENTRIES
		})
	);
