// tools/snippets/builders.js
//
// Чисти функции што враќаат HTML стринг — без MCP envelope.
//
// Порано generate_ln_crud_module.js ги повикуваше другите handler-и и потоа го
// вадеше markdown fence-от со `.replace(/```html\n|\n```/g, "")` — пет пати.
// Тука компонирањето е директно: builder → builder, а MCP wrapper-ите во
// generate_ln_*.js само го обвиткуваат резултатот.
//
// Сите data-ln-* имиња доаѓаат од ATTR (tools/snippets/attributes.generated.js),
// генериран од ln-ashlar `js/**` со `npm run sync:ln-attrs`.

import { ATTR } from "./attributes.generated.js";
import { loadTemplate, compileTemplate, escapeHtml, raw, indentBlock } from "./template_engine.js";

/**
 * Атрибут со вредност, безбедно escape-иран. Празна вредност → празен стринг.
 * @param {string} attr
 * @param {unknown} value
 * @returns {string}
 */
export function attr(attr_, value) {
	if (value == null || value === "") return "";
	return ` ${attr_}="${escapeHtml(value)}"`;
}

/**
 * Булов (presence) атрибут.
 * @param {string} attr_
 * @param {boolean} on
 * @returns {string}
 */
export function flag(attr_, on) {
	return on ? ` ${attr_}` : "";
}

/**
 * Спој CSS класи во class="..." фрагмент.
 * @param {...(string|false|null|undefined)} names
 * @returns {string}
 */
