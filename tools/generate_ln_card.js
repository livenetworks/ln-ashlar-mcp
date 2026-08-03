import { z } from "zod";
import { loadTemplate, compileTemplate, raw, escapeHtml } from "./snippets/template_engine.js";
import { htmlResult } from "./snippets/mcp.js";

export const name = "generate_ln_card";

export const definition = {
	title: "Generate ln-ashlar Card",
	description:
		"Генерира картичка со наслов, значка, содржина и акции. Чист семантички HTML — " +
		"ln-ashlar нема JS компонента за card, стилизирањето е преку .ln-card класата.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за картичката"),
		title: z.string().optional().describe("Наслов на картичката"),
		subtitle: z.string().optional().describe("Поднаслов"),
		badge: z.string().optional().describe("Опционален текст за значка"),
		content: z.string().describe("HTML содржина на телото"),
		actions: z
			.array(
				z.object({
					label: z.string(),
					href: z.string().optional().describe("Ако е зададено, се рендерира како <a>, инаку <button>"),
					primary: z.boolean().optional()
				})
			)
			.optional()
			.describe("Акции во футерот"),
		custom_class: z.string().optional().describe("Дополнителни CSS класи")
	}
};

export const handler = async ({ id, title, subtitle, badge, content, actions = [], custom_class }) => {
	let headerHtml = "";
	if (title || badge) {
		const badgeHtml = badge ? `\n\t<span class="ln-badge">${escapeHtml(badge)}</span>` : "";
		const subtitleHtml = subtitle ? `\n\t\t<p class="ln-card-subtitle">${escapeHtml(subtitle)}</p>` : "";
		headerHtml =
			`<header class="ln-card-header">\n` +
			`\t<div class="ln-card-title-group">\n` +
			`\t\t<h3 class="ln-card-title">${escapeHtml(title ?? "")}</h3>${subtitleHtml}\n` +
			`\t</div>${badgeHtml}\n` +
			`</header>`;
	}

	let footerHtml = "";
	if (actions.length) {
		const items = actions
			.map((a) => {
				const cls = a.primary ? "ln-btn ln-btn-primary" : "ln-btn ln-btn-secondary";
				return a.href
					? `\t\t<a href="${escapeHtml(a.href)}" class="${cls}">${escapeHtml(a.label)}</a>`
					: `\t\t<button type="button" class="${cls}">${escapeHtml(a.label)}</button>`;
			})
			.join("\n");
		footerHtml =
			`<footer class="ln-card-footer">\n\t<div class="ln-card-actions">\n${items}\n\t</div>\n</footer>`;
	}

	return htmlResult(
		compileTemplate(
			loadTemplate("layouts/card.html"),
			{
				id,
				card_class: raw(custom_class ? ` ${escapeHtml(custom_class)}` : "")
			},
			{ header: headerHtml, body: content, footer: footerHtml }
		)
	);
};
