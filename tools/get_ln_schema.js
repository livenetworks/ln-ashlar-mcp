import { z } from "zod";
import fs from "fs";
import path from "path";

export const name = "get_ln_schema";

export const definition = {
	title: "Get ln-ashlar JSON Schema for Components & Attributes",
	description:
		"Враќа машина-читлива JSON Шема на сите data-ln-* атрибути за одредена или за сите ln-ashlar компоненти. " +
		"Се вчитува директно од ажурираниот репозиториум во resources/ln-ashlar/docs-mcp/schemas/ln-ashlar-attributes-schema.json.",
	inputSchema: {
		component_name: z
			.string()
			.optional()
			.describe("Опционално име на компонентата (на пр. 'ln-modal', 'ln-form', 'ln-table', 'ln-data-coordinator', 'ln-core'). Доколку се изостави, ги враќа сите.")
	}
};

export const handler = async ({ component_name }) => {
	const primarySchemaPath = path.resolve("resources/ln-ashlar/docs-mcp/schemas/ln-ashlar-attributes-schema.json");
	const fallbackSchemaPath = path.resolve("tools/snippets/schemas/ln-ashlar-attributes-schema.json");

	let schemaPath = primarySchemaPath;
	if (!fs.existsSync(schemaPath)) {
		schemaPath = fallbackSchemaPath;
	}

	if (!fs.existsSync(schemaPath)) {
		return {
			isError: true,
			content: [{ type: "text", text: "JSON шемата не е пронајдена." }]
		};
	}

	const rawData = fs.readFileSync(schemaPath, "utf-8");
	const fullSchema = JSON.parse(rawData);

	if (component_name) {
		const compSchema = fullSchema.components ? fullSchema.components[component_name] : null;
		if (!compSchema) {
			const available = fullSchema.components ? Object.keys(fullSchema.components).join(", ") : "нема";
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Компонентата '${component_name}' не е пронајдена во новата JSON шема. Достапни компоненти: ${available}`
					}
				]
			};
		}

		return {
			content: [
				{
					type: "text",
					text: `\`\`\`json\n${JSON.stringify(compSchema, null, "\t")}\n\`\`\``
				}
			]
		};
	}

	return {
		content: [
			{
				type: "text",
				text: `\`\`\`json\n${JSON.stringify(fullSchema, null, "\t")}\n\`\`\``
			}
		]
	};
};
