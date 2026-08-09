# План 2 — заклучување на санацијата + нов guard

**Датум:** 2026-08-08
**Гранка:** `fix/code-review-remediation` (постои, **ништо не е commit-ирано**)
**Претходен документ:** `plans/code-review-remediation.md` — 10 од 11 задачи изведени точно.

Овој план ги затвора остатоците од План 1, додава една нова заштита родена од
конкретен инцидент, и ги вади на површина одложените ставки од оригиналното
ревју.

---

## 0. Што се случи од План 1 — прочитај го ова прво

### 0.1 Изведеното е добро

Задачи 1, 2, 3, 4, 5, 6, 7, 9, 10, 11 се изведени точно и проверени.
Задача 12 (`gemini.json`) е правилно оставена недопрена — `.gitignore` е
непроменет.

### 0.2 Инцидент: изгубена некомитирана измена

При верификација на lint скриптот во претходната сесија беше пуштено:

```bash
sed -i 's/data-ln-table-body/data-ln-table-body-XYZ/' tools/snippets/_src/tables/table.html
git checkout tools/snippets/_src/tables/table.html      # ← ова
```

`git checkout <file>` враќа од **индексот**. Фајлот имаше некомитирана измена,
а некомитирано значи индекс = HEAD — па наместо да ја врати sed-измената, ја
избриша вистинската работа. Изгубениот ред беше:

```
<thead>   →   <thead>{{thead_attrs}}
```

`builders.js` уредно го пресметуваше `thead_attrs`, но темплејтот немаше каде
да го стави. `data-ln-sort` никогаш не слетуваше на `<thead>` — сортирањето
беше мртво во **секоја** data-driven табела, вклучително CRUD модулот.

**Состојба: поправено и проверено.** Сите седум проверки од План 1, Задача 2
поминуваат, и CRUD-от го емитува `data-ln-sort="users"`.

Две поуки што го обликуваат овој план:

1. **Commit-ирај пред верификација.** План 1 бараше „еден commit по задача" —
   тоа не се случи, и токму затоа `git checkout` беше деструктивен. Фаза 1
   подолу го поправа тоа.
2. **Никој не проверуваше дали темплејтот го троши тоа што builder-от му го
   подава.** Тоа е систематска дупка, не еднократна несреќа — Фаза 2 ја затвора.

### 0.3 Задача 8 од План 1 — недовршена, и внесено нешто полошо

`SOURCE_DIRS` во `scripts/sync-ln-attrs.js` е недопрен:

```js
	{ dir: "js", exts: [".js", ".scss"] },   // ← .scss сè уште тука
```

А коментарот во `renderModule()` — и оттаму во **генерираниот, commit-иран**
`attributes.generated.js` — сега тврди:

