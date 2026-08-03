import { z } from "zod";
import { loadTemplate, compileTemplate, raw, escapeHtml } from "./snippets/template_engine.js";
import { attr } from "./snippets/builders.js";
import { ATTR } from "./snippets/attributes.generated.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_stat_card";

const TREND_ICON = {
	up: "#ln-icon-arrow-up",
	down: "#ln-icon-arrow-down",
	neutral: "#ln-icon-minus"
};

export const definition = {
	title: "Generate ln-ashlar Stat Card",
	description:
		ROUTER_FIRST_HINT +
		"Генерира метричка картичка. Структурата ги следи direct-child селекторите од " +
		"scss/config/mixins/_stat-card.scss: [data-ln-stat-label], [data-ln-stat-value], [data-ln-stat-trend]. " +
		"Со `store` вредноста станува жива преку data-ln-stat (ln-stat брои записи во store-от).",
	inputSchema: {
		id: z.string().describe("Уникатен ID за картичката"),
		label: z.string().describe("Наслов на метриката (на пр. 'Вкупно Документи')"),
		value: z.string().default("0").describe("Почетна вредност. Со `store`, ln-stat ја заменува во runtime."),
		store: z
			.string()
			.optional()
			.describe("Име на store за жив број (data-ln-stat). Без ова, вредноста е статична."),
		stat_filter: z
			.string()
			.optional()
			.describe("Филтер за бројачот во формат 'field:value' (data-ln-stat-filter)"),
		trend: z.string().optional().describe("Текст за тренд (на пр. '+12.5%')"),
		trend_direction: z.enum(["up", "down", "neutral"]).default("up").describe("Насока на трендот"),
		custom_class: z.string().optional().describe("Дополнителни CSS класи")
	}
};

export const handler = async ({
	id,
	label,
	value = "0",
	store,
	stat_filter,
	trend,
	trend_direction = "up",
	custom_class
}) => {
	const trendSlot = trend
		? `<span ${ATTR.statTrend}="${escapeHtml(trend_direction)}">\n` +
			`\t<svg class="ln-icon" aria-hidden="true"><use href="${TREND_ICON[trend_direction]}"></use></svg>\n` +
			`\t${escapeHtml(trend)}\n` +
			`</span>`
		: "";

	return htmlResult(
		compileTemplate(
			loadTemplate("layouts/stat-card.html"),
			{
				id,
				label,
				value,
				stat_attrs: raw(attr(ATTR.stat, store) + attr(ATTR.statFilter, stat_filter)),
				card_class: raw(custom_class ? ` class="${escapeHtml(custom_class)}"` : "")
			},
			{ trend: trendSlot }
		)
	);
};
