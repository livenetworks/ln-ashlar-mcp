import { z } from "zod";
import { loadTemplate, compileTemplate, escapeHtml } from "./snippets/template_engine.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_timeline";

export const definition = {
	title: "Generate ln-ashlar Timeline",
	description:
		ROUTER_FIRST_HINT +
		"Генерира хронолошка листа на настани. Чист семантички HTML — ln-ashlar нема JS компонента " +
		"за timeline; библиотеката врзува на .timeline класата.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за timeline елементот"),
		items: z
			.array(
				z.object({
					title: z.string().describe("Наслов на настанот"),
					timestamp: z.string().describe("Прикажано време/датум"),
					datetime: z.string().optional().describe("Машински читлив ISO датум за <time datetime>"),
					description: z.string().optional().describe("Детали за настанот"),
					user: z.string().optional().describe("Корисник што ја извршил акцијата"),
					status: z
						.string()
						.optional()
						.describe("Домен-статус за варијанта (на пр. 'created', 'approved', 'rejected'). Мапирањето кон боја е во SCSS.")
				})
			)
			.describe("Листа на хронолошки настани")
	}
};

export const handler = async ({ id, items = [] }) => {
	const compiled = items.map((item) => {
		// Класата го именува ДОМЕНОТ, не тонот — doctrine/html-markup-rules.md §5.
		const statusClass = item.status ? ` ${escapeHtml(item.status)}` : "";
		const user = item.user
			? ` <span class="ln-timeline-user">од ${escapeHtml(item.user)}</span>`
			: "";
		const datetime = item.datetime ? ` datetime="${escapeHtml(item.datetime)}"` : "";
		const description = item.description
			? `\n\t\t\t<p class="ln-timeline-desc">${escapeHtml(item.description)}</p>`
			: "";

		return `\t<li class="ln-timeline-item${statusClass}">
		<div class="ln-timeline-marker"></div>
		<div class="ln-timeline-content">
			<header class="ln-timeline-header">
				<h4 class="ln-timeline-title">${escapeHtml(item.title)}${user}</h4>
				<time class="ln-timeline-time"${datetime}>${escapeHtml(item.timestamp)}</time>
			</header>${description}
		</div>
	</li>`;
	});

	return htmlResult(
		compileTemplate(loadTemplate("components/timeline.html"), { id }, { items: compiled.join("\n") })
	);
};
