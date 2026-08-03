import { z } from "zod";
import { buildForm } from "./snippets/builders.js";
import { fieldSchema } from "./snippets/field_schema.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_form";

export const definition = {
	title: "Generate ln-ashlar Form",
	description:
		ROUTER_FIRST_HINT +
		"Генерира <form data-ln-form> со валидација. data-ln-form е булов атрибут, " +
		"data-ln-form-scope='resource' го врзува со data coordinator, а data-ln-form-action-edit е " +
		"ПАТЕКА-ТЕМПЛЕЈТ (на пр. '/api/users/:id') што ја заменува action при уредување.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за формата (на пр. 'documents-form')"),
		action: z.string().describe("URL за креирање (action на формата)"),
		method: z.enum(["get", "post"]).default("post").describe("HTTP метод"),
		scope: z.string().optional().describe("Име на ресурсот за data-ln-form-scope (на пр. 'documents')"),
		action_edit: z
			.string()
			.optional()
			.describe("Патека-темплејт за уредување, на пр. '/api/users/:id'. Без ова, уредувањето праќа POST на create-патеката."),
		action_method: z
			.string()
			.optional()
			.describe("HTTP метод за уредување во _method полето (ln-ashlar default: PUT)"),
		submit_label: z.string().default("Зачувај").describe("Текст на копчето за испраќање"),
		cancel_label: z.string().optional().describe("Опционален текст за копче за откажување"),
		fields: z.array(fieldSchema).describe("Листа на полиња во формата")
	}
};

export const handler = async ({
	id,
	action,
	method = "post",
	scope,
	action_edit,
	action_method,
	submit_label = "Зачувај",
	cancel_label,
	fields = []
}) =>
	htmlResult(
		buildForm({
			id,
			action,
			method,
			scope,
			actionEdit: action_edit,
			actionMethod: action_method,
			submitLabel: submit_label,
			cancelLabel: cancel_label,
			fields
		})
	);