export function classAttr(...names) {
	const list = names.filter(Boolean).join(" ").trim();
	return list ? ` class="${escapeHtml(list)}"` : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Форма полиња
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Гради единствено `<input>`/`<textarea>`/`<select>` според типот.
 * @param {import('./field_schema.js').LnField} field
 * @param {string} fieldId
 * @returns {string}
 */
function buildInputElement(field, fieldId) {
	const type = field.type || "text";
	const validate = field.required ? ` required ${ATTR.validate}` : "";
	const placeholder = attr("placeholder", field.placeholder);
	const idName = `id="${escapeHtml(fieldId)}" name="${escapeHtml(field.name)}"`;

	if (type === "textarea") {
		return `<textarea ${idName}${validate}${placeholder}></textarea>`;
	}

	if (type === "select") {
		const options = (field.options ?? [])
			.map((o) => `\t<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
			.join("\n");
		// Празен <select> е речиси секогаш баг во повикувачот — остави трага.
		const body = options || "\t<!-- ⚠ нема опции: подај `options: [{ label, value }]` -->";
		return `<select ${idName}${validate}>\n${body}\n</select>`;
	}

	if (type === "checkbox") {
		return `<input type="checkbox" ${idName}${validate}>`;
	}

	return `<input type="${escapeHtml(type)}" ${idName}${validate}${placeholder}>`;
}

/**
 * Гради едно поле со label, инпут и (само ако има) листа со валидациски грешки.
 * @param {import('./field_schema.js').LnField} field
 * @param {string} formId
 * @returns {string}
 */
export function buildField(field, formId) {
	const fieldId = `${formId}-${field.name}`;
	const type = field.type || "text";

	const errors = [];
	if (field.required) {
		errors.push(`<li hidden ${ATTR.validateError}="required">${escapeHtml(field.label)} е задолжително поле</li>`);
	}
	if (type === "email") {
		errors.push(`<li hidden ${ATTR.validateError}="type">Внесете валидна е-пошта</li>`);
	}

	// Празен <ul data-ln-validate-errors> за секое неzadolжително поле беше чист шум.
	const errorList = errors.length
		? `<ul ${ATTR.validateErrors}>\n${indentBlock(errors.join("\n"), 1)}\n</ul>`
		: "";

	return compileTemplate(
		loadTemplate("forms/field.html"),
		{
			field_id: fieldId,
			label: field.label
		},
		{
			// Слот, не {{var}}: само слотовите се ре-индентираат, а <select> е повеќередов.
			input: buildInputElement(field, fieldId),
			error_list: errorList
		}
	);
}

/**
 * @param {import('./field_schema.js').LnField[]} fields
 * @param {string} formId
 * @returns {string}
 */
export function buildFields(fields = [], formId) {
	return fields.map((f) => buildField(f, formId)).join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Форма
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} cfg
 * @param {string} cfg.id
 * @param {string} cfg.action
 * @param {"get"|"post"} [cfg.method]
 * @param {string} [cfg.scope] ресурс за data-ln-form-scope
 * @param {string} [cfg.actionEdit] path template, на пр. '/api/users/:id'
 * @param {string} [cfg.actionMethod] HTTP метод за edit (default PUT)
 * @param {string} [cfg.submitLabel]
 * @param {string} [cfg.cancelLabel]
 * @param {import('./field_schema.js').LnField[]} [cfg.fields]
 * @returns {string}
 */
export function buildForm({
	id,
	action,
	method = "post",
	scope,
	actionEdit,
	actionMethod,
	submitLabel = "Зачувај",
	cancelLabel,
	fields = []
}) {
	const cancelSlot = cancelLabel
		? `<li><button type="button" class="ln-btn ln-btn-ghost" ${ATTR.modalClose}>${escapeHtml(cancelLabel)}</button></li>`
		: "";

	return compileTemplate(
		loadTemplate("forms/form.html"),
		{
			id,
			action,
			method,
			// data-ln-form-action-edit е PATH TEMPLATE (ln-form.md), не булов атрибут.
			// Како булов, edit праќаше POST на create-endpoint-от.
			scope_attr: raw(attr(ATTR.formScope, scope)),
			edit_attr: raw(attr(ATTR.formActionEdit, actionEdit) + attr(ATTR.formActionMethod, actionMethod)),
			submit_label: submitLabel
		},
		{
			fields: buildFields(fields, id),
			cancel: cancelSlot
		}
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Речник (buildDict образец)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Гради hidden речник според doctrine/html-markup-rules.md §3.
 * Мора да живее ВНАТРЕ во markup-от на компонентата што го чита —
 * buildDict(dom, selector) бара само во сопственото поддрво.
 *
 * @param {object} cfg
 * @param {string} cfg.dictAttr на пр. ATTR.dataCoordinatorDict
 * @param {{key: string, value: string}[]} cfg.entries
 * @param {string} [cfg.comment]
 * @returns {string}
 */
export function buildDict({ dictAttr, entries = [], comment }) {
	if (!entries.length) return "";
	const items = entries
		.map((e) => `\t<li ${dictAttr}="${escapeHtml(e.key)}">${escapeHtml(e.value)}</li>`)
		.join("\n");
	const header = comment ? `<!-- ${comment} -->\n` : "";
	return `${header}<ul hidden>\n${items}\n</ul>`;
}

/** Стандардни пораки за грешки на data-coordinator. */
export const COORDINATOR_DICT_ENTRIES = [
	{ key: "auth", value: "Сесијата е истечена. Најавете се повторно." },
	{ key: "network", value: "Мрежна грешка. Промените се зачувани локално." },
	{ key: "conflict", value: "Податокот е ажуриран на друг уред." },
	{ key: "rejected", value: "Серверот ја одби промената." }
];

// ─────────────────────────────────────────────────────────────────────────────
// Data coordinator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Гради Layer 2 data coordinator.
 *
 * Два режима:
 *  - без деца → компактен `<ul>`/`<li>`, смее да биде `hidden`
 *  - со деца  → `<div>` корен (како во ln-table.md), НИКОГАШ `hidden`
 *
 * Порано и двата случаја беа `<ul hidden>`, па табелата и модалот завршуваа
 * како non-<li> деца на скриена листа: невалиден HTML и цел модул display:none.
 *
 * @param {object} cfg
 * @param {string} cfg.id
 * @param {string} cfg.resource
 * @param {string} [cfg.apiPath] ресурсна патека — вредност на data-ln-api-connector
 * @param {string} [cfg.apiBaseUrl]
 * @param {string[]} [cfg.storeIndexes]
 * @param {string} [cfg.childrenHtml]
 * @param {{key: string, value: string}[]} [cfg.dictEntries]
 * @returns {string}
 */
export function buildCoordinator({
	id,
	resource,
	apiPath = "",
	apiBaseUrl,
	storeIndexes = [],
	childrenHtml = "",
	dictEntries = COORDINATOR_DICT_ENTRIES
}) {
	const hasChildren = Boolean(childrenHtml && childrenHtml.trim());

	const dictHtml = buildDict({
		dictAttr: ATTR.dataCoordinatorDict,
		entries: dictEntries,
		comment: "i18n пораки за грешки (ги чита buildDict)"
	});

	return compileTemplate(
		loadTemplate(hasChildren ? "containers/data-coordinator-nested.html" : "containers/data-coordinator.html"),
		{
			id,
			resource,
			api_path: apiPath,
			api_base_url_attr: raw(attr(ATTR.apiBaseUrl, apiBaseUrl)),
			store_indexes_attr: raw(attr(ATTR.dataStoreIndexes, storeIndexes.join(",") || null))
		},
		{
			dict: dictHtml,
			children: hasChildren ? childrenHtml : ""
		}
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Табела
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} LnColumn
 * @property {string} field
 * @property {string} label
 * @property {boolean} [sortable]
 * @property {"string"|"number"|"date"} [sort_type]
 * @property {boolean} [filterable]
 */

/**
 * @param {object} cfg
 * @param {string} cfg.id
 * @param {string} cfg.name вредност на data-ln-table; темплејтот за ред е `${name}-row`
 * @param {"ssr"|"data-driven"} [cfg.mode]
 * @param {string} [cfg.source]
 * @param {boolean} [cfg.selectable]
 * @param {boolean} [cfg.actions]
 * @param {number} [cfg.windowed]
 * @param {LnColumn[]} [cfg.columns]
 * @param {string} [cfg.modalId] модал што го отвора row-edit копчето
 * @param {string} [cfg.formId] форма што ја полни row-edit копчето
 * @param {string} [cfg.emptyStateHtml] содржина на <template data-ln-table-empty>
 * @returns {string}
 */
export function buildTable({
	id,
	name,
	mode = "data-driven",
	source,
	selectable = false,
	actions = true,
	windowed,
	columns = [],
	modalId,
	formId,
	emptyStateHtml = ""
}) {
	const headerCols = [];
	const popovers = [];

	if (selectable) {
		headerCols.push(`<th ${ATTR.tableColSelect}>\n\t<input type="checkbox" aria-label="Избери ги сите">\n</th>`);
	}

	for (const col of columns) {
		const bits = [escapeHtml(col.label)];

		if (col.sortable) {
			bits.push(
				`<button type="button" class="ln-table-sort" ${ATTR.tableColSort} aria-label="Сортирај по ${escapeHtml(col.label)}">\n` +
					`\t<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-sort"></use></svg>\n` +
					`</button>`
			);
		}

		if (col.filterable) {
			const popoverId = `filter-${id}-${col.field}`;
			bits.push(
				`<button type="button" class="ln-table-filter" ${ATTR.tableColFilter} ${ATTR.popoverFor}="${escapeHtml(popoverId)}" aria-label="Филтрирај по ${escapeHtml(col.label)}">\n` +
					`\t<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-filter"></use></svg>\n` +
					`</button>`
			);
			popovers.push(buildFilterPopover({ popoverId, tableId: id, column: col }));
		}

		// data-ln-table-col СЕКОГАШ — порано filterable колона го губеше и
		// оставаше ln-table без мапирање кон полето.
		// data-ln-table-sort е она што навистина го вклучува сортирањето.
		const colAttrs =
			attr(ATTR.tableCol, col.field) +
			(col.sortable ? attr(ATTR.tableSort, col.sort_type || "string") : "") +
			(col.filterable ? attr(ATTR.tableFilterCol, col.field) : "");

		headerCols.push(`<th${colAttrs}>\n${indentBlock(bits.join("\n"), 1)}\n</th>`);
	}

	if (actions) {
		headerCols.push(`<th>Дејства</th>`);
	}

	let templateSlot = "";
	if (mode === "data-driven") {
		const cells = [];
		if (selectable) {
			cells.push(`<td><input type="checkbox" ${ATTR.tableRowSelect} aria-label="Избери ред"></td>`);
		}
		for (const col of columns) {
			cells.push(`<td ${ATTR.field}="${escapeHtml(col.field)}"></td>`);
		}
		if (actions) {
			const href = modalId ? ` href="#${escapeHtml(modalId)}"` : "";
			const modalFor = attr(ATTR.modalFor, modalId);
			const fillForm = attr(ATTR.fillForm, formId);
			cells.push(
				`<td>\n` +
					`\t<a${href} class="ln-btn ln-btn-icon"${modalFor}${fillForm} ${ATTR.tableRowAction}="edit" aria-label="Уреди">\n` +
					`\t\t<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-edit"></use></svg>\n` +
					`\t</a>\n` +
					`</td>`
			);
		}

		templateSlot =
			`<!-- Ред темплејт: ln-table го бара како "${escapeHtml(name)}-row" -->\n` +
			`<template ${ATTR.template}="${escapeHtml(name)}-row">\n` +
			`\t<tr ${ATTR.tableRow} ${ATTR.tableRowId}="">\n` +
			`${indentBlock(cells.join("\n"), 2)}\n` +
			`\t</tr>\n` +
			`</template>`;
	}

	// Empty state мора да е <template data-ln-table-empty> ВНАТРЕ во коренот —
	// самостоен div надвор ln-table никогаш не го гледа.
	const emptySlot = emptyStateHtml
		? `<template ${ATTR.tableEmpty}>\n${indentBlock(emptyStateHtml, 1)}\n</template>`
		: "";

	const rootAttrs =
		attr(ATTR.table, name) +
		attr(ATTR.tableSource, source) +
		flag(ATTR.tableSelectable, selectable) +
		attr(ATTR.tableWindow, windowed);

	const html = compileTemplate(
		loadTemplate("tables/table.html"),
		{
			id,
			root_attrs: raw(rootAttrs)
		},
		{
			empty_template: emptySlot,
			header_cols: headerCols.join("\n"),
			template: templateSlot
		}
	);

	return popovers.length ? `${html}\n\n${popovers.join("\n\n")}` : html;
}

