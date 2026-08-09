# `tools/snippets` — ln-ashlar HTML Snippet генератори

Модуларен систем од MCP алатки и чисти HTML темплејти за генерирање на семантички `ln-ashlar` снипети.

---

## Архитектура

```text
scripts/sync-ln-attrs.js          # codegen: ln-ashlar js/**+scss/** → attributes.generated.js
tools/snippets/
├── attributes.generated.js       # ⚠ ГЕНЕРИРАН — единствениот извор на data-ln-* имиња
├── template_engine.js            # loadTemplate / compileTemplate / escapeHtml / raw / indentBlock
├── builders.js                   # чисти build*() функции што враќаат HTML стринг
├── field_schema.js               # ЕДИНСТВЕНАТА zod дефиниција на форма-поле
├── mcp.js                        # htmlResult() — единствената точка со ```html fence
└── _src/                         # читливи HTML темплејти
    ├── base/       page-shell.html, header.html, footer.html
    ├── layouts/    card.html, stat-card.html
    ├── components/ modal.html, accordion.html, tabs.html, dropdown.html, search.html,
    │               popover.html, filter-list.html, empty-state.html, stepper.html,
    │               timeline.html, toast-container.html
    ├── forms/      form.html, field.html, upload.html
    ├── tables/     table.html
    ├── containers/ data-coordinator.html, data-coordinator-nested.html
    └── modules/    crud.html
```

Поток: `generate_ln_*.js` (zod схема) → `builders.js` (чист HTML) → `mcp.js` (fence).
Компонирањето оди меѓу builder-ите директно — никогаш преку парсирање на туѓ MCP излез.

---

## Врската со ln-ashlar

Атрибутите **не се измислуваат**. `attributes.generated.js` се гради од вистинскиот код:

```bash
npm run sync:ln-attrs                        # чита DOCS_CORPUS_ROOTS / ASHLAR_DOCS_REPO
npm run sync:ln-attrs -- --root=/пат/до/ln-ashlar
npm run sync:ln-attrs -- --check             # не пишува; exit 1 ако е застарен
```

Изворот е **`js/**` + `scss/**`** — кодот што навистина чита атрибути — а не
`docs-mcp/schemas/ln-ashlar-attributes-schema.json`. Схемата заостанува зад кодот
(нема `data-ln-table-body`, `data-ln-table-store`, `data-ln-table-col-sort-icon`
иако `ln-table` ги чита). Скриптот печати и drift извештај во двете насоки.

Резултатот е **committed**: серверот мора да работи и кога ln-ashlar репозиториумот
не е достапен (`configuredRoots()` враќа `[]` кога не е конфигуриран).

`npm run lint:snippets` (`scripts/lint-snippets.js`) паѓа ако некој генератор емитува атрибут што го нема во
`KNOWN_LN_ATTRS`. Тоа е механизмот што спречува повторен дрифт.

> Што guard-от **не** фаќа: валиден-но-погрешен атрибут. Ако колоната на табелата добие
> `data-ln-table-col` но ги испушти соодветните сорт атрибути (на пр. `data-ln-sort` на `<thead>` + `data-ln-sort-field` на `<th>` за data-driven, или `data-ln-table-sort` за SSR), сите атрибути се вистински, а
> сортирањето е мртво. Тоа се проверува со рачно стартување и преглед на кодот.

---

## Правила на енџинот

| | Escape | Ре-индентација |
|---|---|---|
| `{{key}}` (`data`) | **да**, освен `raw(...)` | не |
| `<!-- KEY_SLOT -->` (`slots`) | не — примаат готов markup | **да**, според позицијата на маркерот |

- Повеќередова содржина оди во **слот**, не во `{{var}}` — само слотовите се ре-индентираат.
- Атрибут-фрагменти се вметнуваат со `raw(attr(ATTR.x, value))`.
- Неисполнетите `{{ }}` **остануваат недопрени** — `{{ price }}` е валидна ln-ashlar
  `fillTemplate` синтакса (види `ln-table.md`), а корисничката содржина може да носи
  Blade/Vue изрази.
- Индентацијата е исклучиво TAB.

---

## Каталог на алатки (18)

### Композициски
| Алатка | Опис |
|---|---|
| `generate_ln_crud_module` | Комплетен Local-First CRUD: modal coordinator + data coordinator + табела + модал со форма |
| `generate_ln_page` | Page shell со header, footer, toast; тема преку `data-theme` на `<html>` |

### Податочен слој
| Алатка | Опис |
|---|---|
| `generate_ln_data_coordinator` | Store + API connector + i18n речник. Со деца: `<div>` без `hidden`; празен: `<ul hidden>` |
| `generate_ln_table` | SSR/data-driven табела. Сортирање бара `data-ln-table-sort` на `<th>`, селекција бара `data-ln-table-selectable` на коренот |
| `generate_ln_dictionary` | `<ul hidden>` со `<li data-ln-{component}-dict="key">` — мора да е внатре во компонентата што го чита |

### Форми
| Алатка | Опис |
|---|---|
| `generate_ln_form` | `data-ln-form-action-edit` е **патека-темплејт** (`/api/users/:id`), не булов атрибут |
| `generate_ln_modal` | `<dialog>` обвиткан во `<section data-ln-modal-coordinator>` — без тој предок тригерите се мртви |
| `generate_ln_upload` | `data-ln-upload` ја носи endpoint URL вредноста |

### Компоненти
`generate_ln_accordion`, `generate_ln_tabs`, `generate_ln_dropdown`, `generate_ln_search`,
`generate_ln_popover`, `generate_ln_empty_state`, `generate_ln_card`, `generate_ln_stat_card`,
`generate_ln_stepper`, `generate_ln_timeline`

`stat-card` и `stepper` ги следат direct-child селекторите од
`scss/config/mixins/` — не вгнездувај ги во дополнителни `<div>`-ови.
Кај `stepper` редниот број го рендерира CSS counter, не markup-от.

`card` и `timeline` немаат JS компонента во ln-ashlar — тие се чист семантички
HTML со CSS класи.

---

## Локално тестирање

```bash
npm run lint:snippets
node -e "import('./tools/generate_ln_crud_module.js').then(m=>m.handler({id:'u',resource:'users',resource_title:'Корисници',resource_singular:'Корисник',columns:[{field:'name',label:'Име',sortable:true}],form_fields:[{name:'name',label:'Име',required:true}]}).then(r=>console.log(r.content[0].text)))"
```
