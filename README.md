# MCP Server

Node.js (ESM) HTTP сервер кој изложува Model Context Protocol (MCP) алатки
(Streamable HTTP + legacy SSE транспорт) заедно со сопствен OAuth 2.0 +
PKCE авторизациски flow и пребарлива knowledge база (ln-ashlar документација).

## Технологии

- Node.js, Express 5
- `@modelcontextprotocol/sdk` (Streamable HTTP и SSE транспорти)
- `jsonwebtoken` за authorization code / access token
- `fuse.js` за fuzzy пребарување на документацијата
- `winston` + `winston-daily-rotate-file` за логирање

## Инсталација

```bash
npm install
```

Копирај ги примерите на конфигурациите и пополни ги со реални вредности
(двата фајла се во `.gitignore` и НЕ се commit-уваат):

```bash
cp config/auth.example.json config/auth.json
cp config/jwt.example.json config/jwt.json
```

- `config/auth.json` — листа на корисници (`{ users: { <username>: { clientId, token } } }`).
- `config/jwt.json` — тајна (`secret`) за потпишување на JWT кодови/токени.
  Генерирај силна случајна вредност (на пр. `openssl rand -base64 48`).
- `config/oauth.json` — веќе постои во репото (не содржи тајни), ги дефинира
  дозволените `redirect_uri` вредности (`allowedRedirects`) и дали се
  дозволени loopback (`localhost`/`127.0.0.1`) редиректи.
- `config/gemini.json` — конфигурација за `review_plan` алатката (копирај од
  `config/gemini.example.json`); нема тајни во фајлот — автентикацијата за
  gemini-cli оди преку gemini-cli-ните сопствени енкриптирани credentials во
  runner-овиот `HOME` (`~/.gemini/gemini-credentials.json`), не преку овој репо.

## Корпус — каде живее документацијата

Серверот НЕМА вградена локација за документацијата. Каде се наоѓа ln-ashlar
(и кој било друг продукт-репо со `docs-mcp/` фолдер) го одредува **една
променлива на околината**:

- `DOCS_CORPUS_ROOTS` — comma-separated листа на **репо-корени** (не на
  `docs-mcp` подфолдерот). Секој корен се чита само ако има `docs-mcp/`.
- `ASHLAR_DOCS_REPO` — легаси еднокорен fallback, се користи само кога
  `DOCS_CORPUS_ROOTS` не е поставена.

Ист knob ги храни сите потрошувачи — ashlar алатките
(`tools/ashlar/corpus.js`, `configuredRoots()`), legacy knowledge индексот
(`tools/knowledge/loader.js`) и `get_ln_schema`. Нема резервна копија во
репово: ако ниту еден корен не ја носи шемата, `get_ln_schema` враќа грешка
наместо застарен одговор.

Ако променливата не е поставена, серверот сепак се крева — алатките
пријавуваат „not configured" наместо да паднат.

### Routing contract — `docs-mcp/component-router.md`

Секој корен **треба** да носи `docs-mcp/component-router.md` — матрица за избор
на компонента (за што се користи, за што НЕ се користи). Тоа е единствениот
top-level фајл што серверот го **служи без да го индексира како документ**:

- Телото му се инјектира verbatim во MCP `instructions` при `initialize`
  (`tools/ashlar/instructions.js`, `buildInstructions()`). Тоа е единствениот
  push канал во MCP — клиентот го става во system prompt-от на моделот пред
  првиот токен, без ниту еден tool повик. Со тоа моделот ја знае точната
  компонента однапред, наместо да прелистува документација и да погодува.
- Истата матрица се служи и на барање преку MCP алатката `get_component_router`
  (опционален `root` за еден корен).
- Описите на `get_markup`, `get_component`, `list_components` и `search_docs`
  го повторуваат правилото (`ROUTER_FIRST_HINT`) — втора ограда токму во
  моментот кога се бира компонента.

Се чита сурово: **нема frontmatter**, не поминува низ `parseDoc()` и намерно НЕ
влегува во `docs`/`registry`/`byName`/`fuse`. Двете причини: не му треба
frontmatter, и името не смее да се судри со вистинската `ln-router` компонента
во `components/`.

Федерација: N корени ⇒ N секции во `instructions`, секоја со заглавје
`--- <rootLabel> / component router ---`, по редот на `DOCS_CORPUS_ROOTS`.
Корен без таков фајл е легален — само не придонесува секција (се логира
`console.warn`). Кога ниту еден корен нема, серверот воопшто не праќа
`instructions`.

