import { z } from "zod";
import fs from "fs";
import path from "path";
import { configuredRoots, notConfiguredMessage } from "./ashlar/corpus.js";

export const name = "get_ln_schema";

const SCHEMA_REL_PATH = "docs-mcp/schemas/ln-ashlar-attributes-schema.json";

export const definition = {
	title: "Get ln-ashlar JSON Schema for Components & Attributes",
	description:
		"Враќа машина-читлива JSON Шема на сите data-ln-* атрибути за одредена или за сите ln-ashlar компоненти. " +
		"Се вчитува директно од докс-корпусот на конфигурираниот репозиториум (docs-mcp/schemas/ln-ashlar-attributes-schema.json).",
	inputSchema: {
		component_name: z
			.string()
			.optional()
			.describe("Опционално име на компонентата (на пр. 'ln-modal', 'ln-form', 'ln-table', 'ln-data-coordinator', 'ln-core'). Доколку се изостави, ги враќа сите.")
	}
};

export const handler = async ({ component_name }) => {
	const roots = configuredRoots().map((r) => path.resolve(r));
	if (!roots.length) {
		return {
			isError: true,
			content: [{ type: "text", text: notConfiguredMessage([]) }]
		};
	}

	// First root that carries the schema wins — no in-repo copy to fall back on,
	// a missing schema is an error, never a silently stale answer.
	const schemaPath = roots.map((r) => path.join(r, SCHEMA_REL_PATH)).find((p) => fs.existsSync(p));

	if (!schemaPath) {
		return {
			isError: true,
			content: [{ type: "text", text: `JSON шемата не е пронајдена: ${SCHEMA_REL_PATH} не постои во ниту еден конфигуриран корен (${roots.join(", ")}).` }]
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
