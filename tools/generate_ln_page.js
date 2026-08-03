import { z } from "zod";
import { loadTemplate, compileTemplate, raw, escapeHtml } from "./snippets/template_engine.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_page";

export const definition = {
	title: "Generate ln-ashlar Page Shell",
	description:
		ROUTER_FIRST_HINT +
		"Генерира комплетна HTML страница (page shell) со header, footer, toast контејнер и тема. " +
		"Темата се поставува со data-theme на <html> (така ја чита scss/config/_theme.scss); " +
		"'auto' намерно не емитува атрибут за да важи prefers-color-scheme.",
	inputSchema: {
		title: z.string().describe("Наслов на страницата (<title>)"),
		lang: z.string().default("mk").describe("Јазик на документот ('mk', 'en')"),
		theme: z
			.enum(["light", "dark", "auto"])
			.default("auto")
			.describe("Почетна тема. 'auto' = без атрибут, следи prefers-color-scheme."),
		assets_path: z.string().default("/assets").describe("Патека до ln-ashlar.css / ln-ashlar.js"),
		include_header: z.boolean().default(true).describe("Дали да вклучи стандарден ln-header"),
		include_footer: z.boolean().default(true).describe("Дали да вклучи стандарден ln-footer"),
		include_toast: z.boolean().default(true).describe("Дали да вклучи <ul data-ln-toast> контејнер"),
		brand_name: z.string().default("Live Networks").describe("Текст на брендот во хедерот"),
		main_id: z.string().default("main-content").describe("ID за <main> елементот"),
		custom_body_class: z.string().optional().describe("Дополнителни CSS класи за <body>"),
		initial_content: z.string().optional().describe("Почетна HTML содржина внатре во <main>")
	}
};

export const handler = async ({
	title,
	lang = "mk",
	theme = "auto",
	assets_path = "/assets",
	include_header = true,
	include_footer = true,
	include_toast = true,
	brand_name = "Live Networks",
	main_id = "main-content",
	custom_body_class = "",
	initial_content = ""
}) => {
	const headerHtml = include_header
		? compileTemplate(loadTemplate("base/header.html"), { brand_name })
		: "";

	const footerHtml = include_footer
		? compileTemplate(loadTemplate("base/footer.html"), { year: String(new Date().getFullYear()) })
		: "";

	const toastHtml = include_toast
		? compileTemplate(loadTemplate("components/toast-container.html"), { timeout: "6000", max: "5" })
		: "";

	const mainContent =
		initial_content && initial_content.trim()
			? initial_content
			: `<section class="ln-section">\n\t<h1>${escapeHtml(title)}</h1>\n\t<p>Добредојдовте во новиот модул изграден со ln-ashlar.</p>\n</section>`;

	return htmlResult(
		compileTemplate(
			loadTemplate("base/page-shell.html"),
			{
				lang,
				title,
				assets_path,
				main_id,
				// data-theme на <html> — така го бара scss/config/_theme.scss.
				theme_attr: raw(theme === "auto" ? "" : ` data-theme="${escapeHtml(theme)}"`),
				body_class: raw(custom_body_class ? ` class="${escapeHtml(custom_body_class)}"` : "")
			},
			{
				header: headerHtml,
				footer: footerHtml,
				toast: toastHtml,
				main_content: mainContent
			}
		)
	);
};
