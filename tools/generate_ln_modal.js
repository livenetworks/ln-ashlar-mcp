import { z } from "zod";
import { buildModal } from "./snippets/builders.js";
import { fieldSchema } from "./snippets/field_schema.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_modal";

export const definition = {
	title: "Generate ln-ashlar Modal",
	description:
		ROUTER_FIRST_HINT +
		"Генерира <dialog data-ln-modal>. Кога модалот содржи форма, <form data-ln-form> е ДИРЕКТЕН ПРВ CHILD. " +
		"Dialog-от се обвиткува во <section data-ln-modal-coordinator> — ln-modal-coordinator бара " +
		"triggerEl.closest('[data-ln-modal-coordinator]'), па без тој предок data-ln-modal-for тригерите не работат.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за модалот (на пр. 'doc-modal')"),
		resource: z.string().optional().describe("Име на ресурсот за data-ln-form-scope (на пр. 'documents')"),
		title_singular: z.string().optional().describe("Еднина на ресурсот за насловите (на пр. 'Корисник')"),
		title_new: z.string().optional().describe("Наслов за нов запис (data-ln-modal-when='new')"),
		title_edit: z.string().optional().describe("Наслов за измена (data-ln-modal-when='edit')"),
		title: z.string().optional().describe("Обичен наслов кога нема состојба new/edit"),
		custom_class: z.string().optional().describe("Дополнителни CSS класи за <dialog>"),
		body_html: z.string().optional().describe("Обична HTML содржина (кога нема форма)"),
		wrap_coordinator: z
			.boolean()
			.default(true)
			.describe("Дали да го обвитка во <section data-ln-modal-coordinator>. Исклучи само ако веќе постои таков предок."),
		form_config: z
			.object({
				id: z.string().optional().describe("Прилагоден ID за формата (на пр. 'doc-form')"),
				action: z.string().describe("URL за креирање"),
				method: z.enum(["get", "post"]).default("post"),
				action_edit: z.string().optional().describe("Патека-темплејт за уредување, на пр. '/api/users/:id'"),
				action_method: z.string().optional().describe("HTTP метод за уредување (default PUT)"),
				submit_label: z.string().default("Зачувај"),
				fields: z.array(fieldSchema)
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
	body_html = "",
	wrap_coordinator = true,
	form_config
}) =>
	htmlResult(
		buildModal({
			id,
			resource,
			titleSingular: title_singular,
			titleNew: title_new,
			titleEdit: title_edit,
			title,
			customClass: custom_class,
			bodyHtml: body_html,
			wrap: wrap_coordinator,
			formConfig: form_config
		})
	);
