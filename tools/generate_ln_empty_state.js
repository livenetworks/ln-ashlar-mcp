import { z } from "zod";
import { buildEmptyState } from "./snippets/builders.js";
import { htmlResult } from "./snippets/mcp.js";
import { ROUTER_FIRST_HINT } from "./ashlar/instructions.js";

export const name = "generate_ln_empty_state";

export const definition = {
	title: "Generate ln-ashlar Empty State",
	description:
		ROUTER_FIRST_HINT +
		"Генерира Empty State блок. За да го прикаже ln-table, содржината мора да заврши внатре во " +
		"<template data-ln-table-empty> во коренот на табелата — generate_ln_table го прави тоа автоматски " +
		"преку empty_title. Оваа алатка е за самостојна употреба или за рачно вградување.",
	inputSchema: {
		id: z.string().describe("Уникатен ID за empty state контејнерот"),
		title: z.string().default("Нема пронајдено податоци").describe("Наслов на празната состојба"),
		description: z
			.string()
			.default("Нема внесени записи што одговараат на барањето.")
			.describe("Опис"),
		icon_id: z.string().default("ln-icon-inbox").describe("ID на иконата во спрајтот"),
		action_label: z.string().optional().describe("Опционален текст за копче за акција"),
		action_modal_id: z.string().optional().describe("ID на модал што се отвора со копчето")
	}
};

export const handler = async ({ id, title, description, icon_id, action_label, action_modal_id }) =>
	htmlResult(
		buildEmptyState({
			id,
			title,
			description,
			iconId: icon_id,
			actionLabel: action_label,
			actionModalId: action_modal_id
		})
	);