```
// Извор: ln-ashlar `js/**`, `scss/**` + `html/**` (кодот што навистина чита атрибути),
```

`html/**` не се скенира (нема таков влез во `SOURCE_DIRS`) и **`../ln-ashlar`
воопшто нема `html/` директориум** — проверено. Тврдењето е невистинито двојно.

Ова е полошо од оригиналниот copy-paste: тој беше безопасно погрешен, овој
активно лаже во генериран фајл каде некој подоцна ќе заклучи дека `html/` е
покриен и нема да провери. Задача 2 подолу го решава.

### 0.4 Пропуст во План 1 (мој, не на изведувачот)

План 1, Задача 5 го наведе непотполното тврдење во README како мотивација, но
**никогаш не го стави ажурирањето на README во „Што"**. README сè уште вели:

> „Нема тест-suite. Единствената автоматска проверка е дрифтот наспроти
> ln-ashlar изворот"

Сега не е единствената. Задача 3 подолу го поправа.

---

## ФАЗА 1 — Заклучи ја претходната работа

### Задача 1. Раздели ја работата во commit-и

**Приоритет:** 🔴 Прва. Сè друго во овој план менува фајлови; додека не е
commit-ирано, секоја грешка е неповратна — токму како во 0.2.
**Време:** 20 минути

#### Зошто

Целата работа од План 1 седи во работното дрво. Три последици:

1. **Задача 1 од План 1 (безбедносната) не може да се cherry-pick-не сама.**
   Тоа беше експлицитната причина за правилото „еден commit по задача" —
   `publicBaseUrl` треба да оди во продукција пред остатокот да е тестиран.
2. **Нема точка за враќање.** Секој `git checkout`, `git stash`, или погрешен
   `sed` е трајна загуба.
3. Ревјуто на PR-от ќе биде една недиференцирана купа од ~20 фајла.

#### Што

Повеќето задачи се чисто раздвојливи по фајл. Изведи ги по овој редослед —
**безбедносната прва**, за да е најдолу во историјата и најлесна за cherry-pick:

```bash
git checkout fix/code-review-remediation

# 1. Безбедност — сама, cherry-pick-абилна
git add config/oauth.json
git commit -m "fix(oauth): постави publicBaseUrl — Host заглавието веќе не ја одредува discovery адресата"

# 2. Snippets кластер (оригиналната тема на гранката + Задачи 2 и 4)
git add tools/snippets/ tools/generate_ln_*.js
git commit -m "fix(snippets): source е единствениот прекинувач на режимот + споделени схеми за колони/полиња"

# 3. Conformance линтер
git add scripts/lint-snippets.js package.json
git commit -m "feat(lint): conformance проверка за data-ln-* како самостојна скрипта"

# 4. sync скрипта (Задачи 6 и 10; Задача 8 доаѓа во следниот commit)
git add scripts/sync-ln-attrs.js
git commit -m "fix(sync): уловен throw при колизија + исчистени референци кон избришани тестови"

# 5. review_plan
git add tools/review_plan.js
git commit -m "fix(review_plan): iteration cap-от веќе не се заобиколува со изоставување на полето"

# 6. server.js
git add server.js
git commit -m "fix(server): toolsDir наспроти модулот, не наспроти cwd"

# 7. corpus warnOnce
git add tools/ashlar/corpus.js
git commit -m "fix(corpus): warnOnce потиснува по порака, не само последователни повторувања"

# 8. rate limit
git add middleware/rate-limit.js routes/oauth.js tools/knowledge/index.js
git commit -m "refactor(rate-limit): издвој го лимитерот и стави го на /knowledge/reload"

# 9. Плановите
git add plans/
git commit -m "docs(plans): ревју наоди и план за санација"
```

**Што останува неcommit-ирано намерно:** `README.md` и
`tools/snippets/attributes.generated.js` — двата се менуваат во Фаза 1/2 подолу
и одат со своите задачи.

⚠️ **Забелешка за `tools/snippets/` кластерот:** тој е единствениот што НЕ е
чисто раздвојлив. Содржи и оригиналната работа на гранката
(`feat/snippets-ln-attr-conformance`) и Задачи 2/4 од План 1, испреплетени во
`builders.js`. Не се обидувај да ги разделиш со `git add -p` — цената е
поголема од користа, а гранката е именувана по токму таа тема.

#### Проверка

```bash
git status --short          # смеат да останат само README.md и attributes.generated.js
git log --oneline -9
```

Потоа потврди дека секој commit е самостоен — најважно, дека првиот навистина
содржи само конфиг:

```bash
git show --stat HEAD~8      # мора: 1 фајл, config/oauth.json
```

---

### Задача 2. Доврши ја Задача 8 и извади го невистинитото `html/**`

**Фајлови:** `scripts/sync-ln-attrs.js`, потоа регенерација
**Време:** 10 минути

#### Зошто

Види 0.3. Две работи во еден фајл: неизвршената измена и внесеното невистинито
тврдење.

#### Што — прво одлука

**Прашање до изведувачот што го напиша `html/**`:** дали намерата беше да се
додаде скенирање на `html/` директориум, па кодот е заборавен? Ако да — знај
дека `../ln-ashlar` **нема** `html/` директориум, па записот би бил no-op.
Проверено:

```bash
ls ../ln-ashlar/ | grep -i html      # (празно)
```

Освен ако не постои друг корпус корен со `html/`, одговорот е дека тврдењето е
невистинито и се вади.

**Измена A** — `SOURCE_DIRS`, извади го `.scss` од `js` записот:

```js
/** Каде во ln-ashlar репозиториумот се бараат атрибути (Слој 1). */
const SOURCE_DIRS = [
	{ dir: "js", exts: [".js"] },
	{ dir: "scss", exts: [".scss"] }
];
```

**Измена B** — во template-от во `renderModule()`, врати го изворот на вистина:

```js
// Извор: ln-ashlar \`js/**\` + \`scss/**\` (кодот што навистина чита атрибути),
// НЕ docs-mcp схемата — таа заостанува зад кодот.
```

Потоа регенерирај:

```bash
npm run sync:ln-attrs -- --root=../ln-ashlar
```

#### Проверка

```bash
npm run sync:ln-attrs -- --check --root=../ln-ashlar
```

Мора да пријави **точно 236 атрибути** и exit 0. Ако бројот се смени, во `js/`
имало `.scss` фајлови и оригиналниот наод бил погрешен — тогаш врати ја
Измена A и пријави.

Потоа потврди дека лагата ја нема во генерираниот фајл:

```bash
grep -n "html/\*\*" tools/snippets/attributes.generated.js scripts/sync-ln-attrs.js
```

Мора да е празно.

**Commit:** `fix(sync): js/ веќе не се скенира за .scss + извади го невистинитото html/** тврдење`

---

### Задача 3. Ажурирај го README

**Фајл:** `README.md`
**Време:** 10 минути

#### Зошто

Види 0.4. README тврди дека drift проверката е единствената автоматска
проверка. По План 1 тоа е неточно (постои `lint:snippets`), а по Фаза 2 подолу
ќе биде уште понеточно.

Ова не е козметика: README-то е првото што го чита следниот изведувач, и ако
му каже дека постои една проверка, тој ќе пушти една.

#### Што

Во секцијата „Проверка на снипет-генераторите", замени го телото со трите
проверки и што покрива секоја:

```markdown
## Проверка на снипет-генераторите

Нема тест-suite. Наместо тоа, три независни проверки — секоја покрива нешто
што другите две не го покриваат:

```bash
npm run sync:ln-attrs -- --check --root=/пат/до/ln-ashlar   # 1. дрифт
npm run lint:snippets                                       # 2. ghost атрибути
npm run smoke:generators                                    # 3. договор темплејт↔builder
```

1. **Дрифт** — `attributes.generated.js` мора да е свеж наспроти ln-ashlar
   `js/**` + `scss/**`. Exit 1 кога ln-ashlar се поместил под генераторите.
   Пушти го по секој pull на ln-ashlar.
2. **Ghost атрибути** — секој `data-ln-*` во `_src/**.html` и во builder-ите
   мора да постои во тој сет. Снипет што реферира избришан атрибут изгледа
   точно и не работи.
3. **Договор темплејт↔builder** — сите 19 генератори се рендерираат, и секој
   `{{key}}` што builder-от го подава мора да постои во темплејтот. Фаќа
   темплејт што тивко испушта променлива (види `plans/code-review-remediation-2.md` §0.2).

Пушти ги сите три пред PR.
```

⚠️ Точка 3 и `smoke:generators` доаѓаат од Фаза 2. **Изведи ја Задача 3 ПОСЛЕ
Задача 4**, инаку README ќе покажува на скрипта што не постои — истата грешка
поради која План 1 ја стави conformance скриптата пред чистењето на
референците.

**Commit:** `docs(readme): трите проверки што ја заменуваат тест-suite-ата`

---

## ФАЗА 2 — Нов guard: договорот темплејт ↔ builder

### Задача 4. Строг режим за `compileTemplate` + smoke за сите генератори

**Приоритет:** 🟠 Ова е содржинскиот дел од планот
**Фајлови:** `tools/snippets/template_engine.js`, `scripts/smoke-generators.js` (нов), `package.json`
**Време:** ~45 минути

#### Зошто

Инцидентот од 0.2 не беше несреќа во една линија — беше **систематска дупка**.

`compileTemplate` намерно ги остава неисполнетите `{{key}}` недопрени. Тоа е
точна одлука и е документирана во кодот:

> `{{ price }}` е валидна ln-ashlar fillTemplate синтакса (види ln-table.md,
> data-driven row template), а корисничката содржина може да носи Blade/Vue
> изрази.

Но обратниот случај е **секогаш баг**: builder што подава `data` клуч кој
темплејтот не го содржи. Тоа значи дека пресметаната вредност никаде не слетува.
Точно тоа се случи со `thead_attrs`, и ништо не пријави — ни грешка, ни
предупредување, ни падната проверка. Излезот изгледаше сосема нормално.

Ниту една од постоечките две проверки не го фаќа ова:
- `sync:ln-attrs --check` гледа само во ln-ashlar наспроти генерираниот фајл.
- `lint:snippets` бара `data-ln-*` литерали — `thead_attrs` не е атрибут, туку
  име на променлива.

**Емпириски проверено при пишувањето на овој план:** со денешниот код сите 19
генератори се рендерираат и има **нула** непотрошени клучеви. Значи проверката
е безбедна да се внесе сега — таа не поправа постоечка грешка, туку го заклучува
тековното исправно однесување.

#### Што

**4a.** Во `tools/snippets/template_engine.js`, додај го строгиот режим.
Веднаш по постоечките `import`-и:

```js
// Строг режим — го палат само скриптите за проверка (scripts/smoke-generators.js),
// НИКОГАШ серверот. `data` клуч што темплејтот не го содржи е СЕКОГАШ баг во
// повикувачот: пресметаната вредност никаде не слетува, а излезот изгледа
// нормално. Обратниот случај — неисполнет {{key}} во темплејтот — е ЛЕГАЛЕН
// (види чекор 3 подолу) и намерно не се пријавува.
const STRICT_TEMPLATE = process.env.LN_STRICT_TEMPLATE === "1";
```

Потоа, во `compileTemplate`, во јамката за `{{key}}` променливите (чекор 3),
додај ја проверката:

```js
	for (const [key, value] of Object.entries(data)) {
		const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

		// Посебен НЕ-глобален regex за тестот. Со `/g` regex, `.test()` го
		// памети `lastIndex` меѓу повици и вториот тест на ист објект враќа
		// false — тивка лажна тревога. (Наидено при валидација на овој план.)
		if (STRICT_TEMPLATE && !new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`).test(templateStr)) {
			throw new Error(
				`compileTemplate: подаден data клуч "${key}" што темплејтот не го содржи. ` +
					`Или темплејтот го испуштил {{${key}}}, или повикувачот подава мртов клуч. ` +
					`Вредноста никаде не слетува, а излезот изгледа нормално.`
			);
		}

		const varPattern = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, "g");
		const resolved = resolveValue(value);
		result = result.replace(varPattern, () => resolved);
	}
```

**Зошто env-gated, а не секогаш:** серверот е жив процес што опслужува MCP
клиенти. Да фрла при рендерирање значи алатката да врати грешка наместо
малку-погрешен markup. Тоа е подобро за развој, но е промена на однесувањето во
живо и не е потребна — статичките темплејти не се менуваат во runtime, па
проверката во CI ја фаќа истата грешка пред deployment, со нула ризик.

**4b.** Создај `scripts/smoke-generators.js`:

```js
#!/usr/bin/env node
// scripts/smoke-generators.js
//
// Рендерира ги СИТЕ generate_ln_* алатки со репрезентативен влез, со вклучен
// LN_STRICT_TEMPLATE. Две работи ги фаќа:
//
//   1. Генератор што воопшто не се рендерира (throw, или isError одговор).
//   2. Data клуч што темплејтот не го содржи — види template_engine.js.
//      Токму тоа помина незабележано кога `_src/tables/table.html` го изгуби
//      {{thead_attrs}}: builders.js го пресметуваше data-ln-sort, темплејтот
//      немаше каде да го стави, сортирањето беше мртво во секоја data-driven
//      табела, и НИТУ ЕДНА постоечка проверка не пријави ништо.
//
// Влезот е намерно минимален-но-репрезентативен: доволно за да се допре секоја
// гранка што емитува markup (sortable + filterable колона, select поле со
// опции, вгнездена содржина), не и целосно покритие. Ова не е тест-suite.
//
// Употреба: npm run smoke:generators     (exit 1 при наод)

process.env.LN_STRICT_TEMPLATE = "1";

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { z } from "zod";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS_DIR = path.join(REPO_ROOT, "tools");

const COLUMNS = [{ field: "name", label: "Име", sortable: true, filterable: true }];
const FIELDS = [
	{ name: "name", label: "Име", type: "text", required: true },
	{ name: "role", label: "Улога", type: "select", options: [{ label: "Админ", value: "admin" }] }
];

/** Репрезентативен влез по алатка. Нова generate_ln_* алатка МОРА да добие запис тука. */
const FIXTURES = {
	generate_ln_accordion: { id: "acc", panels: [{ title: "А", content: "<p>x</p>" }] },
	generate_ln_card: { id: "card", title: "Наслов", content: "<p>x</p>" },
	generate_ln_crud_module: {
		id: "users-module", resource: "users", resource_title: "Корисници",
		resource_singular: "Корисник", columns: COLUMNS, form_fields: FIELDS
	},
	generate_ln_data_coordinator: {
		id: "coord", resource: "users", store_id: "users",
		children_html: "<div>дете</div>", window: 50
	},
	generate_ln_dictionary: { entries: [{ key: "k", value: "v" }] },
	generate_ln_dropdown: { id: "dd", trigger_label: "Мени", items: [{ title: "Ставка", href: "#x" }] },
	generate_ln_empty_state: { id: "empty" },
	generate_ln_form: { id: "form", action: "/api/users", fields: FIELDS },
	generate_ln_modal: { id: "modal", title: "Наслов", body_html: "<p>x</p>" },
	generate_ln_page: { title: "Страница" },
	generate_ln_popover: { id: "pop", content_html: "<p>x</p>" },
	generate_ln_search: { id: "search", target_id: "users" },
	generate_ln_sort: { target: "users", fields: [{ field: "name", label: "Име" }] },
	generate_ln_stat_card: { id: "stat", label: "Вкупно", value: "42" },
	generate_ln_stepper: { id: "step", steps: [{ label: "Чекор" }] },
	generate_ln_table: {
		id: "tbl", name: "users", source: "users", columns: COLUMNS,
		empty_title: "Празно", modal_id: "m", form_id: "f"
	},
	generate_ln_tabs: { id: "tabs", tabs: [{ key: "info", title: "Инфо", content: "<p>x</p>" }] },
	generate_ln_timeline: { id: "tl", items: [{ title: "Настан", timestamp: "2026-01-01" }] },
	generate_ln_upload: { id: "up", name: "file", action_url: "/upload" }
};

