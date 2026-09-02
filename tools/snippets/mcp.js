import { KNOWN_LN_ATTRS } from "./attributes.generated.js";

const ATTR_RE = /data-ln-[a-z0-9-]+/g;

/**
 * @param {string} html
 * @returns {{content: {type: "text", text: string}[]}}
 */
export function htmlResult(html) {
	if (process.env.NODE_ENV !== "production") {
		const matches = html.match(ATTR_RE) || [];
		for (const attr of matches) {
			if (!KNOWN_LN_ATTRS.has(attr)) {
				console.warn(`[SNIPPET WARNING] Emitted unindexed/non-canonical attribute: "${attr}"`);
			}
		}
	}

	return {
		content: [
			{
				type: "text",
				text: "```html\n" + html + "\n```"
			}
		]
	};
}

