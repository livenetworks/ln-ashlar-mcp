import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_empty_state";

export const definition = {
	title: "Generate ln-ashlar Empty State",
	description:
		"Генерира ln-ashlar Empty State компонент од темплејтот во tools/snippets/_src/components/empty-state.html. " +
		"Се користи кога табела, листа или пребарување нема резултати.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за empty state контејнерот"),
		title: z.string().default("Нема пронајдено податоци").describe("Наслов на празната состојба"),
		description: z.string().default("Нема внесени записи или ниту еден производ не се совпаѓа.").describe("Опис"),
		icon_id: z.string().default("ln-icon-inbox").describe("ID на иконата"),
		action_label: z.string().optional().describe("Опционален текст за копче за акција"),
		action_modal_id: z.string().optional().describe("ID на модал што се отвора со копчето")
	}
};

export const handler = async ({
	id,
	title = "Нема пронајдено податоци",
	description = "Нема внесени записи или ниту еден производ не се совпаѓа.",
	icon_id = "ln-icon-inbox",
	action_label,
	action_modal_id
}) => {
	const tpl = loadTemplate("components/empty-state.html");

	let actionSlot = "";
	if (action_label) {
		const modalAttr = action_modal_id ? ` data-ln-modal-for="${action_modal_id}"` : "";
		const hrefAttr = action_modal_id ? ` href="#${action_modal_id}"` : ' href="#"';
		actionSlot = `
	<div class="ln-empty-state-action">
		<a${hrefAttr} class="ln-btn ln-btn-primary"${modalAttr}>
			${action_label}
		</a>
	</div>`;
	}

	const htmlOutput = compileTemplate(
		tpl,
		{
			id,
			title,
			description,
			icon_id
		},
		{
			action: actionSlot
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