async function main() {
	const generators = fs
		.readdirSync(TOOLS_DIR)
		.filter((f) => f.startsWith("generate_ln_") && f.endsWith(".js"))
		.map((f) => f.replace(/\.js$/, ""))
		.sort();

	const failures = [];

	// Нов генератор без фикстура е тивка дупка во покритието — пријави ја.
	for (const g of generators) {
		if (!FIXTURES[g]) failures.push(`${g}: нема фикстура во scripts/smoke-generators.js`);
	}
	for (const g of Object.keys(FIXTURES)) {
		if (!generators.includes(g)) failures.push(`${g}: фикстура за непостоечка алатка`);
	}

	let rendered = 0;
	for (const g of generators) {
		if (!FIXTURES[g]) continue;
		try {
			const mod = await import(pathToFileURL(path.join(TOOLS_DIR, `${g}.js`)).href);

			// Валидирај ја фикстурата наспроти вистинската zod схема ПРЕД да
			// повикаш. Без ова, фикстура со застарено име на поле (`target`
			// наместо `target_id`, `label` наместо `title`) тивко поминува:
			// handler-от прима undefined, рендерира деградиран излез, и smoke-от
			// пријавува зелено додека реалниот пат воопшто не е допрен. MCP
			// секогаш валидира пред handler — оваа скрипта мора да го прави
			// истото за да мери нешто вистинско. (5 од првите фикстури беа
			// погрешни токму вака.)
			const parsed = z.object(mod.definition.inputSchema).safeParse(FIXTURES[g]);
			if (!parsed.success) {
				const issue = parsed.error.issues[0];
				failures.push(`${g}: фикстурата не ја задоволува схемата — ${issue.path.join(".") || "(root)"}: ${issue.message}`);
				continue;
			}

			const result = await mod.handler(parsed.data);
			if (result?.isError) {
				failures.push(`${g}: врати isError — ${result.content?.[0]?.text?.slice(0, 120)}`);
				continue;
			}
			if (!result?.content?.[0]?.text) {
				failures.push(`${g}: празен одговор`);
				continue;
			}
			rendered++;
		} catch (e) {
			failures.push(`${g}: ${e.message.slice(0, 200)}`);
		}
	}

	console.log(`smoke-generators: рендерирани ${rendered}/${generators.length} генератори (строг режим)`);

	if (!failures.length) {
		console.log("smoke-generators: договорот темплејт↔builder е цел ✓");
		return;
	}

	console.error(`\nsmoke-generators: ${failures.length} проблем(и):\n`);
	for (const f of failures) console.error(`  ${f}`);
	process.exit(1);
}

