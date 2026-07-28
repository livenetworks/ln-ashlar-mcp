import { z } from "zod";
import fs from "fs";
import path from "path";

export const name = "get_ln_schema";

export const definition = {
	title: "Get ln-ashlar JSON Schema for Components & Attributes",
	description:
		"MANDATORY FIRST STEP: Враќа машина-читлива JSON Шема на атрибутите (data-ln-*) и опис за сите или одредена ln-ashlar компонента и координатор (Layer 1 & Layer 2). " +
		"МОРА да се повика ПРЕД да одговараш на прашања за архитектурата или пред генерирање на кодот за да се спречат грешки.",
	inputSchema: {
		component_name: z
			.string()
			.optional()
			.describe("Опционално име на компонентата (на пр. 'ln-modal', 'ln-form', 'ln-table', 'ln-data-coordinator'). Доколку се изостави, ги враќа сите.")
	}
};

export const handler = async ({ component_name }) => {
	const ashlarSchemaPath = path.resolve("resources/ln-ashlar/docs-mcp/schemas/ln-ashlar-attributes-schema.json");
	const fallbackSchemaPath = path.resolve("tools/snippets/schemas/ln-ashlar-attributes-schema.json");
	const schemaPath = fs.existsSync(ashlarSchemaPath) ? ashlarSchemaPath : fallbackSchemaPath;
	
	if (!fs.existsSync(schemaPath)) {
		return {
			isError: true,
			content: [{ type: "text", text: "JSON шемата не е пронајдена." }]
		};
	}

	const rawData = fs.readFileSync(schemaPath, "utf-8");
	const fullSchema = JSON.parse(rawData);

	if (component_name) {
		const compSchema = fullSchema.components[component_name];
		if (!compSchema) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Компонентата '${component_name}' не е пронајдена во шемата. Достапни компоненти: ${Object.keys(fullSchema.components).join(", ")}`
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
