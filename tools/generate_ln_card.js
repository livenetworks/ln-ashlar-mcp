import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_card";

export const definition = {
	title: "Generate ln-ashlar Card",
	description:
		"Генерира ln-ashlar картичка (Card UI) од темплејтот во _src/layouts/card.html. " +
		"Поддржува наслов, значка (badge), содржина и акциски копчиња.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за картичката"),
		title: z.string().optional().describe("Наслов на картичката"),
		subtitle: z.string().optional().describe("Поднаслов"),
		badge: z.string().optional().describe("Опционален текст за значка (badge)"),
		content: z.string().describe("HTML содржина на телото на картичката"),
		actions: z
			.array(
				z.object({
					label: z.string(),
					href: z.string().optional(),
					primary: z.boolean().optional(),
					type: z.string().optional()
				})
			)
			.optional()
			.describe("Акциски копчиња во футерот на картичката"),
		custom_class: z.string().optional().describe("Дополнителни CSS класи")
	}
};

export const handler = async ({
	id,
	title,
	subtitle,
	badge,
	content,
	actions = [],
	custom_class = ""
}) => {
	const cardTpl = loadTemplate("layouts/card.html");

	// Header Slot
	let headerHtml = "";
	if (title || badge) {
		const badgeHtml = badge ? `<span class="ln-badge">${badge}</span>` : "";
		const subtitleHtml = subtitle ? `<p class="ln-card-subtitle">${subtitle}</p>` : "";
		headerHtml = `
	<header class="ln-card-header">
		<div class="ln-card-title-group">
			<h3 class="ln-card-title">${title ?? ""}</h3>
			${subtitleHtml}
		</div>
		${badgeHtml}
	</header>`;
	}

	// Footer / Actions Slot
	let footerHtml = "";
	if (actions && actions.length > 0) {
		const actionItems = actions
			.map((a) => {
				const btnClass = a.primary ? "ln-btn ln-btn-primary" : "ln-btn ln-btn-secondary";
				if (a.href) {
					return `<a href="${a.href}" class="${btnClass}">${a.label}</a>`;
				}
				return `<button type="${a.type || "button"}" class="${btnClass}">${a.label}</button>`;
			})
			.join("\n      ");

		footerHtml = `
	<footer class="ln-card-footer">
		<div class="ln-card-actions">
			${actionItems}
		</div>
	</footer>`;
	}

	const cardClassStr = custom_class ? ` ${custom_class}` : "";

	const htmlOutput = compileTemplate(
		cardTpl,
		{
			id,
			card_class: cardClassStr
		},
		{
			header: headerHtml,
			body: content,
			footer: footerHtml
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
