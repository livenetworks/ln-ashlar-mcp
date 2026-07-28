import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_data_coordinator";

export const definition = {
	title: "Generate ln-ashlar Data Coordinator",
	description:
		"Генерира <ul data-ln-data-coordinator> со двете основни li компоненти: " +
		"<li data-ln-data-store> (local storage кеш) и <li data-ln-api-connector> (API конектор) " +
		"според документацијата на ln-ashlar за Local-First data workflow.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за координаторот (на пр. 'documents-coordinator')"),
		resource: z.string().describe("Име на ресурсот (на пр. 'documents', 'users', 'products')"),
		api_url: z.string().default("/api").describe("URL патека до API ендпоинтот"),
		store_indexes: z.array(z.string()).optional().describe("Листа на полиња за индексирање во локалниот store"),
		hidden: z.boolean().default(true).describe("Дали координаторот е скриен омот во DOM"),
		children_html: z.string().optional().describe("Дополнителни вгнездени елементи")
	}
};

export const handler = async ({
	id,
	resource,
	api_url = "/api",
	store_indexes = [],
	hidden = true,
	children_html = ""
}) => {
	const coordTpl = loadTemplate("containers/data-coordinator.html");

	const hiddenAttr = hidden ? " hidden" : "";
	const storeIndexesAttr = store_indexes.length > 0
		? ` data-ln-store-indexes="${store_indexes.join(",")}"`
		: "";

	const htmlOutput = compileTemplate(
		coordTpl,
		{
			id,
			resource,
			api_url,
			hidden_attr: hiddenAttr,
			store_indexes_attr: storeIndexesAttr
		},
		{
			children: children_html
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