main();
```

**4c.** Врзи го во `package.json`:

```json
		"lint:docs": "node tools/ashlar/lint-cli.js",
		"lint:snippets": "node scripts/lint-snippets.js",
		"smoke:generators": "node scripts/smoke-generators.js",
		"sync:ln-attrs": "node scripts/sync-ln-attrs.js"
```

#### Проверка

Прво мора да помине чисто:

```bash
npm run smoke:generators
```

Очекувано (потврдено при валидација на овој план):

```
smoke-generators: рендерирани 19/19 генератори (строг режим)
smoke-generators: договорот темплејт↔builder е цел ✓
```

Потоа **докажи дека го фаќа токму инцидентот** — реконструирај го. Работи преку
бајт-копија, не преку `git`:

```bash
cp tools/snippets/_src/tables/table.html /tmp/table.bak      # 1. копија

sed -i 's/<thead{{thead_attrs}}>/<thead>/' tools/snippets/_src/tables/table.html
npm run smoke:generators ; echo "exit=$?"                    # 2. мора: exit=1

cp /tmp/table.bak tools/snippets/_src/tables/table.html      # 3. врати БАЈТ-ЗА-БАЈТ
npm run smoke:generators ; echo "exit=$?"                    # 4. мора: exit=0
git status --short tools/snippets/_src/tables/table.html     # 5. мора да е како пред чекор 1
```

Чекор 2 мора да падне и да именува `generate_ln_table` **и**
`generate_ln_crud_module` со порака за `thead_attrs`.

⚠️ **Две замки, обете наидени при валидација на овој план:**

1. **Не враќај со `git checkout`.** Токму таа команда го предизвика инцидентот
   од 0.2. По Задача 1 работата е commit-ирана па не би бил деструктивен — но
   навиката е поважна од конкретниот случај.
2. **Не враќај со обратен `sed`.** `sed -i` на Windows ги преработува CRLF во
   LF — фајлот излегува текстуално идентичен, но со 14 бајти помалку, и целиот
   се појавува како променет во `git diff`. Затоа чекор 3 е `cp` од копијата, а
   чекор 5 го потврдува тоа. (Ова е и причината зошто `template_engine.js`
   нормализира CRLF→LF при вчитување — види коментарот таму.)

**Ако чекор 2 не падне, скриптата е бескорисна.** Не ја commit-ирај додека не
го видиш неуспехот.

#### Ризик

Низок. Строгиот режим е исклучен по дифолт — серверот е недопрен. Единствената
површина е самиот `if` во `compileTemplate`, што при `LN_STRICT_TEMPLATE`
неподесен е една споредба на стринг по повик.

**Commit:** `feat(smoke): строг договор темплејт↔builder + рендерирање на сите 19 генератори`

---

## ФАЗА 3 — Верификација што никогаш не е пуштена

### Задача 5. Потврди го `publicBaseUrl` наспроти живиот deployment

**Приоритет:** 🔴 Оваа е безбедносна и **сè уште не е потврдена**
**Фајл:** нема — само верификација
**Време:** 15 минути

#### Зошто

План 1, Задача 1 е изведена: `config/oauth.json` сега носи
`"publicBaseUrl": "https://mcp.livenetworks.mk"`.

Но **верификацијата од План 1 никогаш не е пријавена како пуштена**, и
вредноста не може да се потврди однадвор. Ако хостот е погрешен, OAuth flow-от
е скршен — а тоа нема да го забележиш додека вистински MCP клиент не се обиде
да се поврзе.

Дотогаш, поправката или работи или го скрши логирањето. Мора да знаеш кое.

#### Што

Стартувај го серверот и пушти ги двете проверки од План 1 што недостасуваат:

```bash
npm start   # во посебен терминал

