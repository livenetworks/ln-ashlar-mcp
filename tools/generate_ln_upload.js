import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_upload";

export const definition = {
	title: "Generate ln-ashlar Upload Dropzone",
	description:
		"Генерира ln-ashlar Drag-and-Drop Upload поле со data-ln-upload од темплејтот во tools/snippets/_src/forms/upload.html.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за upload полето"),
		name: z.string().default("file").describe("Име на инпут полето"),
		accept: z.string().default(".pdf,.doc,.docx,.png,.jpg").describe("Прифатливи екстензии (accept)"),
		max_size: z.string().default("10MB").describe("Максимална дозволена големина (data-ln-upload-max-size)"),
		multiple: z.boolean().default(false).describe("Дали е дозволен избор на повеќе фајлови"),
		required: z.boolean().default(false).describe("Дали е задолжително поле"),
		hint: z.string().default("Максимална големина: 10MB").describe("Забелешка под полето")
	}
};

export const handler = async ({
	id,
	name = "file",
	accept = ".pdf,.doc,.docx,.png,.jpg",
	max_size = "10MB",
	multiple = false,
	required = false,
	hint = "Максимална големина: 10MB"
}) => {
	const tpl = loadTemplate("forms/upload.html");

	const multipleAttr = multiple ? " multiple" : "";
	const requiredAttr = required ? " required data-ln-validate" : "";

	const htmlOutput = compileTemplate(tpl, {
		id,
		name,
		accept,
		max_size,
		hint,
		multiple_attr: multipleAttr,
		required_attr: requiredAttr
	});

	return {
		content: [
			{
				type: "text",
				text: `\`\`\`html\n${htmlOutput}\n\`\`\``
			}
		]
	};
};
