# План за санација по ревју на кодот — `ln-ashlar-mcp`

**Датум на ревјуто:** 2026-08-08
**Гранка при ревјуто:** `feat/snippets-ln-attr-conformance`
**За кого е овој документ:** за изведувач што го знае JavaScript-от, но НЕ ја знае
историјата на овој репозиториум. Секоја задача носи **Зошто** (што е погрешно и
која е последицата), **Што** (точната измена) и **Проверка** (како да се увери
дека поправката работи).

Не е потребно да се читаат сите задачи однапред. Изведувај ги по редослед —
редоследот е намерен: Фаза 2 менува код што Фаза 3 потоа го заклучува со
автоматска проверка.

---

## 0. Ориентација пред да почнеш

### 0.1 Што е овој проект

MCP (Model Context Protocol) сервер преку HTTP што опслужува две работи кон
LLM клиент (Claude):

1. **Корпус слој** (`tools/ashlar/**`, `tools/get_*.js`, `tools/knowledge*`) —
   индексира markdown документација од N „корпус корени" (репозиториуми на
   диск) и одговара на прашања за компоненти, атрибути, настани.
2. **Генератор слој** (`tools/generate_ln_*.js`, `tools/snippets/**`) — гради
   готов HTML снипет за ln-ashlar компонента. Ова е слојот со најмногу свежи
   измени и со најмногу наоди.

Плус OAuth 2.0 + PKCE слој (`routes/oauth.js`, `middleware/auth.js`) бидејќи
Claude се автентицира кон серверот преку стандарден OAuth flow.

### 0.2 Конвенции што МОРА да ги почитуваш

| Правило | Зошто |
|---|---|
| ESM (`import`, не `require`) | `"type": "module"` во package.json |
| **Табови**, не спејсови | целиот репо е на табови; `template_engine.js` дури нормализира на табови |
| Патеки преку `fileURLToPath(import.meta.url)`, никогаш `process.cwd()` | серверот се стартува како systemd сервис од непознат cwd |
| Без нови npm зависимости | одлука од `plans/review-plan-tool-impl.md`; држи ја |
| Коментарите објаснуваат **зошто**, не **што** | види `tools/snippets/builders.js` — тие коментари се вредни, НЕ ги кратете при уредување |
| Коментари на македонски во `tools/snippets/**` и `scripts/**`; англиски во `tools/ashlar/**` | постоечка поделба, задржи ја по фајл |

### 0.3 Како да пуштиш нешто

```bash
npm start                                           # серверот, порт 8080
npm run lint:docs                                   # линтер за корпусот
npm run sync:ln-attrs -- --check --root=../ln-ashlar   # drift проверка
```

**НЕМА `npm test`.** Тест-suite-от е избришан на оваа гранка (24 фајла, staged
за бришење). Тоа само по себе е Задача 5 подолу. Додека не ја завршиш неа,
единствената автоматска мрежа е `--check` командата горе.

### 0.4 Постави го baseline-от пред да допреш нешто

```bash
cd c:/laragon/www/ln-ashlar-mcp
git status --short                  # запиши си ја состојбата
npm run sync:ln-attrs -- --check --root=../ln-ashlar ; echo "exit=$?"
```

Очекувано: `exit=0`, и извештај „скенирани 243 фајлови, 236 атрибути во кодот".
Ако не е 0 — **застани** и прво регенерирај (`без --check`), инаку не знаеш дали
подоцнежен неуспех е твој или беше веќе таму.

### 0.5 Стратегија за гранки и commit-и

Работи на нова гранка од тековната:

```bash
git checkout -b fix/code-review-remediation
```

**Еден commit по задача.** Не ги спојувај — Задача 2 е безбедносна поправка што
можеби ќе треба да се cherry-pick-не сама во продукција пред останатите да се
тестираат. Формат на порака: како постоечките (`fix(scope): опис на македонски`).

---

## ФАЗА 1 — Безбедност

### Задача 1. Затвори го host-header injection-от во OAuth discovery

**Приоритет:** 🔴 Блокер. Изведи ја прва, пушти ја во продукција пред останатото.
**Фајл:** `config/oauth.json` (само конфиг — БЕЗ измена на код)
**Време:** 5 минути

#### Зошто

`middleware/public-url.js` ја резолвира јавната адреса на серверот вака:

```js
export function getBaseUrl(req) {
	if (publicBaseUrl) return publicBaseUrl.replace(/\/+$/, '');   // ← конфигуриран пат
	const xfProto = req.headers['x-forwarded-proto'];               // ← fallback
	const proto = (xfProto ? String(xfProto).split(',')[0].trim() : req.protocol) || 'https';
	const host = req.headers['host'] || 'localhost';
	return `${proto}://${host}`;
}
```

Кодот е точен — проблемот е што `config/oauth.json` **го нема** полето
`publicBaseUrl`, иако `config/oauth.example.json` го документира. Значи серверот
секогаш паѓа на fallback-от и му верува на `Host` заглавието што го праќа
клиентот.

Тој стринг потоа оди на три места:

| Каде | Што станува контролирано од напаѓач |
|---|---|
| `routes/oauth.js` → `/.well-known/oauth-authorization-server` | `issuer`, `authorization_endpoint`, `token_endpoint` |
| `routes/oauth.js` → `/.well-known/oauth-protected-resource` | `resource`, `authorization_servers[]` |
| `middleware/auth.js` → 401 одговор | `WWW-Authenticate: Bearer resource_metadata="…"` |

**Нападот:** напаѓачот наведува MCP клиент да направи discovery со затруено
`Host: evil.example.com`. Одговорот што клиентот го добива му кажува дека
authorization endpoint-от е кај напаѓачот. Клиентот таму го праќа корисникот да
се логира — а корисникот ги внесува своите ln-ashlar креденцијали на туѓа
страница. Reverse proxy пред серверот НЕ те штити автоматски; мора да го
нормализира `Host`, а тука не знаеме дека го прави.

#### Што

Додај го полето во `config/oauth.json`. Финалната содржина:

```json
{
	"allowedRedirects": [
		"https://claude.ai/api/mcp/auth_callback",
		"https://claude.com/api/mcp/auth_callback"
	],
	"allowLoopbackRedirects": true,
	"publicBaseUrl": "https://ВИСТИНСКИОТ-ХОСТ-НА-СЕРВЕРОТ"
}
```

⚠️ **Мораш да ја знаеш вистинската јавна адреса.** Не ја погодувај. Земи ја од
она што е конфигурирано во reverse proxy-то / DNS-от за овој сервер. Ако
погодиш погрешно, OAuth flow-от целосно ќе се скрши (клиентот ќе оди на
непостоечки endpoint) — што е гласен неуспех, не тивок, па ќе го забележиш
веднаш при проверката.

Забелешка: `config/oauth.json` **е** трекиран во git (за разлика од `auth.json`
и `jwt.json` кои се gitignore-ирани). Тоа е намерно — нема тајни во него. Но
значи дека вредноста што ќе ја commit-неш е онаа за продукција; ако локално
развиваш на друг хост, ќе треба локална измена што не се commit-ира.

#### Проверка

Стартувај го серверот и обиди се да го затруеш `Host`:

```bash
npm start   # во посебен терминал

curl -s -H "Host: evil.example.com" \
     http://localhost:8080/.well-known/oauth-authorization-server | grep issuer