# 1. Discovery не смее да го слуша Host
curl -s -H "Host: evil.example.com" \
     http://localhost:8080/.well-known/oauth-authorization-server

# 2. 401 патот исто
curl -s -i -H "Host: evil.example.com" http://localhost:8080/mcp \
     | grep -i www-authenticate
```

Во двата случаја мора да се појави `https://mcp.livenetworks.mk`, никаде
`evil.example.com`.

Потоа — **и ова е делот што не смее да се прескокне** — потврди дека
`https://mcp.livenetworks.mk` е навистина јавната адреса на овој сервер:

```bash
# од машина надвор од серверот
curl -s https://mcp.livenetworks.mk/.well-known/oauth-protected-resource
```

Ако тоа не одговори, вредноста е погрешна и OAuth ќе се скрши при следниот
клиент. Земи ја точната адреса од конфигурацијата на reverse proxy-то.

Најпосле, вистински end-to-end: поврзи вистински MCP клиент и потврди дека
целиот OAuth + PKCE flow се комплетира.

#### Ризик

Ако хостот е погрешен: OAuth целосно скршен. Затоа оваа задача постои како
одделна ставка наместо да се смета за завршена со План 1.

---

## ФАЗА 4 — Одложено од оригиналното ревју

Овие беа свесно исклучени од План 1. Сега кога санацијата е при крај, вреди да
се одлучи што од нив влегува.

