import { z } from "zod";
import { loadTemplate, compileTemplate, raw } from "./snippets/template_engine.js";
import { attr, flag, buildDict } from "./snippets/builders.js";
import { ATTR } from "./snippets/attributes.generated.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/router-contract.js";

export const name = "generate_ln_upload";

const DEFAULT_DICT = [
	{ key: "remove", value: "Отстрани" },
	{ key: "error", value: "Прикачувањето не успеа" },
	{ key: "success", value: "Завршено" }
];

export const definition = {
	title: "Generate ln-ashlar Upload Dropzone",
	description:
		ROUTER_FIRST_HINT +
		"Генерира drag-and-drop upload поле. data-ln-upload ја носи endpoint URL вредноста — " +
		"без неа компонентата нема каде да прати. Вклучува и hidden i18n речник (data-ln-upload-dict).",
	inputSchema: {
		id: z.string().describe("Уникатен ID за upload полето"),
		action_url: z.string().describe("Endpoint за прикачување — вредност на data-ln-upload (на пр. '/api/files')"),
		name: z.string().default("file").describe("Име на инпут полето"),
		accept: z.string().default(".pdf,.doc,.docx,.png,.jpg").describe("Дозволени екстензии"),
		delete_url: z.string().optional().describe("Endpoint за бришење (data-ln-upload-delete)"),
		multiple: z.boolean().default(false).describe("Дали е дозволен избор на повеќе фајлови"),
		required: z.boolean().default(false).describe("Дали е задолжително поле"),
		hint: z.string().optional().describe("Забелешка под полето. Default: изведена од accept.")
	}
};

export const handler = async ({
	id,
	action_url,
	name: fieldName = "file",
	accept = ".pdf,.doc,.docx,.png,.jpg",
	delete_url,
	multiple = false,
	required = false,
	hint
}) =>
	htmlResult(
		compileTemplate(
			loadTemplate("forms/upload.html"),
			{
				id,
				name: fieldName,
				accept,
				action_url,
				hint: hint ?? `Дозволени формати: ${accept}`,
				delete_attr: raw(attr(ATTR.uploadDelete, delete_url)),
				multiple_attr: raw(flag("multiple", multiple)),
				required_attr: raw(flag("required", required) + flag(ATTR.validate, required))
			},
			{
				dict: buildDict({
					dictAttr: ATTR.uploadDict,
					entries: DEFAULT_DICT,
					comment: "i18n стрингови (ги чита buildDict)"
				})
			}
		)
	);
