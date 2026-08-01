import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";
import { handler as coordHandler } from "./generate_ln_data_coordinator.js";
import { handler as tableHandler } from "./generate_ln_table.js";
import { handler as modalHandler } from "./generate_ln_modal.js";
import { handler as dictHandler } from "./generate_ln_dictionary.js";
import { handler as emptyHandler } from "./generate_ln_empty_state.js";

export const name = "generate_ln_crud_module";

export const definition = {
	title: "Generate ln-ashlar Full CRUD Module",
	description:
		"Генерира комплетен Local-First CRUD модул во еден фајл/снипет. " +
		"Интелигентно ги комбинира: Data Coordinator, Data Table (со data-ln-field и row actions), " +
		"Search & Filter Popover, Empty State, Modal со Form (<form data-ln-form data-ln-form-scope='resource'>) и Dictionary.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за модулот (на пр. 'users-module')"),
		resource: z.string().describe("Име на ресурсот/ентитетот (на пр. 'users', 'products', 'documents')"),
		resource_title: z.string().describe("Наслов за модулот (на пр. 'Корисници', 'Производи')"),
		resource_singular: z.string().describe("Еднина за копче за креирање (на пр. 'Корисник', 'Производ')"),
		api_url: z.string().default("/api").describe("URL ендпоинт за API"),
		columns: z
			.array(
				z.object({
					field: z.string(),
					label: z.string(),
					sortable: z.boolean().optional(),
					filterable: z.boolean().optional()
				})
			)
			.describe("Листа на колони за табелата"),
		form_fields: z
			.array(
				z.object({
					name: z.string(),
					label: z.string(),
					type: z.enum(["text", "email", "password", "number", "textarea", "select", "checkbox"]).default("text").optional(),
					required: z.boolean().optional(),
					placeholder: z.string().optional()
				})
			)
			.describe("Листа на полиња за формата за креирање/уредување")
	}
};

export const handler = async ({
	id,
	resource,
	resource_title,
	resource_singular,
	api_url = "/api",
	columns = [],
	form_fields = []
}) => {
	const moduleTpl = loadTemplate("modules/crud.html");
	const cleanBaseApi = api_url.replace(new RegExp(`/${resource}/?$`), "");
	const resourceEndpoint = `${cleanBaseApi}/${resource}`;

	// 1. Генерирање на Dictionary
	const dictRes = await dictHandler({
		id: `${id}-dict`,
		name: `${resource}-dict`,
		entries: [
			{ key: "auth", value: "Сесијата е истечена. Најавете се повторно." },
			{ key: "network", value: "Мрежна грешка. Промените се зачувани локално." },
			{ key: "conflict", value: "Податокот е ажуриран на друг уред." },
			{ key: "rejected", value: "Серверот ја одби промената." }
		]
	});
	const dictHtml = dictRes.content[0].text.replace(/```html\n|\n```/g, "");

	// 2. Генерирање на Data Table со data-ln-field и row actions
	const tableRes = await tableHandler({
		id: `${id}-table`,
		name: resource,
		mode: "data-driven",
		source: resource,
		selectable: true,
		actions: true,
		columns
	});
	const tableHtml = tableRes.content[0].text.replace(/```html\n|\n```/g, "");

	// 3. Генерирање на Empty State за кога нема податоци
	const emptyRes = await emptyHandler({
		id: `${id}-empty`,
		title: `Нема пронајдено ${resource_title.toLowerCase()}`,
		description: `Се уште ги немате внесено вашите ${resource_title.toLowerCase()}. Кликнете подолу за да додадете.`,
		action_label: `Додај ${resource_singular}`,
		action_modal_id: `${id}-modal`
	});
	const emptyHtml = emptyRes.content[0].text.replace(/```html\n|\n```/g, "");

	// 4. Генерирање на Modal со Форма (со точен resource scope)
	const modalRes = await modalHandler({
		id: `${id}-modal`,
		resource,
		title_singular: resource_singular,
		form_config: {
			id: `${resource}-form`,
			action: resourceEndpoint,
			method: "post",
			submit_label: "Зачувај",
			fields: form_fields
		}
	});
	const modalHtml = modalRes.content[0].text.replace(/```html\n|\n```/g, "");

	// 5. Комбинирање на содржината внатре во Data Coordinator-от
	const innerHtml = `
${dictHtml}

	<!-- Data Table Component -->
${tableHtml}

	<!-- Empty State Component (се прикажува кога нема записи) -->
${emptyHtml}

	<!-- Modal Component со Форма -->
${modalHtml}`;

	// 6. Генерирање на Data Coordinator
	const coordRes = await coordHandler({
		id: `${id}-coordinator`,
		resource,
		api_url: resourceEndpoint,
		store_indexes: columns.map((c) => c.field),
		children_html: innerHtml
	});
	const coordHtml = coordRes.content[0].text.replace(/```html\n|\n```/g, "");

	// 7. Финално склопување во модулот
	const htmlOutput = compileTemplate(
		moduleTpl,
		{
			id,
			resource_title,
			resource_singular
		},
		{
			data_coordinator: coordHtml
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