### Задача 6. Врати го интеграцискиот тест

**Приоритет:** 🟠 Највисока вредност од сите преостанати
**Време:** ~2 часа

#### Зошто

Три безбедносни инваријанти во моментов немаат **никакво** покритие:

| Инваријанта | Каде живее | Што ако се скрши |
|---|---|---|
| целиот OAuth + PKCE flow | `routes/oauth.js` | тивка авторизациска дупка |
| `/mcp` бара автентикација | `middleware/auth.js` | целосно отворен сервер |
| MCP сесија врзана за корисник | `server.js:210-213`, `:296-299` | корисник А чита од сесијата на Б |

Ниту `lint:snippets`, ниту `smoke:generators`, ниту `sync --check` не ја
допираат ниту една од нив — сите три се за генератор слојот.

Избришаниот `test/integration.test.js` ги покриваше сите три. Тој кревал
вистински `node server.js` процес на `PORT=8099` со фикстур корен и го возел
целиот flow.

**Ова е единствената ставка од овој план што чини повеќе од еден ден работа —
и единствената што покрива безбедносна површина.** Ако нешто се сече поради
време, нека не биде оваа.

#### Што

Врати го фајлот од git историјата:

```bash
git show HEAD~1:test/integration.test.js > test/integration.test.js
```