`instructions` се градат **по сесија**, не при подигање — значи commit во
корпусот стигнува до следната сесија без рестарт на серверот (важи истото
git-HEAD правило од „Освежување на документацијата" подолу).

Клон во `resources/` е една можна поставка, не барање. Локално може директно
да се покаже на работниот checkout:

```bash
DOCS_CORPUS_ROOTS=/пат/до/ln-ashlar node server.js
```

```powershell
$env:DOCS_CORPUS_ROOTS = 'c:/laragon/www/ln-ashlar'; node server.js
```

## Стартување

```bash
DOCS_CORPUS_ROOTS=/пат/до/ln-ashlar PORT=8080 node server.js
```

Серверот слуша на `0.0.0.0:<PORT>` (по default `8080`).

**Напомена:** серверот НЕ прави hot-reload на JS кодот — секоја промена во
`server.js`, `routes/`, `middleware/` или `tools/` бара рестарт на процесот
за да влезе во сила. Исклучок се содржината на корпусот и корисниците во
`config/auth.json` — тие можат да се освежат без рестарт (видете подолу).

## Преглед на endpoints

### OAuth 2.0 + PKCE flow

- `GET /authorize` — прикажува HTML login страница (login темплејт во
  `views/login.html`). Прифаќа `client_id`, `redirect_uri`, `state`,
  `response_type`, `code_challenge`, `code_challenge_method` (query).
- `POST /authorize` — обработува најава (username/token). При успех
  издава краткотраен (5 мин) еднократен authorization `code` — или
  редиректира кон `redirect_uri` со `code`/`state`, или го враќа `code`
  директно во JSON одговор ако `redirect_uri` не е даден.
  Заштитено со rate-limit (10 обиди / 15 мин по IP).
- `POST /token` — разменува `code` (+ `code_verifier` за PKCE S256) за
  `access_token` (важи 24ч). Секој `code` е еднократен. Заштитено со
  rate-limit (30 обиди / 15 мин по IP).

Само `redirect_uri` вредности од `config/oauth.json` (`allowedRedirects`)
или loopback адреси (ако `allowLoopbackRedirects: true`) се прифаќаат.

### MCP транспорти (бараат автентикација)

- `ALL /` и `ALL /mcp` — Streamable HTTP транспорт (протокол верзија
  `2025-11-25`). Сесиите (`mcp-session-id`) се врзани за корисникот што ги
  иницирал — обид да се употреби туѓа сесија враќа `403`.
- `GET /sse` и `POST /messages` — legacy SSE транспорт (протокол верзија
  `2024-11-05`), исто врзан за корисник по сесија.

Автентикација (за сите горенаведени + `/knowledge/*`): `Authorization: Bearer <token>`
или како API-клуч (заедно со `X-Client-Id` header, или `client-id`/`token`
query параметри — само на `/sse` и `/messages`) или како JWT `access_token`
издаден од `/token`.

### Knowledge база

Legacy индекс над **сите** `.md` фајлови во конфигурираните корени — вклучно
internals слојот (`js/ln-*/README.md`, `docs/architecture/`) што ashlar
корпусот намерно не го индексира. Комплементарен е на `search_docs`, не
дупликат. `node_modules/` и `.git/` се прескокнуваат.

Патеките во резултатите се префиксирани со ознаката на коренот
(`ln-ashlar/docs/css/mixins.md`) за да останат недвосмислени кога има повеќе
корени; `knowledge_read` прифаќа и таква и обична репо-релативна патека.

- `GET /knowledge/search?q=<термин>` — fuzzy пребарување. Истата споделена
  `search()` функција (`tools/knowledge/search.js`) ја користат и REST рутата
  и MCP алатката `knowledge_search`. Кога нема конфигуриран корен враќа `503`
  со `not_configured`.
- `POST /knowledge/reload` — повторно вчитува ги `.md` фајловите од диск и
  го преградува Fuse индексот, без рестарт на процесот. Враќа
  `{ reloaded: true, docs: <број на документи> }`. Секој reload се логира
  со Winston.

### Healthcheck

- MCP tool `healthcheck` (види `tools/healthcheck.js`), достапен преку
  MCP транспортите откако е воспоставена сесија.

### review_plan

MCP алатка (`tools/review_plan.js`) што праќа план (архитектонски или
имплементациски) на независен Gemini рецензент преку `gemini-cli`.
Автентикацијата кон Gemini оди преку gemini-cli-ните сопствени credentials,
зачувани енкриптирано во runner-овиот HOME (`~/.gemini/gemini-credentials.json`,
моментално API клуч) — нема тајни ни env варијабли во овој репо. Алатката е
stateless — повикувачкиот агент ја води јамката: draft → review → revise,
најмногу 3 итерации; на итерации 2–3 се проследува `previous_feedback`; застани
на `APPROVE` или итерација 3. Конфигурација: `config/gemini.json` (модел,
timeout, concurrency, max iterations, изолиран runner `HOME`/`cwd`). Логира:
api-key id, plan_type, iteration, chars in/out, времетраење, verdict, модел.
Безбедност: gemini-cli е ограничен на чист текст-влез/текст-излез
(`coreTools: []`, изолиран `HOME`/празен `cwd`, никогаш `--yolo`). Ревизорот
има read-only MCP пристап до docs корпусот на истиот сервер (клуч
`gemini-reviewer`, `review_plan` исклучен од неговите алатки против
рекурзија); поради ова agentic tool round-trips, серверскиот timeout е 240s
(`config/gemini.json`, `timeoutMs`). Секој повик се логира и во посебен
целосен аудит лог (`logs/review-audit-*.log`) со целосната содржина на
prompt-от и одговорот, што може да се исклучи со `auditLog: false` во
`config/gemini.json`. По завршување на јамката (APPROVE или итерација 3),
повикувачкиот агент може да направи дополнителен повик со `wrap_up: true`
(проследувајќи ги сите претходни критики во `previous_feedback`) за да добие
кратко завршно резиме на текот на целата ревизија.

## Управување со корисници

Корисниците се читаат од `config/auth.json` преку `middleware/user-store.js`,
кој го кешира парсираниот фајл и автоматски го превчитува кога ќе се смени
`mtime` на фајлот. Тоа значи: додавање/бришење корисник во `config/auth.json`
влегува во сила веднаш, БЕЗ рестарт на серверот (важи и за `/authorize`,
`/token` и за MCP автентикацијата преку `middleware/auth.js`).

## Освежување на документацијата

Двата индекса имаат **различни** модели на свежина — ниту еден не бара рестарт,
но не се освежуваат на ист начин:

- **Legacy knowledge индекс** (`/knowledge/*`, `knowledge_search`,
  `knowledge_read`) — превчитување на барање: повикај `POST /knowledge/reload`
  со валидна автентикација. Ги фаќа и некомитираните измени на диск.
- **Ashlar корпус** (`search_docs`, `get_component`, `get_markup`,
  `validate_docs`, `get_ln_schema`, …) — се превчитува автоматски кога ќе се
  смени git HEAD на коренот (`gitSignature()`, `tools/ashlar/corpus.js`).
  Значи **некомитирана** измена во коренот НЕ се гледа, ни по `reload`;
  промената влегува дури откако е commit-ирана (и на серверот — откако тој
  ќе pull-ира).

## Тестови

Тестовите користат вграден `node:test` (без дополнителни npm зависности):

```bash
npm test
```

- `test/unit.test.js` — `secureCompare`, `escapeHtml`, `isAllowedRedirect`.
- `test/ashlar-router.test.js` — routing contract-от: вчитување по корен,
  корен без контракт, гаранцијата дека НЕ се индексира како документ,
  `buildInstructions()` payload-от и `get_component_router` (сите корени,
  `root` филтер, непознат корен, неконфигуриран).
- `test/knowledge-roots.test.js` — резолуција на корпус-корените во legacy
  knowledge слојот: индексирање со root-префикс низ два фикстур-корена,
  обете форми на патека во `knowledge_read`, заштита од path traversal.
- `test/knowledge-unconfigured.test.js` — со празна `DOCS_CORPUS_ROOTS`:
  import ланецот не фрла, а алатките пријавуваат „not configured".
- `test/integration.test.js` — стартува реален `node server.js` процес на
  `PORT=8099` (со фикстур-корен во `DOCS_CORPUS_ROOTS`), го тестира целосниот
  OAuth + PKCE flow, `/mcp` автентикација, `/knowledge/search`,
  `/knowledge/reload` и врзувањето на MCP сесиите за корисник. Процесот се
  убива автоматски по завршувањето на тестовите (вклучително и при неуспех).

Интеграцискиот тест ги чита реалните креденцијали од `config/auth.json` во
времето на извршување — не ги хардкодирај во тестовите.
