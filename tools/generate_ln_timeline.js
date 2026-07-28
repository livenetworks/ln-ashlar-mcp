import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_timeline";

export const definition = {
	title: "Generate ln-ashlar Timeline",
	description:
		"Генерира ln-ashlar Timeline за хронолошки активности од темплејтот во tools/snippets/_src/components/timeline.html.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за timeline елементот"),
		items: z
			.array(
				z.object({
					title: z.string().describe("Наслов на акцијата/настанот"),
					timestamp: z.string().describe("Време/датум (на пр. 'Пред 2 часа' или '28.07.2026')"),
					description: z.string().optional().describe("Детали за настанот"),
					user: z.string().optional().describe("Корисник што ја извршил акцијата"),
					type: z.enum(["info", "success", "warning", "danger"]).default("info")
				})
			)
			.describe("Листа на хронолошки настани")
	}
};

export const handler = async ({ id, items = [] }) => {
	const tpl = loadTemplate("components/timeline.html");

	const compiledItems = items.map((item) => {
		const typeClass = `ln-timeline-item-${item.type || "info"}`;
		const userHtml = item.user ? ` <span class="ln-timeline-user">од ${item.user}</span>` : "";
		const descHtml = item.description ? `\n\t\t\t<p class="ln-timeline-desc">${item.description}</p>` : "";

		return `\t<li class="ln-timeline-item ${typeClass}">
		<div class="ln-timeline-marker"></div>
		<div class="ln-timeline-content">
			<header class="ln-timeline-header">
				<h4 class="ln-timeline-title">${item.title}${userHtml}</h4>
				<time class="ln-timeline-time">${item.timestamp}</time>
			</header>${descHtml}
		</div>
	</li>`;
	});

	const htmlOutput = compileTemplate(
		tpl,
		{ id },
		{ items: compiledItems.join("\n") }
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
