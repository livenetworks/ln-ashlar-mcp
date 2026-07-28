import { z } from "zod";
import { loadTemplate, compileTemplate } from "./snippets/template_engine.js";

export const name = "generate_ln_page";

export const definition = {
	title: "Generate ln-ashlar Page Shell",
	description:
		"Генерира комплетна HTML страница (page shell) со вчитување на чисти HTML темплејти од _src/base/. " +
		"Поддржува интелигентно комбинирање за SSR и SPA (Data-driven) режими, header, footer и тема.",
	inputSchema: {
		title: z.string().describe("Наслов на страницата (<title>)"),
		render_mode: z
			.enum(["ssr", "spa", "data-driven"])
			.default("ssr")
			.describe("Режим на рендерирање: 'ssr' или 'spa'/'data-driven'"),
		lang: z.string().default("mk").describe("Јазик на документот ('mk', 'en')"),
		theme: z.enum(["light", "dark", "auto"]).default("auto").describe("Почетна тема"),
		include_header: z.boolean().default(true).describe("Дали да вклучи стандарден ln-header"),
		include_footer: z.boolean().default(true).describe("Дали да вклучи стандарден ln-footer"),
		main_id: z.string().default("main-content").describe("ID за <main> елементот"),
		custom_body_class: z.string().optional().describe("Дополнителни CSS класи за <body>"),
		initial_content: z.string().optional().describe("Почетна HTML содржина внатре во <main>")
	}
};

export const handler = async ({
	title,
	render_mode = "ssr",
	lang = "mk",
	theme = "auto",
	include_header = true,
	include_footer = true,
	main_id = "main-content",
	custom_body_class = "",
	initial_content = ""
}) => {
	// 1. Вчитај го главниот HTML темплејт од _src/base/page-shell.html
	const pageShellTpl = loadTemplate("base/page-shell.html");

	// 2. Интелигентно одредување дата-атрибути
	const bodyDataAttrs = [];
	if (theme !== "auto") bodyDataAttrs.push(`data-ln-theme="${theme}"`);
	if (render_mode === "spa" || render_mode === "data-driven") bodyDataAttrs.push(`data-ln-app="${render_mode}"`);

	const bodyAttrsStr = bodyDataAttrs.length > 0 ? " " + bodyDataAttrs.join(" ") : "";
	const bodyClassStr = custom_body_class ? ` class="${custom_body_class}"` : "";

	// 3. Подготовка на слотови (Header, Footer, Toast, Content)
	let headerHtml = "";
	if (include_header) {
		const headerTpl = loadTemplate("base/header.html");
		headerHtml = compileTemplate(headerTpl, { brand_name: "Live Networks" });
	}

	let footerHtml = "";
	if (include_footer) {
		const footerTpl = loadTemplate("base/footer.html");
		footerHtml = compileTemplate(footerTpl, { year: new Date().getFullYear().toString() });
	}

	let toastHtml = "";
	if (render_mode === "spa" || render_mode === "data-driven") {
		const toastTpl = loadTemplate("components/toast-container.html");
		toastHtml = compileTemplate(toastTpl, { timeout: "6000", max: "5" });
	}

	const mainContent = initial_content && initial_content.trim()
		? initial_content
		: `<!-- Содржина на страницата -->\n        <section class="ln-section">\n          <h1>${title}</h1>\n          <p>Добредојдовте во новиот модул изграден со ln-ashlar.</p>\n        </section>`;

	// 4. Комбинирај сè заедно преку темплејт енџинот
	const htmlOutput = compileTemplate(
		pageShellTpl,
		{
			lang,
			title,
			assets_path: "/assets",
			main_id,
			body_class: bodyClassStr,
			body_attrs: bodyAttrsStr
		},
		{
			header: headerHtml,
			footer: footerHtml,
			toast: toastHtml,
			main_content: mainContent
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