(Прилагоди го referencata ако бришењето е во друг commit — најди го со
`git log --diff-filter=D --oneline -- test/integration.test.js`.)

Потоа:
- Врати ги фикстурите што му требаат: `test/fixtures/ashlar-repo*/`.
- Врати го `"test": "node --test test/*.test.js"` во `package.json` — или, ако
  сакате да остане надвор од `npm test`, дај му своја скрипта:
  `"test:integration": "node --test test/integration.test.js"`.
- Провери дека и понатаму поминува. Тој ги чита вистинските креденцијали од
  `config/auth.json` во runtime — **не ги хардкодирај**.

⚠️ Провери дали тестот претпоставува нешто што План 1 го промени — најверојатно
`middleware/rate-limit.js` (беше во `routes/oauth.js`) и `publicBaseUrl` (сега
конфигуриран, па discovery одговорите повеќе не го следат `Host` од барањето).
Второто е особено веројатно да скрши asserts.

**Одлука за сопственикот:** ова делумно го враќа она што гранката намерно го
тргна. Ако одлуката „без тест-suite" стои, алтернатива е тестот да живее како
одделна скрипта надвор од `npm test` (`npm run test:integration`), пуштана
рачно пред deployment. Помалку добро од CI, многу подобро од ништо.

---

### Задача 7. Врзи го authorization code-от за `client_id` и `redirect_uri`

**Приоритет:** 🔵 Ниско — PKCE го покрива главниот напад
**Фајл:** `routes/oauth.js`
**Време:** 30 минути

#### Зошто

При размена на код во `/token`, серверот проверува само дека JWT-от е валиден,
неискористен и (ако носи `code_challenge`) дека `code_verifier` се совпаѓа.
Не проверува дека кодот е издаден за **истиот** `client_id` и `redirect_uri`.

PKCE го покрива главниот сценарио (украден код без verifier е бескорисен). Но
клиент што не праќа `code_challenge` воопшто не добива таа заштита — а
серверот го дозволува тоа, види `if (payload.code_challenge)`.

#### Што

Во `POST /authorize`, внеси ги во payload-от на кодот:

```js
	const codePayload = { username, jti: randomUUID(), client_id, redirect_uri };
```

Во `POST /token`, по `jwt.verify`, спореди ги со подадените:

```js
	if (payload.client_id && payload.client_id !== client_id) {
		return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id не одговара на издадениот код.' });
	}
	if (payload.redirect_uri && payload.redirect_uri !== redirect_uri) {
		return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri не одговара на издадениот код.' });
	}
```

Условните проверки (`payload.client_id &&`) значат дека кодовите издадени пред
оваа измена и понатаму се разменуваат до истекот — избегнува 5-минутен прозорец
на скршени најави при deployment.

