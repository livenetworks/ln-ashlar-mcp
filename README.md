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

## Стартување

```bash
PORT=8080 node server.js
```

Серверот слуша на `0.0.0.0:<PORT>` (по default `8080`).

**Напомена:** серверот НЕ прави hot-reload на JS кодот — секоја промена во
`server.js`, `routes/`, `middleware/` или `tools/` бара рестарт на процесот
за да влезе во сила. Единствен исклучок е содржината на knowledge базата
(`resources/ln-ashlar/**/*.md`) и корисниците во `config/auth.json` — тие
можат да се освежат без рестарт (видете подолу).

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

- `GET /knowledge/search?q=<термин>` — fuzzy пребарување низ маркдаун
  документацијата (`resources/ln-ashlar`). Истата споделена `search()`
  функција (`tools/knowledge/search.js`) ја користат и REST рутата и MCP
  алатката `knowledge_search`.
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
(`config/gemini.json`, `timeoutMs`).

## Управување со корисници

Корисниците се читаат од `config/auth.json` преку `middleware/user-store.js`,
кој го кешира парсираниот фајл и автоматски го превчитува кога ќе се смени
`mtime` на фајлот. Тоа значи: додавање/бришење корисник во `config/auth.json`
влегува во сила веднаш, БЕЗ рестарт на серверот (важи и за `/authorize`,
`/token` и за MCP автентикацијата преку `middleware/auth.js`).

## Освежување на документацијата

Промена на `.md` фајловите во `resources/ln-ashlar/` не бара рестарт —
повикај `POST /knowledge/reload` (со валидна автентикација) за да се
превчитаат документите и да се преизгради пребарувачкиот индекс.

## Тестови

Тестовите користат вграден `node:test` (без дополнителни npm зависности):

```bash
npm test
```

- `test/unit.test.js` — `secureCompare`, `escapeHtml`, `isAllowedRedirect`,
  заштита од path traversal во `knowledge_read` alatkata.
- `test/integration.test.js` — стартува реален `node server.js` процес на
  `PORT=8099`, го тестира целосниот OAuth + PKCE flow, `/mcp` автентикација,
  `/knowledge/search`, `/knowledge/reload` и врзувањето на MCP сесиите за
  корисник. Процесот се убива автоматски по завршувањето на тестовите
  (вклучително и при неуспех).

Интеграцискиот тест ги чита реалните креденцијали од `config/auth.json` во
времето на извршување — не ги хардкодирај во тестовите.
