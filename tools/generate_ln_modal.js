import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_modal";

export const definition = {
	title: "Generate ln-ashlar Modal",
	description:
		"Генерира ln-ashlar <dialog data-ln-modal data-ln-modal-mode='new'>. " +
		"Според спецификацијата на ln-ashlar, кога модалот содржи форма, <form data-ln-form> е ДИРЕКТЕН ПРВ CHILD на <dialog> " +
		"со чист data-ln-form булов атрибут и data-ln-form-scope='resource'.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за модалот (на пр. 'doc-modal')"),
		resource: z.string().optional().describe("Име на ресурсот за data-ln-form-scope (на пр. 'documents')"),
		title_singular: z.string().optional().describe("Еднина на ресурсот за насловите (на пр. 'Корисник', 'Документ')"),
		title_new: z.string().optional().describe("Наслов за нов запис (data-ln-modal-when='new')"),
		title_edit: z.string().optional().describe("Наслов за измена (data-ln-modal-when='edit')"),
		title: z.string().optional().describe("Обичен наслов кога нема состојба new/edit"),
		custom_class: z.string().optional().describe("Дополнителни CSS класи за <dialog>"),
		body_html: z.string().optional().describe("Обична HTML содржина (кога нема форма)"),
		form_config: z
			.object({
				id: z.string().optional().describe("Прилагоден ID за формата (на пр. 'doc-form')"),
				action: z.string(),
				method: z.enum(["get", "post"]).default("post"),
				submit_label: z.string().default("Зачувај"),
				fields: z.array(
					z.object({
						name: z.string(),
						label: z.string(),
						type: z.enum(["text", "email", "password", "number", "textarea", "select", "checkbox"]).default("text").optional(),
						required: z.boolean().optional(),
						placeholder: z.string().optional()
					})
				)
			})
			.optional()
			.describe("Конфигурација доколку содржината на модалот е форма")
	}
};

export const handler = async ({
	id,
	resource,
	title_singular,
	title_new,
	title_edit,
	title,
	custom_class = "",
	body_html,
	form_config
}) => {
	const modalTpl = loadTemplate("components/modal.html");
	const fieldTpl = loadTemplate("forms/field.html");
	const modalClassStr = custom_class ? ` ${custom_class}` : "";

	// 1. Формирање на хедер насловот со data-ln-modal-when="new" и "edit"
	let headerTitleHtml = "";
	const newTitleText = title_new || (title_singular ? `Нов ${title_singular}` : title || "Нов запис");
	const editTitleText = title_edit || (title_singular ? `Уреди ${title_singular}` : title || "Уреди запис");

	if (title_singular || title_new || title_edit) {
		headerTitleHtml = `
				<span data-ln-modal-when="new">${newTitleText}</span>
				<span data-ln-modal-when="edit">${editTitleText}</span>`;
	} else {
		headerTitleHtml = title || "Модал";
	}

	let innerContent = "";

	if (form_config) {
		// Кога има форма: <form data-ln-form data-ln-form-scope="..."> е ДИРЕКТЕН ПРВ CHILD на <dialog>
		const formId = form_config.id || `${id.replace(/-modal$/, "")}-form`;
		const scopeAttr = resource ? ` data-ln-form-scope="${resource}"` : "";
		const fields = form_config.fields || [];

		const compiledFields = fields.map((f) => {
			const fieldId = `${formId}-${f.name}`;
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

		innerContent = `  <!-- <form data-ln-form> е директен прв child на <dialog> според ln-ashlar спецификацијата -->
	<form id="${formId}" data-ln-form${scopeAttr} method="${form_config.method || "post"}" action="${form_config.action}" data-ln-form-action-edit>
		<header class="ln-modal-header">
			<h2 class="ln-modal-title">${headerTitleHtml.trim()}
			</h2>
			<a href="#" class="ln-modal-close" data-ln-modal-close aria-label="Затвори">
				<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-close"></use></svg>
			</a>
		</header>

		<main class="ln-modal-body">
			<input type="hidden" name="id">
${compiledFields.join("\n\n")}
		</main>

		<footer class="ln-modal-footer">
			<ul class="ln-form-actions">
				<li><button type="submit" class="ln-btn ln-btn-primary">${form_config.submit_label || "Зачувај"}</button></li>
				<li><a href="#" class="ln-btn ln-btn-ghost" data-ln-modal-close>Откажи</a></li>
			</ul>
		</footer>
	</form>`;
	} else {
		innerContent = `  <article class="ln-modal-content">
		<header class="ln-modal-header">
			<h2 class="ln-modal-title">${headerTitleHtml.trim()}</h2>
			<a href="#" class="ln-modal-close" data-ln-modal-close aria-label="Затвори">
				<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-close"></use></svg>
			</a>
		</header>

		<div class="ln-modal-body">
			${body_html || ""}
		</div>
	</article>`;
	}

	const htmlOutput = compileTemplate(
		modalTpl,
		{
			id,
			modal_class: modalClassStr
		},
		{
			content: innerContent
		}
	);

	const finalHtml = htmlOutput.replace('<dialog id="', '<dialog data-ln-modal-mode="new" id="');

	return {
		content: [
			{
				type: "text",
				text: `\`\`\`html\n${finalHtml}\n\`\`\``
			}
		]
	};
};
