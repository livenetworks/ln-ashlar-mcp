import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_stat_card";

export const definition = {
	title: "Generate ln-ashlar Stat Card",
	description:
		"Генерира ln-ashlar Stat Card за дашборд и метрики од темплејтот во tools/snippets/_src/layouts/stat-card.html.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за картичката"),
		title: z.string().describe("Наслов на метриката (на пр. 'Вкупно Документи')"),
		value: z.string().describe("Главна вредност (на пр. '1,240' или '$45,200')"),
		description: z.string().optional().describe("Опис на дното (на пр. 'Споредено со минатиот месец')"),
		trend: z.string().optional().describe("Текст за тренд (на пр. '+12.5%')"),
		trend_direction: z.enum(["up", "down", "neutral"]).default("up").optional(),
		icon_id: z.string().optional().describe("Опционална икона"),
		custom_class: z.string().optional().describe("Дополнителни CSS класи")
	}
};

export const handler = async ({
	id,
	title,
	value,
	description = "",
	trend,
	trend_direction = "up",
	icon_id,
	custom_class = ""
}) => {
	const tpl = loadTemplate("layouts/stat-card.html");
	const customClassStr = custom_class ? ` ${custom_class}` : "";

	let iconSlot = "";
	if (icon_id) {
		iconSlot = `\n\t\t<svg class="ln-icon ln-stat-card-icon" aria-hidden="true"><use href="#${icon_id}"></use></svg>`;
	}

	let trendSlot = "";
	if (trend) {
		const trendClass = `ln-trend ln-trend-${trend_direction}`;
		const iconArrow = trend_direction === "up" ? "#ln-icon-arrow-up" : "#ln-icon-arrow-down";
		trendSlot = `
		<span class="${trendClass}">
			<svg class="ln-icon" aria-hidden="true"><use href="${iconArrow}"></use></svg>
			${trend}
		</span>`;
	}

	const htmlOutput = compileTemplate(
		tpl,
		{
			id,
			title,
			value,
			description,
			custom_class: customClassStr
		},
		{
			icon: iconSlot,
			trend: trendSlot
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
