import { z } from "zod";
import { buildDict } from "./snippets/builders.js";
import { ATTR } from "./snippets/attributes.generated.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_dictionary";

/**
 * Компонентите што навистина читаат речник преку lnCore.buildDict().
 * Клучот е пријателско име, вредноста е атрибутот што го бара таа компонента.
 */
const DICT_ATTR_BY_COMPONENT = {
	"data-coordinator": ATTR.dataCoordinatorDict,
	table: ATTR.tableDict,
	upload: ATTR.uploadDict,
	date: ATTR.dateDict,
	editor: ATTR.editorDict
};

export const definition = {
	title: "Generate ln-ashlar Dictionary",
	description:
		ROUTER_FIRST_HINT +
		"Генерира hidden i18n речник според doctrine/html-markup-rules.md §3: <ul hidden> со " +
		"<li data-ln-{component}-dict=\"{key}\">. Мора да се вгради ВНАТРЕ во markup-от на компонентата " +
		"што го чита — lnCore.buildDict(root, selector) бара само во сопственото поддрво.",
	inputSchema: {
		component: z
			.enum(Object.keys(DICT_ATTR_BY_COMPONENT))
			.describe("Компонентата што ќе го чита речникот — го одредува data-ln-*-dict атрибутот"),
		entries: z
			.array(
				z.object({
					key: z.string().describe("Клуч на пораката (на пр. 'auth', 'network', 'conflict', 'rejected')"),
					value: z.string().describe("Текст на пораката")
				})
			)
			.describe("Листа на парови клуч-порака")
	}
};

export const handler = async ({ component, entries = [] }) =>
	htmlResult(
		buildDict({
			dictAttr: DICT_ATTR_BY_COMPONENT[component],
			entries,
			comment: `i18n речник за ${component} — вгради го внатре во компонентата`
		})
	);