/**
 * Popover со пребарување и филтер листа за една колона.
 * @param {object} cfg
 * @param {string} cfg.popoverId
 * @param {string} cfg.tableId
 * @param {LnColumn} cfg.column
 * @returns {string}
 */
export function buildFilterPopover({ popoverId, tableId, column }) {
	const listId = `${popoverId}-list`;
	return compileTemplate(
		loadTemplate("components/filter-list.html"),
		{
			id: popoverId,
			list_id: listId,
			table_id: tableId,
			filter_key: column.field,
			label: column.label
		},
		{ options: "" }
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} cfg
 * @param {string} [cfg.id]
 * @param {string} [cfg.title]
 * @param {string} [cfg.description]
 * @param {string} [cfg.iconId]
 * @param {string} [cfg.actionLabel]
 * @param {string} [cfg.actionModalId]
 * @returns {string}
 */
export function buildEmptyState({
	id,
	title = "Нема пронајдено податоци",
	description = "Нема внесени записи што одговараат на барањето.",
	iconId = "ln-icon-inbox",
	actionLabel,
	actionModalId
}) {
	let actionSlot = "";
	if (actionLabel) {
		const href = actionModalId ? ` href="#${escapeHtml(actionModalId)}"` : ' href="#"';
		actionSlot =
			`<div class="ln-empty-state-action">\n` +
			`\t<a${href} class="ln-btn ln-btn-primary"${attr(ATTR.modalFor, actionModalId)}>${escapeHtml(actionLabel)}</a>\n` +
			`</div>`;
	}

	return compileTemplate(
		loadTemplate("components/empty-state.html"),
		{ id, title, description, icon_id: iconId },
		{ action: actionSlot }
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Модал
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Гради `<dialog data-ln-modal>`.
 *
 * ВАЖНО: тригерите работат само ако постои предок со data-ln-modal-coordinator —
 * ln-modal-coordinator.js прави `triggerEl.closest('[data-ln-modal-coordinator]')`.
 * Затоа `wrap: true` (default) го обвиткува dialog-от во таков `<section>`.
 * Кога модалот се вградува во веќе координиран поддел (на пр. CRUD модулот),
 * подај `wrap: false`.
 *
 * @param {object} cfg
 * @param {string} cfg.id
 * @param {string} [cfg.resource]
 * @param {string} [cfg.titleSingular]
 * @param {string} [cfg.titleNew]
 * @param {string} [cfg.titleEdit]
 * @param {string} [cfg.title]
 * @param {string} [cfg.customClass]
 * @param {string} [cfg.bodyHtml]
 * @param {boolean} [cfg.wrap]
 * @param {object} [cfg.formConfig]
 * @returns {string}
 */
export function buildModal({
	id,
	resource,
	titleSingular,
	titleNew,
	titleEdit,
	title,
	customClass = "",
	bodyHtml = "",
	wrap = true,
	formConfig
}) {
	const hasModes = Boolean(titleSingular || titleNew || titleEdit);
	const newText = titleNew || (titleSingular ? `Нов ${titleSingular}` : title || "Нов запис");
	const editText = titleEdit || (titleSingular ? `Уреди ${titleSingular}` : title || "Уреди запис");

	const titleHtml = hasModes
		? `<span ${ATTR.modalWhen}="new">${escapeHtml(newText)}</span>\n` +
			`<span ${ATTR.modalWhen}="edit">${escapeHtml(editText)}</span>`
		: escapeHtml(title || "Модал");

	const header =
		`<header class="ln-modal-header">\n` +
		`\t<h2 class="ln-modal-title">\n${indentBlock(titleHtml, 2)}\n\t</h2>\n` +
		`\t<button type="button" class="ln-modal-close" ${ATTR.modalClose} aria-label="Затвори">\n` +
		`\t\t<svg class="ln-icon" aria-hidden="true"><use href="#ln-icon-close"></use></svg>\n` +
		`\t</button>\n` +
		`</header>`;

	let content;
	if (formConfig) {
		const formId = formConfig.id || `${id.replace(/-modal$/, "")}-form`;
		const fieldsHtml = buildFields(formConfig.fields ?? [], formId);
		const formAttrs =
			attr(ATTR.formScope, resource) +
			attr(ATTR.formActionEdit, formConfig.action_edit) +
			attr(ATTR.formActionMethod, formConfig.action_method);

		content =
			`<!-- <form data-ln-form> е директен прв child на <dialog> -->\n` +
			`<form id="${escapeHtml(formId)}" ${ATTR.form} method="${escapeHtml(formConfig.method || "post")}" action="${escapeHtml(formConfig.action)}"${formAttrs}>\n` +
			`${indentBlock(header, 1)}\n\n` +
			`\t<main class="ln-modal-body">\n` +
			`\t\t<input type="hidden" name="id">\n` +
			`${indentBlock(fieldsHtml, 2)}\n` +
			`\t</main>\n\n` +
			`\t<footer class="ln-modal-footer">\n` +
			`\t\t<ul class="ln-form-actions">\n` +
			`\t\t\t<li><button type="submit" class="ln-btn ln-btn-primary">${escapeHtml(formConfig.submit_label || "Зачувај")}</button></li>\n` +
			`\t\t\t<li><button type="button" class="ln-btn ln-btn-ghost" ${ATTR.modalClose}>Откажи</button></li>\n` +
			`\t\t</ul>\n` +
			`\t</footer>\n` +
			`</form>`;
	} else {
		content =
			`<article class="ln-modal-content">\n` +
			`${indentBlock(header, 1)}\n\n` +
			`\t<div class="ln-modal-body">\n${indentBlock(bodyHtml, 2)}\n\t</div>\n` +
			`</article>`;
	}

	const dialog = compileTemplate(
		loadTemplate("components/modal.html"),
		{
			id,
			modal_class: raw(customClass ? ` ${escapeHtml(customClass)}` : "")
		},
		{ content }
	);

	if (!wrap) return dialog;

	return (
		`<!-- Layer 2 координатор: без овој предок data-ln-modal-for тригерите се мртви -->\n` +
		`<section ${ATTR.modalCoordinator}>\n${indentBlock(dialog, 1)}\n</section>`
	);
}
