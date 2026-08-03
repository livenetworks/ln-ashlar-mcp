// tools/snippets/mcp.js
//
// Единствената точка каде HTML се обвиткува во MCP одговор.
//
// Порано секој генератор си го градеше fence-от сам, а generate_ln_crud_module
// го вадеше назад со regex за да компонира. Сега компонирањето оди преку
// builders.js (чист HTML), а fence-от се додава само тука — на самата граница.

/**
 * @param {string} html
 * @returns {{content: {type: "text", text: string}[]}}
 */
export function htmlResult(html) {
	return {
		content: [
			{
				type: "text",
				text: "```html\n" + html + "\n```"
			}
		]
	};
}
