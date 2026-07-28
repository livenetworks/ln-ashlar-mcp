# 📚 `tools/snippets` — ln-ashlar HTML Snippet MCP Generators

> **Автор:** Live Networks Team  
> **Опис:** Модуларен систем од MCP (Model Context Protocol) алатки и чисти HTML темплејти за автоматско генерирање на семантички, стандардизирани `ln-ashlar` HTML снипети.

---

## 🛠️ Архитектура на домен

```text
tools/snippets/
├── _src/                         # 📁 ЧИСТИ HTML ШАБЛОНИ И ПАРЦИЈАЛИ
│   ├── base/                     # page-shell.html, header.html, footer.html
│   ├── layouts/                  # card.html, grid.html
│   ├── components/               # modal.html, accordion.html, tabs.html, dropdown.html, search.html, popover.html, dictionary.html
│   ├── forms/                    # form.html, field.html
│   ├── tables/                   # table.html
│   ├── containers/               # data-coordinator.html
│   └── modules/                  # crud.html
└── template_engine.js            # ⚡ Модуларен енџин за вчитување и задолжителна TAB (\t) индентација
```

---

## 🎯 Строги правила и конвенции за генерирање

1. **TAB Индентација (`\t`)**:
   * Сите генерирани HTML снипети користат **исклучиво TABS (`\t`)** за индентација. Спејсовите на почеток на ред се забранети.
2. **Семантички DOM-first атрибути на `ln-ashlar`**:
   * **Modals (Layer 1)**: `<dialog data-ln-modal data-ln-modal-mode="new" id="modalId">`
   * **Modal Coordinator (Layer 2)**: `ln-modal-coordinator` (лоциран во `js/ln-modal-coordinator/src/ln-modal-coordinator.js`) кој е document-level singleton за ракување со `[data-ln-modal-for]` тригери, URL hash навигација (`#modalId:id`), пополнување на форми преку `lnCore.fill` и ресетирање по `ln-form:success`.
   * **Form Modal**: `<form data-ln-form data-ln-form-scope="resource">` е **директен прв child** на `<dialog>`.
   * **Modal Titles**: `<h2 class="ln-modal-title"><span data-ln-modal-when="new">Нов...</span><span data-ln-modal-when="edit">Уреди...</span></h2>`
   * **Modal Triggers & Close**:
     * За отворање: `<a href="#modalId" data-ln-modal-for="modalId">`
     * За затворање: `<a href="#" data-ln-modal-close>`
   * **Data Coordinator**: `<ul data-ln-data-coordinator="resource">` со вгнездени:
     * `<li data-ln-data-store="resource" data-ln-store-indexes="..."></li>` (Local IndexedDB Cache)
     * `<li data-ln-api-connector="resource" data-ln-api-url="..."></li>` (API Connector)
   * **Dictionary**: `<ul hidden data-ln-dictionary="name">` со `<li data-ln-dict-key="...">`

---

## 🧰 Каталог на MCP Алатки (13 Алатки)

### 1. `generate_ln_page`
Генерира комплетна HTML страница (Page Shell) за SSR или SPA/Data-driven режими со header, footer и toast контејнер.
* **Влезни параметри**: `title`, `render_mode` (`"ssr"` | `"spa"` | `"data-driven"`), `theme`, `lang`, `include_header`, `include_footer`.

### 2. `generate_ln_crud_module` *(Композициска Алатка)*
Генерира комплетен Local-First CRUD модул во еден фајл. Ги комбинира Data Coordinator, Table со Поповер филтри, Modal со Форма и Dictionary.
* **Влезни параметри**: `id`, `resource`, `resource_title`, `resource_singular`, `api_url`, `columns`, `form_fields`.

### 3. `generate_ln_data_coordinator`
Генерира `<ul data-ln-data-coordinator="resource">` омот со `<li data-ln-data-store>` и `<li data-ln-api-connector>`.
* **Влезни параметри**: `id`, `resource`, `api_url`, `store_indexes`, `children_html`.

### 4. `generate_ln_modal`
Генерира `<dialog data-ln-modal data-ln-modal-mode="new">`. Доколку има форма, `<form data-ln-form>` е директен прв child.
* **Влезни параметри**: `id`, `resource`, `title_singular`, `title_new`, `title_edit`, `form_config`.

### 5. `generate_ln_form`
Генерира `<form data-ln-form data-ln-form-scope="resource">` со полиња и валидациски грешки (`data-ln-validate-errors`).
* **Влезни параметри**: `id`, `action`, `method`, `scope`, `submit_label`, `cancel_label`, `fields`.

### 6. `generate_ln_table`
Генерира SSR или Data-Driven табела (`data-ln-table`) со сортирање, поповери и `<template>` за редови.
* **Влезни параметри**: `id`, `name`, `mode`, `source`, `selectable`, `columns`.

### 7. `generate_ln_search`
Генерира Search инпут снипет со `data-ln-search` и `data-ln-search-items`.
* **Влезни параметри**: `id`, `target_id`, `search_items`, `placeholder`.

### 8. `generate_ln_popover`
Генерира Popover контејнер со `data-ln-popover`.
* **Влезни параметри**: `id`, `content_html`, `hidden`.

### 9. `generate_ln_dictionary`
Генерира `<ul hidden data-ln-dictionary="name">` со системски преводи и грешки.
* **Влезни параметри**: `id`, `name`, `entries`.

### 10. `generate_ln_card`
Генерира картичка со header, body и action-buttons.
* **Влезни параметри**: `id`, `title`, `subtitle`, `badge`, `content`, `actions`.

### 11. `generate_ln_accordion`
Генерира акордеон со N панели (`data-ln-accordion`).
* **Влезни параметри**: `id`, `panels`.

### 12. `generate_ln_tabs`
Генерира табови со URL hash синхронизација (`data-ln-tabs`).
* **Влезни параметри**: `id`, `default_tab`, `tabs`.

### 13. `generate_ln_dropdown`
Генерира dropdown мени (`data-ln-dropdown`).
* **Влезни параметри**: `id`, `trigger_label`, `items`.

---

## ⚙️ Поврзување во MCP Серверот

Сите алатки во `tools/generate_ln_*.js` се автоматски детектирани и регистрирани од страна на [`server.js`](file:///home/mcp/server/server.js).

За локално тестирање на сите алатки, стартувајте:
```bash
node -e "import { handler } from './tools/generate_ln_crud_module.js'; handler({ id: 'test', resource: 'users', resource_title: 'Users', resource_singular: 'User' }).then(res => console.log(res.content[0].text));"
```