⚠️ Ако Задача 6 е изведена, интеграцискиот тест мора да се ажурира — тој веројатно
разменува код без да го праќа истиот `redirect_uri`.

---

### Задача 8. Одлука: `config/gemini.json` во git

**Приоритет:** — (одлука, не работа)

Пренесена непроменета од План 1, Задача 12. **Сè уште чека одговор.**

Накратко: фајлот е трекиран и содржи патеки специфични за машина
(`geminiHome`, `geminiCwd` = `/home/…`), додека `auth.json` и `jwt.json` се
gitignore-ирани. Но тоа е **свесна претходна одлука** — `plans/review-plan-tool-impl.md`
експлицитно вели дека следи по углед на `oauth.json`, без тајни. Проверено:
нема тајни во него.

Прашањето стои: статус кво, или во `.gitignore` со `gemini.example.json` како
шаблон? Не менувај ништо додека нема одговор.

---

### Задача 9. Пријави ја застарената `ln-table.md` во ln-ashlar

**Приоритет:** 🔵 — **не е работа во овој репозиториум**

`sync:ln-attrs` drift извештајот покажува 13 атрибути што се во схемата на
ln-ashlar но ги нема во кодот, вклучително:

```
data-ln-table-window, data-ln-table-window-page,
data-ln-table-window-threshold, data-ln-table-count
```

`docs-mcp/components/ln-table.md` во **ln-ashlar** сè уште ги документира, иако
`js/**` веќе не ги чита — што е и причината зошто `builders.js` носи коментар
дека виртуелизацијата се конфигурира на store-от. Плус 28 атрибути што се во
кодот а ги нема во схемата.

Отвори issue во ln-ashlar. Тука нема што да се поправа — `sync:ln-attrs`
намерно го зема кодот како извор на вистина, не схемата, и тоа е точно.

---

## Финална проверка пред PR

```bash
npm run sync:ln-attrs -- --check --root=../ln-ashlar ; echo "exit=$?"   # 0
npm run lint:snippets                                ; echo "exit=$?"   # 0
npm run smoke:generators                             ; echo "exit=$?"   # 0
DOCS_CORPUS_ROOTS=../ln-ashlar npm run lint:docs     ; echo "exit=$?"   # 0
```

Забелешка: `lint:docs` **без** `DOCS_CORPUS_ROOTS` враќа exit 2 („no corpus
roots configured"). Тоа не е регресија — линтерот бара корен. Со корен враќа
exit 0 и пријавува 53 постоечки проблеми во корпусот на **ln-ashlar** (туѓ
репозиториум, види Задача 9).

Плус рачно:

- [ ] сите алатки се вчитуваат: 36
- [ ] `npm start` крева сервер и пишува `Prepared tool … for registration` × 36
- [ ] `curl -H "Host: evil.example.com"` не го менува discovery одговорот (Задача 5)
- [ ] `https://mcp.livenetworks.mk` навистина одговара однадвор (Задача 5)
- [ ] вистински MCP клиент го комплетира OAuth flow-от
- [ ] `git status --short` е чист — ништо неcommit-ирано

### Редослед на извршување

```
Фаза 1:  Задача 1 (commit-и)  →  Задача 2 (sync)  →  Задача 4  →  Задача 3 (README)
                                                          ↑
                              README мора ПОСЛЕ smoke скриптата да постои

Фаза 3:  Задача 5 — може паралелно, не допира код

Фаза 4:  Задача 6 (одлука + ~2ч)  ·  Задача 7  ·  Задача 8 (одлука)  ·  Задача 9 (друг репо)
```

### Мапа

| # | Ставка | Потекло | Приоритет |
|---|---|---|---|
| 1 | Раздели во commit-и | инцидент 0.2 | 🔴 |
| 2 | Доврши Задача 8 + извади `html/**` | недовршено + внесена лага | 🟠 |
| 3 | README — трите проверки | пропуст во План 1 | 🟡 |
| 4 | Строг договор темплејт↔builder | инцидент 0.2 | 🟠 |
| 5 | Потврди `publicBaseUrl` во живо | непуштена верификација | 🔴 |
| 6 | Интеграциски тест | одложено од ревјуто | 🟠 |
| 7 | Code binding за `client_id`/`redirect_uri` | одложено од ревјуто | 🔵 |
| 8 | `gemini.json` — одлука | чека од План 1 | — |
| 9 | ln-ashlar докс дрифт | туѓ репозиториум | 🔵 |
