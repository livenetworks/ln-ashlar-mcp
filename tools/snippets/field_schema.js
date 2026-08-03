// tools/snippets/field_schema.js
//
// ЕДИНСТВЕНАТА дефиниција на форма-поле за сите генератори.
//
// Порано generate_ln_form.js, generate_ln_modal.js и generate_ln_crud_module.js
// имаа по своја копија. Копиите се разидоа: само form.js го декларираше
// `options`, па zod го отстрануваше од другите два и СЕКОЈ <select> излегуваше
// празен. Држи ја дефиницијата тука за да не може да се повтори.

import { z } from "zod";

export const FIELD_TYPES = ["text", "email", "password", "number", "textarea", "select", "checkbox"];

export const fieldOptionSchema = z.object({
	label: z.string().describe("Видлив текст на опцијата"),
	value: z.string().describe("Вредност што се праќа")
});

export const fieldSchema = z.object({
	name: z.string().describe("name атрибут на инпутот"),
	label: z.string().describe("Видлива ознака (<label>)"),
	type: z.enum(FIELD_TYPES).default("text").optional().describe("Тип на полето"),
	required: z.boolean().optional().describe("Дали е задолжително (required + data-ln-validate)"),
	placeholder: z.string().optional().describe("Placeholder текст"),
	options: z
		.array(fieldOptionSchema)
		.optional()
		.describe("Опции за type='select' — БЕЗ ова, <select> излегува празен")
});

export const fieldsSchema = z.array(fieldSchema);

/** @typedef {z.infer<typeof fieldSchema>} LnField */