```

**Пред поправката:** `"issuer":"http://evil.example.com"` ← ранливо
**По поправката:** `"issuer":"https://ВИСТИНСКИОТ-ХОСТ"` ← `Host` е игнориран ✓

Провери го и 401 патот:

```bash
curl -s -i -H "Host: evil.example.com" http://localhost:8080/mcp | grep -i www-authenticate
```

`resource_metadata="…"` мора да го содржи вистинскиот хост, не `evil.example.com`.

#### Ризик

Никаков за кодот. Единствен ризик е погрешна вредност → скршен OAuth, откриен
веднаш со проверката горе.

**Commit:** `fix(oauth): постави publicBaseUrl — Host заглавието веќе не ја одредува discovery адресата`

---

## ФАЗА 2 — Багови во логиката

### Задача 2. Поправи ја противречноста меѓу `mode` и `source` во `buildTable`

**Приоритет:** 🟠 Високо — погодува ја *дефолтната* форма на повик
**Фајлови:** `tools/snippets/builders.js`, `tools/generate_ln_table.js`
**Време:** ~45 минути

#### Зошто

`buildTable()` има два независни прекинувача што ја контролираат истата работа:

- `mode: "ssr" | "data-driven"` — параметар на MCP алатката, дефолт `"data-driven"`
- `source: string?` — id на `ln-data-store`, opcionalen

Внатре, различни делови од функцијата се потпираат на различен прекинувач:

```js
const dataDriven = Boolean(source);        // ← ред 372: сортирање и филтри гледаат во source
...
if (mode === "data-driven") {              // ← ред 421: ред-темплејтот гледа во mode
```

**Кој е вистинскиот прекинувач?** Авторитетниот контракт на ln-ashlar
(`docs-mcp/components/ln-table.md`, Attributes Table) вели недвосмислено:

> `data-ln-table-source` | Root container | `String` | — | **Enables Data-Driven mode.** Value maps to the target data store ID.

Значи `source` е прекинувачот. `mode` е втор, паралелен прекинувач што не
постои во ln-ashlar — тој е измислен на ниво на MCP алатката и токму тој ја
внесува противречноста.

**Последица, проверено со извршување** (`mode` дефолт, без `source` — т.е.
најобичниот повик што моделот ќе го направи):

```html
<div id="t1" data-ln-table="users" class="ln-table-wrapper">
  <thead>                                              ← НЕМА data-ln-sort
    <th data-ln-table-col="name" data-ln-table-sort="string">   ← SSR сортирање
  <tbody data-ln-table-body></tbody>                   ← data-driven празен tbody
  <template data-ln-template="users-row">              ← data-driven ред темплејт
```

Излегува мешавина: `data-ln-table-sort` (SSR) врз структура што е data-driven.
Сортирањето не работи во ниту еден правец. Истиот корен важи и за филтрите —
`filterable` колона во таа форма добива popover врзан на id-то на табелата, а
коментарот во `buildFilterPopover` (кој е точен) вели дека `ln-table:set-filter`
рано излегува кога табелата е data-driven, значи филтерот е мртов.

#### Што

**Принцип на поправката:** `source` е единствениот извор на вистина. `mode`
престанува да биде втор прекинувач.

Но `mode` НЕ смее тивко да се игнорира — некој што повикал со
`mode: "data-driven"` и без `source` има погрешен ментален модел и мора да добие
порака, не тивко деградиран markup.

**2a.** Во `tools/snippets/builders.js`, во `buildTable()`, замени го блокот
околу редовите 372-375. Тековно:

```js
	const dataDriven = Boolean(source);
	const sortTarget = dataDriven ? source : id;
	const filterTarget = dataDriven ? source : id;
	const hasSortable = columns.some((c) => c.sortable);
```

Ново:

```js
	// `source` е ЕДИНСТВЕНИОТ прекинувач на режимот. Така вели контрактот на
	// ln-ashlar: data-ln-table-source „Enables Data-Driven mode" (ln-table.md,
	// Attributes Table). `mode` е параметар само на MCP алатката и не постои во
	// ln-ashlar — кога двата не се согласуваа, ред-темплејтот се земаше од
	// `mode`, а сортирањето од `source`, па дефолтниот повик (mode=data-driven,
	// без source) даваше data-driven структура со SSR сорт атрибути: мртво
	// сортирање и мртви филтри.
	if (mode === "data-driven" && !source) {
		throw new Error(
			'buildTable: mode "data-driven" бара `source` (id на ln-data-store) — ' +
				"data-ln-table-source е тоа што го вклучува режимот. " +
				"За табела без извор на податоци подај mode: \"ssr\"."
		);
	}

	const dataDriven = Boolean(source);
	// Еден таргет за двете: и сортирањето и филтрите одат кон изворот кога го
	// има, инаку кон самата табела.
	const queryTarget = dataDriven ? source : id;
	const hasSortable = columns.some((c) => c.sortable);
```

**2b.** Замени ги трите употреби на старите имиња подолу во истата функција:

| Стар | Нов |
|---|---|
| `buildFilterPopover({ popoverId, targetId: filterTarget, column: col })` | `targetId: queryTarget` |
| `attr(ATTR.sort, sortTarget)` (во `thead_attrs`) | `attr(ATTR.sort, queryTarget)` |

(`sortTarget` и `filterTarget` беа буквално идентични изрази — затоа се спојуваат
во еден. Тоа е и Задача 9 од ревјуто, решена патем.)

**2c.** Врзи го ред-темплејтот за `dataDriven` наместо за `mode`. Тековно ред 421:

```js
	if (mode === "data-driven") {
```

Ново:

```js
	if (dataDriven) {
```

Со check-от од 2a, `mode === "data-driven"` и `dataDriven` сега се секогаш
еднакви — но врзувањето за `dataDriven` значи дека и во иднина постои само еден
прекинувач во телото на функцијата.

**2d.** Во `tools/generate_ln_table.js`, направи го договорот видлив за моделот.
Ажурирај го описот на `mode` во `inputSchema`:

```js
		mode: z
			.enum(["ssr", "data-driven"])
			.default("data-driven")
			.describe(
				"Режим. 'data-driven' БАРА `source` — data-ln-table-source е тоа што го вклучува режимот. " +
					"Без извор на податоци подај 'ssr'."
			),
```

И додај ја истата реченица во главниот `description` на алатката, веднаш по
првата: моделот го чита описот пред да повика, и таму е поевтино да се спречи
грешката отколку во throw.

**2e.** Handler-от треба да ја врати грешката како MCP грешка, не како
неуловена експлозија. На крајот од `tools/generate_ln_table.js`, обвиткај го
повикот:

```js
	try {
		return htmlResult(buildTable({ /* ...како сега... */ }));
	} catch (e) {
		return { content: [{ type: "text", text: e.message }], isError: true };
	}
```

⚠️ Провери дали `generate_ln_crud_module.js` е погоден: тој повикува
`buildTable({ mode: "data-driven", source: resource, ... })` — има `source`, па
поминува без измена. Тоа е и единствениот друг повикувач; потврди со:

```bash
grep -rn "buildTable(" tools/ --include=*.js
```

#### Проверка

```bash
node -e "
const b = await import('file:///c:/laragon/www/ln-ashlar-mcp/tools/snippets/builders.js');
const cols = [{field:'name',label:'Име',sortable:true,filterable:true}];

// 1. data-driven со source → data-ln-sort на thead, data-ln-sort-field на th
const dd = b.buildTable({id:'t',name:'users',source:'users',columns:cols});
console.log('thead sort :', /<thead data-ln-sort=\"users\">/.test(dd));
console.log('sort-field :', dd.includes('data-ln-sort-field=\"name\"'));
console.log('нема SSR   :', !dd.includes('data-ln-table-sort='));

// 2. ssr → data-ln-table-sort, БЕЗ ред темплејт
const ssr = b.buildTable({id:'t',name:'users',mode:'ssr',columns:cols});
console.log('SSR sort   :', ssr.includes('data-ln-table-sort=\"string\"'));
console.log('нема темплејт:', !ssr.includes('data-ln-template'));

// 3. противречната комбинација → фрла
try { b.buildTable({id:'t',name:'users',columns:cols}); console.log('ФАИЛ: не фрли'); }
catch (e) { console.log('фрла ✓ :', e.message.slice(0,50)); }
" --input-type=module
```

Сите шест реда мора да се `true` / `фрла ✓`.

Потоа провери дека CRUD модулот и понатаму се гради:

```bash
node -e "
const m = await import('file:///c:/laragon/www/ln-ashlar-mcp/tools/generate_ln_crud_module.js');
const r = await m.handler({id:'u-mod',resource:'users',resource_title:'Корисници',
  resource_singular:'Корисник',columns:[{field:'name',label:'Име',sortable:true}],form_fields:[]});
console.log(r.content[0].text.includes('data-ln-sort=\"users\"') ? 'CRUD ОК ✓' : 'CRUD СКРШЕН ✗');
" --input-type=module
```

#### Ризик

Среден. `throw` за комбинација што претходно тивко минуваше значи дека повик кој
„работеше" сега враќа грешка. Тоа е намерно — тој повик произведуваше скршен
markup. Но ако некој надворешен клиент зависи од старото однесување, ќе го види
како регресија. Затоа 2d (описот) е задолжителен дел, не опционален: моделот
мора да знае да подаде `source`.

**Commit:** `fix(table): source е единствениот прекинувач на режимот, mode повеќе не му противречи`

---

### Задача 3. Затвори го заобиколувањето на iteration cap-от во `review_plan`

**Приоритет:** 🟡 Средно
**Фајл:** `tools/review_plan.js`
**Време:** 10 минути

#### Зошто

`review_plan` праќа план кон надворешен Gemini CLI за критика. Дизајнот
предвидува најмногу 3 итерации, и описот на алатката тоа му го ветува на моделот:

> „STOP when the Verdict is APPROVE or when `iteration` reaches 3 — **the server rejects `iteration` > 3**"

Серверот не го прави тоа. Проверката е:

```js
if (!wrap_up && iteration > cfg.maxIterations) {
```

`iteration` е `z.number().int().min(1).optional()` — значи смее да недостига. А
во JavaScript `undefined > 3` е `false` (потврдено со извршување). Клиент што
едноставно не го праќа полето поминува неограничено.

Последица: неограничени повици кон платен надворешен LLM, секој со
`timeoutMs: 240000` и `concurrency: 2`. Не е катастрофа (concurrency gate-от
држи), но лимитот што е ветен во описот не постои.

#### Што

Во `tools/review_plan.js`, во `handler`, замени:

```js
	if (!wrap_up && iteration > cfg.maxIterations) {
```

со:

```js
	// `iteration` е optional во схемата, а `undefined > 3` е false — без овој
	// default клиент што полето го изоставува го заобиколуваше лимитот целосно.
	const currentIteration = iteration ?? 1;

	if (!wrap_up && currentIteration > cfg.maxIterations) {
```

И во телото на грешката користи го `currentIteration`:

```js
				text: `Iteration ${currentIteration} exceeds the maximum of ${cfg.maxIterations}. Stop iterating and finalize your plan.`
```

**Не ги менувај** `logger.info({ ..., iteration, ... })` повиците. Тие намерно
логираат што клиентот вистински пратил (вклучително `undefined`) — тоа е
телеметрија за однесувањето на клиентот, а не влез во одлуката. Ако ги замениш
со `currentIteration`, ја губиш можноста да видиш кој клиент не го праќа полето.

#### Проверка

```bash
node -e "console.log('undefined > 3 =', undefined > 3, '| (undefined ?? 1) > 3 =', (undefined ?? 1) > 3)"
```

Функционална проверка без вистински Gemini повик — `maxIterations` доаѓа од
`config/gemini.json`, па привремено намали го на `1`, потоа:

```bash
node -e "
const m = await import('file:///c:/laragon/www/ln-ashlar-mcp/tools/review_plan.js');
const r = await m.handler({ plan: 'тест', iteration: 5 });
console.log('со iteration=5 →', r.isError ? 'одбиено ✓' : 'ПРОПУШТЕНО ✗');
" --input-type=module
```

Со `iteration: 5` мора да е одбиено. Врати го `maxIterations` на 3 потоа.

**Commit:** `fix(review_plan): iteration cap-от веќе не се заобиколува со изоставување на полето`

---

### Задача 4. Поправи ја мртвата `search_fields` хеуристика во CRUD модулот

**Приоритет:** 🟡 Средно
**Фајл:** `tools/generate_ln_crud_module.js`
**Време:** 20 минути — **бара одлука, види подолу**

#### Зошто

`generate_ln_crud_module.js` одлучува кои полиња одат во
`data-ln-data-store-search-fields`:

```js
	searchFields: columns.filter((c) => !c.sort_type || c.sort_type === "string").map((c) => c.field),
```

Намерата е очигледна: „само текстуални колони — нема смисла full-text пребарување
низ броеви и датуми". Но сигналот што го користи е погрешен. `sort_type` е
документиран во `tools/snippets/column_schema.js` вака:

```js
	sort_type: z.enum(SORT_TYPES).optional()
		.describe("Тип за споредба — САМО во SSR режим (data-ln-table-sort). Data-driven споредбата ја прави store-от."),
```

А CRUD модулот е **секогаш** data-driven (`buildTable({ mode: "data-driven",
source: resource })`). Значи `sort_type` во тој контекст никогаш не се поставува,
`!c.sort_type` е секогаш `true`, и филтерот пропушта сè. Проверено:

```
колони: name, age, created_at  →  search_fields = ['name', 'age', 'created_at']
```

Резултат: IndexedDB прави full-text пребарување и низ нумерички и низ датумски
полиња. Не е скршено функционално, но е тивко спротивно од намерата — и, што е
поважно, е **точно истиот вид дрифт** што `column_schema.js` беше создаден да го
спречи (прочитај го коментарот на врвот од тој фајл).

#### Што — потребна е одлука

Има два чесни пата. Изведувачот нека избере и нека го запише изборот во
commit пораката.

**Опција A (препорачана) — експлицитно поле во схемата.**

Додај `searchable` во `columnSchema` во `tools/snippets/column_schema.js`:

```js
	searchable: z
		.boolean()
		.optional()
		.describe(
			"Полето влегува во data-ln-data-store-search-fields. Дефолт: true за текстуални колони. " +
				"Постави false за нумерички/датумски — full-text низ нив само внесува шум."
		),
```

И во `generate_ln_crud_module.js`:

```js
		// `sort_type` НЕ е употреблив сигнал тука: тој е документиран како
		// САМО-SSR (види column_schema.js), а CRUD модулот е секогаш
		// data-driven — значи никогаш не е поставен и стариот филтер
		// `!c.sort_type || c.sort_type === "string"` пропушташе апсолутно сè.
		searchFields: columns.filter((c) => c.searchable !== false).map((c) => c.field),
```

Однесувањето по дифолт останува исто како сега (сè е search field), но
повикувачот сега **може** да исклучи колона, и описот му кажува кога треба.
Нема тивка промена на излезот за постоечки повици.

**Опција B — тргни ја хеуристиката.**

Ако се согласиш дека „сите колони се пребарливи" е прифатлив дифолт, замени со:

```js
		// Сите колони се пребарливи. Хеуристиката што беше тука се потпираше на
		// `sort_type`, кој е САМО-SSR сигнал (column_schema.js) и во CRUD
		// модулот никогаш не е поставен — филтерот пропушташе сè, што значи
		// дека ова е и досегашното фактичко однесување, само сега е искрено.
		searchFields: columns.map((c) => c.field),
```

Помалку код, ист излез, нула нова површина. Легитимен избор ако не сакате уште
едно поле во схемата.

**Не прифаќај:** „поправи ја хеуристиката да гледа во нешто друго што го
погодува типот". Погодувањето тип од име на поле (`created_at` → датум) е точно
таквата магија што овој репо ја одбегнува насекаде.

#### Проверка

```bash
node -e "
const m = await import('file:///c:/laragon/www/ln-ashlar-mcp/tools/generate_ln_crud_module.js');
const r = await m.handler({
  id:'u', resource:'users', resource_title:'Корисници', resource_singular:'Корисник',
  columns:[{field:'name',label:'Име'},{field:'age',label:'Возраст',searchable:false}],
  form_fields:[]
});
const m2 = r.content[0].text.match(/data-ln-data-store-search-fields=\"([^\"]*)\"/);
console.log('search-fields =', m2 && m2[1]);
" --input-type=module
```

Со Опција A очекувај `name` (не `name,age`). Со Опција B очекувај `name,age` —
и тогаш тргни го `searchable` од тест повикот.

**Commit:** `fix(crud): search_fields веќе не се потпира на САМО-SSR сигналот sort_type`

---

## ФАЗА 3 — Врати ја заштитната мрежа

### Задача 5. Врати ја conformance проверката за `data-ln-*` атрибути

**Приоритет:** 🟠 Високо — ова е задачата што ги штити сите претходни
**Фајлови:** `scripts/lint-snippets.js` (нов), `package.json`
**Време:** ~30 минути

#### Зошто

На оваа гранка се избришани 24 тест фајла и `npm test` е отстранет од
`package.json`. README-то е ажурирано и сега тврди:

> „Нема тест-suite. Единствената автоматска проверка е дрифтот наспроти
> ln-ashlar изворот — `attributes.generated.js` мора да е свеж."

Тоа тврдење е **непотполно**, и разликата е важна:

- `sync:ln-attrs --check` проверува дали `attributes.generated.js` е свеж
  наспроти ln-ashlar. Тоа е половина од договорот.
- Другата половина — дали снипетите и builder-ите користат **само** атрибути што
  постојат — живееше во избришаниот `test/snippets.test.js`.

Доказ дека втората половина сега виси во празно: генерираниот фајл сè уште
експортира два симбола што **никој не ги троши**:

```
tools/snippets/attributes.generated.js:261  export const KNOWN_LN_ATTRS = new Set([...])
tools/snippets/attributes.generated.js:501  export const ATTR_COUNT = 236;
```

Нивниот единствен потрошувач беше избришаниот тест. Тие постојат специјално за
оваа проверка.

**Зошто е ова важно, а не козметика:** снипет што реферира избришан
`data-ln-*` атрибут изгледа совршено точно. Нема да падне, нема да фрли, нема
да се обои црвено во ниту еден линтер. Едноставно тивко не работи во browser-от,
кај корисникот. Тоа е точно класата грешка што автоматска проверка ја фаќа, а
преглед со очи не ја фаќа.

Јас рачно ја пуштив проверката при ревјуто — **моментално нема ghost атрибути**.
Значи оваа задача не поправа постоечка грешка; таа го заклучува тековното
исправно однесување за да не регресира.

#### Што

Создај `scripts/lint-snippets.js`:

```js
#!/usr/bin/env node
// scripts/lint-snippets.js
//
// Conformance: секој data-ln-* што го емитува генератор МОРА да постои во
// ln-ashlar.
//
// Ова е втората половина од договорот што го чува sync-ln-attrs.js.
// sync:ln-attrs --check гарантира дека attributes.generated.js е свеж наспроти
// ln-ashlar. ОВАА скрипта гарантира дека _src/**.html и builders-ите користат
// само атрибути од тој сет. Без неа, снипет со избришан или измислен атрибут
// изгледа точно, не фрла никаде, и тивко не работи кај корисникот.
//
// Порано ова беше test/snippets.test.js. Тестовите се тргнати; проверката не
// смее да си оди со нив — таа е единственото нешто што ги држи генераторите
// врзани за реалноста.
//
// Употреба: npm run lint:snippets     (exit 1 при наод)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { KNOWN_LN_ATTRS } from "../tools/snippets/attributes.generated.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ATTR_RE = /data-ln-[a-z0-9-]+/g;

/** Директориуми што се скенираат, релативно на коренот на репото. */
const SCAN = [
	{ dir: "tools/snippets/_src", exts: [".html"] },
	{ dir: "tools/snippets", exts: [".js"] },
	{ dir: "tools", exts: [".js"] }
];

/** Генерираниот фајл ги СОДРЖИ сите атрибути по дефиниција — не се проверува сам. */
const SKIP_FILES = new Set([path.join(REPO_ROOT, "tools", "snippets", "attributes.generated.js")]);

/**
 * @param {string} dir
 * @param {string[]} exts
 * @param {string[]} [acc]
 * @returns {string[]}
 */
function walk(dir, exts, acc = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return acc;
	}
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, exts, acc);
		else if (exts.includes(path.extname(entry.name))) acc.push(full);
	}
	return acc;
}

function main() {
	const files = new Set();
	for (const { dir, exts } of SCAN) {
		for (const f of walk(path.join(REPO_ROOT, dir), exts)) {
			if (!SKIP_FILES.has(f)) files.add(f);
		}
	}

	const ghosts = new Map(); // attr -> Set<relPath>
	let scanned = 0;

	for (const file of files) {
		scanned++;
		const text = fs.readFileSync(file, "utf-8");
		for (const match of text.matchAll(ATTR_RE)) {
			if (KNOWN_LN_ATTRS.has(match[0])) continue;
			if (!ghosts.has(match[0])) ghosts.set(match[0], new Set());
			ghosts.get(match[0]).add(path.relative(REPO_ROOT, file));
		}
	}

	console.log(`lint-snippets: скенирани ${scanned} фајлови наспроти ${KNOWN_LN_ATTRS.size} познати атрибути`);

	if (!ghosts.size) {
		console.log("lint-snippets: нема ghost атрибути ✓");
		return;
	}

	console.error(`\nlint-snippets: ${ghosts.size} атрибут(и) што НЕ постојат во ln-ashlar:\n`);
	for (const [attr, where] of [...ghosts].sort()) {
		console.error(`  ${attr}`);
		for (const f of [...where].sort()) console.error(`      ${f}`);
	}
	console.error(
		"\nСекој од нив е тивко скршен снипет. Или е печатна грешка, или ln-ashlar\n" +
			"го избришал атрибутот. Ако е второто — пушти `npm run sync:ln-attrs`\n" +
			"и поправи го генераторот што сè уште го емитува."
	);
	process.exit(1);
}

main();
```

Потоа во `package.json`, во `scripts`:

```json
		"lint:docs": "node tools/ashlar/lint-cli.js",
		"lint:snippets": "node scripts/lint-snippets.js",
		"sync:ln-attrs": "node scripts/sync-ln-attrs.js"
```

**Забелешка за дизајнот — зошто скрипта, а не враќање на тестот:** одлуката да
се тргне `node --test` веќе е донесена и документирана во README. Оваа скрипта ја
почитува таа одлука: нула нови зависимости, нула тест-runner, се пушта исто како
двата постоечки линтера. Ако подоцна тест-suite-от се врати, таа може да се
повика и од тест.

**Забелешка за границите на проверката:** скрипта што grep-ира не разликува код
од коментар. Затоа `builders.js` содржи намерно скратен литерал во коментар
(`…api-endpoint`, ред ~236) — тој коментар објаснува зошто. Не го „поправај" на
целосно име; ќе ја паднеш проверката за атрибут што кодот воопшто не го емитува.

#### Проверка

Прво мора да помине чисто:

```bash
npm run lint:snippets
```

Очекуван излез (проверено при пишувањето на овој план):

```
lint-snippets: скенирани 77 фајлови наспроти 236 познати атрибути
lint-snippets: нема ghost атрибути ✓
```

Потоа докажи дека вистински фаќа — внеси намерна грешка и врати ја. Користи
**мали букви** во суфиксот; regex-от `data-ln-[a-z0-9-]+` не фаќа големи, па
`XYZ` би дал збунувачки скратен излез:

```bash
sed -i 's/data-ln-table-body/data-ln-table-body-xyz/' tools/snippets/_src/tables/table.html
npm run lint:snippets ; echo "exit=$?"      # мора: exit=1 + именуван фајлот

git checkout tools/snippets/_src/tables/table.html
npm run lint:snippets ; echo "exit=$?"      # мора: exit=0
```

Очекуван излез на средниот чекор:

```
lint-snippets: 1 атрибут(и) што НЕ постојат во ln-ashlar:

  data-ln-table-body-xyz
      tools\snippets\_src\tables\table.html
exit=1
```

**Ако вториот чекор врати exit=0, скриптата е бескорисна.** Не ја commit-ирај
додека не го видиш неуспехот.

#### Понатаму (опционално, спомени во PR-от)

Двете проверки се комплементарни и природно одат заедно во CI:

```bash
npm run sync:ln-attrs -- --check --root=../ln-ashlar && npm run lint:snippets
```

**Commit:** `feat(lint): врати ја conformance проверката за data-ln-* како самостојна скрипта`

---

## ФАЗА 4 — Хигиена

Овие се ситни и независни. Смеат да одат во еден заеднички commit.

### Задача 6. Исчисти ги референците кон избришаните тестови

**Фајлови:** `scripts/sync-ln-attrs.js`, `tools/snippets/README.md`, потоа регенерација

Седум места сè уште упатуваат на тест фајлови што ги нема:

| Фајл | Ред | Текст |
|---|---|---|
| `scripts/sync-ln-attrs.js` | 8 | `види test/knowledge-unconfigured.test.js` |
| `scripts/sync-ln-attrs.js` | 168 | (во template-от на генерираниот фајл) |
| `scripts/sync-ln-attrs.js` | 181 | `го троши conformance тестот во test/snippets.test.js` |
| `tools/snippets/attributes.generated.js` | 10, 258 | ← иста двојка, но **генерирани** |
| `tools/snippets/README.md` | 50, 52 | `test/snippets.test.js паѓа ако…` |

**Редослед е важен:** двете во `attributes.generated.js` НЕ смеат да се уредат
рачно (фајлот носи „⚠ ГЕНЕРИРАН ФАЈЛ — НЕ УРЕДУВАЈ РАЧНО"). Мораш да го поправиш
template-от во `renderModule()` во `sync-ln-attrs.js`, потоа да регенерираш:

```bash
npm run sync:ln-attrs -- --root=../ln-ashlar
```

Замени ги референците со насока кон новата скрипта од Задача 5, на пр.
`test/snippets.test.js` → `npm run lint:snippets` (`scripts/lint-snippets.js`).

**Затоа Задача 5 иде прва** — инаку ќе пишуваш референца кон нешто што не постои.

**Проверка:**
```bash
grep -rn "test/" scripts/ tools/snippets/ --include=*.js --include=*.md
```
Не смее да врати ништо. Потоа `npm run sync:ln-attrs -- --check --root=../ln-ashlar`
мора да е exit 0 (докажува дека регенерацијата е committed).

---

### Задача 7. `path.resolve('tools')` во `server.js` е врзан за cwd

**Фајл:** `server.js`, ред ~118

```js
const toolsDir = path.resolve('tools');
```

Ова се резолвира наспроти `process.cwd()`, не наспроти модулот. Ако серверот се
стартува од друг директориум, `fs.readdirSync` фрла, `catch`-от само логира, и
серверот се крева со **нула регистрирани алатки** — жив, отповеден, и целосно
бескорисен. Тивок неуспех.

Секаде на друго место во репото ова е решено правилно (`middleware/auth.js`,
`lib/gemini.js`, `template_engine.js`, `scripts/sync-ln-attrs.js`). Тука е
пропуштено.

Поправка — `server.js` веќе го увезува `pathToFileURL` од `url`, додај и
`fileURLToPath`:

```js
import { pathToFileURL, fileURLToPath } from 'url';
...
// Наспроти модулот, не наспроти cwd: серверот се стартува како сервис од
// непознат работен директориум, а неуспехот тука е тивок — нула алатки.
const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tools');
```

**Проверка:** стартувај од друг директориум и види дека алатките се кренати:

```bash
cd c:/ && node c:/laragon/www/ln-ashlar-mcp/server.js
```

Мора да испише низа `Prepared tool … for registration` (36 алатки). Пред
поправката: `Failed to read tools directory`. Прекини со Ctrl+C.

---

### Задача 8. `sync-ln-attrs.js` скенира `js/` за `.scss` фајлови

**Фајл:** `scripts/sync-ln-attrs.js`, ред ~32

```js
const SOURCE_DIRS = [
	{ dir: "js", exts: [".js", ".scss"] },   // ← .scss тука е copy-paste
	{ dir: "scss", exts: [".scss"] }
];
```

Безопасно (нема `.scss` под `js/`), но е погрешен сигнал за секој што го чита.
Смени на `{ dir: "js", exts: [".js"] }`.

**Проверка:** `npm run sync:ln-attrs -- --check --root=../ln-ashlar` мора и
понатаму да пријави **236 атрибути** и exit 0. Ако бројот се смени, немало
copy-paste и наодот бил погрешен — врати ја измената.

---

### Задача 9. `warnOnce` не прави тоа што вели

**Фајл:** `tools/ashlar/corpus.js`, редови 63-72

Docstring-от вели „Log a console.warn **once per distinct message**", но
имплементацијата чува само една последна порака:

```js
let lastWarnedState = null;
function warnOnce(message) {
	if (lastWarnedState === message) return;   // ← само ПОСЛЕДОВАТЕЛНИ повторувања
	lastWarnedState = message;
	console.warn(message);
}
```

При индексирање со повеќе различни предупредувања (пр. два корена без routing
contract + документ без frontmatter), тие се сменуваат едно со друго и **сите
палат при секој rebuild** — токму спамот што функцијата треба да го спречи.

Две прифатливи решенија:

**A. Направи го да одговара на docstring-от** (се препорачува):
```js
const warnedMessages = new Set();
function warnOnce(message) {
	if (warnedMessages.has(message)) return;
	warnedMessages.add(message);
	console.warn(message);
}
```
Множеството е ограничено — пораките доаѓаат од конечен број корени и документи.

**B. Смени го docstring-от** да вели „suppresses consecutive duplicates".

Избери A освен ако постои причина да се сака повторно предупредување по rebuild.

**Проверка:** конфигурирај два корена од кои еден нема `docs-mcp/`, повикај
`ensureIndex()` двапати и види дека предупредувањето излегува еднаш вкупно.

---

### Задача 10. `renderModule` фрла неуловено

**Фајл:** `scripts/sync-ln-attrs.js`, ред ~151

```js
			throw new Error(`Колизија на симбол "${symbol}": ${bySymbol.get(symbol)} и ${attr}`);
```

Целата скрипта инаку известува за грешки чисто (`console.error` + `process.exit(1)`).
Овој `throw` излегува неуловен од `main()` → Node печати stack trace. Порака е
добра, презентацијата не е.

Обвиткај го повикот во `main()`:

```js
	let module;
	try {
		module = renderModule(attrs);
	} catch (e) {
		console.error(`\nsync-ln-attrs: ${e.message}`);
		process.exit(1);
	}
```

**Проверка:** тешко за вештачки предизвикување (бара вистинска колизија). Доволно
е да потврдиш дека нормалното пуштање и понатаму работи: `npm run sync:ln-attrs -- --check --root=../ln-ashlar`.

---

### Задача 11. `POST /knowledge/reload` нема rate limit

**Фајл:** `tools/knowledge/index.js`

Endpoint-от е автентициран, но секој повик е целосно пре-шетање на сите корпус
корени (`loadDocs()` чита секој `.md` од дискот + гради Fuse индекс). Автентициран
корисник може да го врти во јамка.

`routes/oauth.js` веќе има работечки rate limiter (`rateLimit(max, windowMs)`),
но е локален за тој модул. Најмала разумна измена: издвој го во
`middleware/rate-limit.js` и употреби го на двете места:

```js
router.post('/reload', rateLimit(5, 60 * 1000), (req, res) => {
```

Ако не сакаш рефактор сега, прифатливо е и да се остави со коментар што го
именува ризикот. Ова е низок приоритет — бара валидни креденцијали.

---

## Задача 12 (ОДЛУКА, не поправка) — `config/gemini.json` во git

**Не изведувај без потврда од сопственикот на репото.**

Забележав дека `config/gemini.json` е трекиран во git и содржи патеки специфични
за машина (`geminiHome`, `geminiCwd` = `/home/…`), додека `config/auth.json` и
`config/jwt.json` се gitignore-ирани.

**Но ова е свесна претходна одлука**, не пропуст. `plans/review-plan-tool-impl.md`
експлицитно вели:

> `config/gemini.json` follows the `config/oauth.json` precedent (committed, no
> secrets — it is NOT gitignored; only `auth.json`/`jwt.json` are).

Проверив: **нема тајни во него** (модел, timeout-и, патеки — ниту еден API клуч).
Значи причината за одлуката и понатаму важи.

Единствената слаба забелешка е што *вредностите* се за конкретен deployment, па
секој што го клонира репото ги наследува туѓите патеки. Тоа е трошок за
удобност, не безбедносен проблем.

**Прашање за сопственикот:** дали `gemini.json` да остане committed (статус кво,
работи), или да оди во `.gitignore` покрај `auth.json`/`jwt.json` со
`gemini.example.json` како шаблон (почисто за нови клонови, но бара рачен чекор
при deployment)?

Не менувај ништо додека нема одговор.

---

## Финална проверка пред PR

Пушти ги сите четири и запиши ги излезите во описот на PR-от:

```bash
npm run sync:ln-attrs -- --check --root=../ln-ashlar ; echo "exit=$?"   # очекувано 0
npm run lint:snippets                                ; echo "exit=$?"   # очекувано 0
npm run lint:docs                                    ; echo "exit=$?"   # очекувано 0
node -e "
const fs=require('fs');
(async()=>{ let n=0;
for (const f of fs.readdirSync('tools')) {
  if (!f.endsWith('.js')) continue;
  const m = await import('file:///c:/laragon/www/ln-ashlar-mcp/tools/'+f);
  const t = m.name && m.definition && m.handler ? m : m.default;
  if (!(t && t.name && t.definition && t.handler)) console.log('СКРШЕНА АЛАТКА:', f); else n++;
}
console.log('вчитани алатки:', n); })();
"                                                                        # очекувано 36
```

Плус рачно, бидејќи ниту една автоматска проверка не го покрива:

- [ ] `curl -H "Host: evil.example.com" …/.well-known/oauth-authorization-server`
      го враќа вистинскиот хост (Задача 1)
- [ ] `npm start` се крева и `Prepared tool … for registration` се појавува 36 пати
- [ ] OAuth flow од вистински MCP клиент сè уште се комплетира

### Мапа задача → наод од ревјуто

| Задача | Наод | Приоритет |
|---|---|---|
| 1 | Host-header injection во discovery | 🔴 |
| 2 | `mode`/`source` противречност во `buildTable` | 🟠 |
| 3 | `review_plan` iteration cap заобиколување | 🟡 |
| 4 | мртва `search_fields` хеуристика | 🟡 |
| 5 | conformance проверката изгубена со тестовите | 🟠 |
| 6 | референци кон избришани тестови | 🟡 |
| 7 | `path.resolve('tools')` врзан за cwd | 🔵 |
| 8 | `js/` скениран за `.scss` | 🔵 |
| 9 | `warnOnce` не одговара на docstring-от | 🔵 |
| 10 | неуловен `throw` во `renderModule` | 🔵 |
| 11 | `/knowledge/reload` без rate limit | 🔵 |
| 12 | `gemini.json` во git — **одлука, не поправка** | — |

### Што НЕ е во овој план (свесно)

- **Враќање на целиот тест-suite.** Одлуката да се тргне е донесена и
  документирана. Задача 5 го враќа само делот што штити инваријанта што ниедна
  друга проверка не ја покрива. Ако сакате повеќе назад, најголема вредност по
  ред: `test/integration.test.js` (целиот OAuth+PKCE flow и врзувањето на MCP
  сесија за корисник — три безбедносни инваријанти без покритие сега), потоа
  `test/knowledge-roots.test.js` (path traversal во `knowledge_read`).
- **Authorization code binding кон `client_id`/`redirect_uri`** во `/token`.
  PKCE го покрива главниот напад; вреди, но е посебна работа.
- **Застарената `docs-mcp/components/ln-table.md`** во ln-ashlar — сè уште
  документира `data-ln-table-window*` и `data-ln-table-count` што кодот веќе не
  ги чита (drift извештајот од `sync:ln-attrs` ги наведува). Тоа е баг во
  **ln-ashlar**, не во овој репо. Пријави го таму.
