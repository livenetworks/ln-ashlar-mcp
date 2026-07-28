import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_form";

export const definition = {
	title: "Generate ln-ashlar Form",
	description:
		"Генерира <form data-ln-form> со валидација од темплејтот во _src/forms/form.html. " +
		"Според ln-ashlar конвенциите, data-ln-form е булов атрибут (без вредност), а data-ln-form-scope='resource' " +
		"го прифаќа името на ресурсот за координаторот.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за формата (на пр. 'documents-form')"),
		action: z.string().describe("URL за испраќање на формата (action)"),
		method: z.enum(["get", "post"]).default("post").describe("HTTP метод"),
		scope: z.string().optional().describe("Име на ресурсот за data-ln-form-scope (на пр. 'documents')"),
		action_edit: z.boolean().default(true).describe("Дали да содржи data-ln-form-action-edit атрибут"),
		submit_label: z.string().default("Зачувај").describe("Текст на копчето за испраќање"),
		cancel_label: z.string().optional().describe("Опционален текст за откажување"),
		fields: z
			.array(
				z.object({
					name: z.string(),
					label: z.string(),
					type: z.enum(["text", "email", "password", "number", "textarea", "select", "checkbox"]).default("text").optional(),
					required: z.boolean().optional(),
					placeholder: z.string().optional(),
					options: z.array(z.object({ label: z.string(), value: z.string() })).optional()
				})
			)
			.describe("Листа на полиња во формата")
	}
};

export const handler = async ({
	id,
	action,
	method = "post",
	scope,
	action_edit = true,
	submit_label = "Зачувај",
	cancel_label,
	fields = []
}) => {
	const formTpl = loadTemplate("forms/form.html");
	const fieldTpl = loadTemplate("forms/field.html");

	const compiledFields = fields.map((f) => {
		const fieldId = `${id}-${f.name}`;
		const fieldType = f.type || "text";
		const reqAttr = f.required ? " required data-ln-validate" : "";
		const placeAttr = f.placeholder ? ` placeholder="${f.placeholder}"` : "";

		let inputEl = "";
		if (fieldType === "textarea") {
			inputEl = `<textarea id="${fieldId}" name="${f.name}"${reqAttr}${placeAttr}></textarea>`;
		} else if (fieldType === "select") {
			const opts = (f.options || [])
				.map((o) => `<option value="${o.value}">${o.label}</option>`)
				.join("\n    ");
			inputEl = `<select id="${fieldId}" name="${f.name}"${reqAttr}>\n    ${opts}\n  </select>`;
		} else if (fieldType === "checkbox") {
			inputEl = `<input type="checkbox" id="${fieldId}" name="${f.name}"${reqAttr}>`;
		} else {
			inputEl = `<input type="${fieldType}" id="${fieldId}" name="${f.name}"${reqAttr}${placeAttr}>`;
		}

		let errorItems = "";
		if (f.required) {
			errorItems += `<li hidden data-ln-validate-error="required">${f.label} е задолжително поле</li>\n`;
		}
		if (fieldType === "email") {
			errorItems += `<li hidden data-ln-validate-error="type">Внесете валидна е-пошта</li>\n`;
		}

		return compileTemplate(
			fieldTpl,
			{
				field_id: fieldId,
				label: f.label,
				input_element: inputEl
			},
			{
				error_items: errorItems.trim()
			}
		);
	});

	const scopeAttr = scope ? ` data-ln-form-scope="${scope}"` : "";
	const editAttr = action_edit ? " data-ln-form-action-edit" : "";
	const cancelSlot = cancel_label
		? `<li><a href="#" class="ln-btn ln-btn-ghost" data-ln-modal-close>${cancel_label}</a></li>`
		: "";

	const htmlOutput = compileTemplate(
		formTpl,
		{
			id,
			action,
			method,
			scope_attr: scopeAttr,
			edit_attr: editAttr,
			submit_label
		},
		{
			fields: compiledFields.join("\n\n"),
			cancel: cancelSlot
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
