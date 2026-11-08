# Home Organizer System — instructions for agents

Personal app to help organize and manage my home life.  
Focus on simplicity, clarity, beauty, and daily use on the phone.

Extremely **agent-first / agent-friendly**: the application is primarily a visualizer and dashboard. Data inputs, updates, and maintenance are performed by an agent (the user's own AI assistant, under whatever name they give it). Design all data models, APIs, and interfaces so an AI agent can operate them reliably with minimal friction. User interaction should be mostly read-only or confirmation-based.

## Start every session here
1. Read this `AGENTS.md` completely.
2. Confirm active skills and MCPs (`grok inspect` and `grok mcp list`).
3. For non-trivial features, always start in Plan Mode (`/plan`) and wait for approval before editing files.

## Required stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- Database: Neon (Postgres serverless) with `@neondatabase/serverless`
- Target deploy: Vercel
- Weather forecast: Open-Meteo (no API key) — useful for outdoor maintenance suggestions and planning

## Default location
- City: Pindamonhangaba, SP, Brazil
- Coordinates: latitude -22.9239, longitude -45.4617
- Allow changing the city later

## Design (non-negotiable — Brand Identity)
Follow the visual identity defined at https://brand-identity.abraaomoreira.dev/

- **Minimalism**: prioritize black and white. Use color only when necessary to highlight.
- **Primary palette** (fixed):
  - Pure Black `#000000`
  - Pure White `#ffffff`
  - Soft Black `#0a0a0a`
  - Soft White `#fafafa`
- **Accent color** (chosen):
  - Primary accent: Emerald `#10b981` (with light `#34d399` and dark `#059669` variations as needed)
  - **Justification**: Emerald evokes health, care, growth, and natural balance — fitting for pet health, family care, home maintenance, and overall vitality of the household. It provides high contrast against the monochrome base while remaining vibrant and modern.
  - Once chosen and justified, keep consistency across buttons, links, highlights, and interactive states.
- **Neutrals**:
  - Text Gray `#6b7280`
  - Light Gray `#9ca3af`
  - Border Gray `#e5e7eb`
- **Typography**:
  - Anton for titles and highlights
  - Inter for body text
- **Themes**: support light and dark mode with good readability in both.
- **Mobile-first**: design and implement for mobile first. The main experience must be excellent on mobile.
- **Responsiveness**: work very well on larger screens (tablet and desktop), using the space intelligently without losing clarity.
- Use Tailwind. Examples: `bg-white dark:bg-black`, `text-black dark:text-white`, `border-gray-200 dark:border-gray-800`, `transition-colors duration-300`.
- Prioritize polish: generous spacing, precise alignment, clear typographic hierarchy, and subtle microinteractions.
- Components must be intentional and consistent with the identity.
- Test on mobile and on at least one desktop breakpoint.

## Core domains
1. **Dogs care history** — vaccines, deworming, vet visits, weight, notes, next due dates.
2. **House maintenance & cleaning** — scheduled cleanings, repairs, deep cleans, outdoor tasks, status and history.
3. **Basic financial reminders** — gas refill, dog food, bills to pay, recurring purchases. Focus on "don't forget" rather than full accounting.
4. **Car maintenance** — oil changes, services, inspections, tire rotation, next due, history.
5. **Family care schedule** — vaccines, dentist, medical appointments, medicine purchase reminders, for each family member.

The app surfaces what needs attention, timelines, and history. It does **not** aim to be a full CRM or accounting system.

## Agent-first architecture
- Prefer clear, structured, machine-readable data models (PostgreSQL tables with good naming and constraints).
- Expose dedicated API routes under `/api/agent/` designed for the agent:
  - Consistent JSON request/response shapes
  - Clear error messages (never silent failures)
  - Idempotent operations where possible
  - Support for bulk or sequential updates
  - Endpoints for listing upcoming items, marking done, adding records, updating status
- Document the agent API (simple README section or inline comments + TypeScript types) so the agent can operate it reliably.
- Authentication for agent routes: simple shared secret or API key (via environment variable). Never hardcode secrets.
- User-facing UI is primarily visual: dashboards, lists, timelines, cards. Minimal forms. Prefer agent-driven data entry.
- Business logic lives in dedicated modules (not mixed with UI components).
- Panel input is one-tap buttons only. **Owner-approved exceptions:** the admin-only bot settings page (`/agentes/bot`) has a small form (AI provider, model, base URL, AI API key, Telegram bot token) plus buttons (save, enable/disable, register webhook, test, rotate webhook secret); and the list search (`?q=`, component `ListSearch`) which only filters what is already on the screen and writes nothing. Do not add other text-entry forms without the owner's approval.
- Bot and integration secrets live in the database, encrypted with AES-256-GCM under one master key, `CASA_SECRET_KEY` (32 random bytes, base64). Never return a saved secret to the client: show the last 4 characters only. Log who changed what and when, never the values.
- The installed phone app is a PWA: `app/manifest.ts` (`display: standalone`), `public/sw.js` (network for pages and `/api/`, offline fallback `public/offline.html`), and the one-tap **Instalar** button (`components/pwa/install.tsx`). Do not cache HTML or API responses. `/sw.js` and `/offline.html` stay public in the proxy. The service worker registers only in production. Long-press shortcuts are the four in `APP_SHORTCUTS` (Android shows four; the icon already opens the panel). The icon badge is overdue + due today, and only on the installed app. Do not add a home-screen widget: Chrome on Android does not support one.

## House routines (the /casa checklist)
- A routine is a house item (`domain: "house"`) with `interval_days` or `interval_months` and no `interval_hours`. It needs no new table: the checklist reads `care_items` plus the latest non-voided `care_events`.
- Urgency lives in `lib/domain/routine.ts` (pure, unit-tested): `overdue` (past due), `never` (no record yet), `due_soon` (75% or more of the interval used, `DUE_SOON_SHARE`), `ok`. Most urgent first.
- **Frequencies change only through an agent.** The owner approved the suggested kit (`lib/domain/routine-kit.ts`) as the starting point and changes it by talking to an agent. Do not add a screen, form or button to edit a frequency. Create with `adicionar_item`, change with `atualizar_item` (`interval_days` / `interval_months`; `null` removes the frequency and the item stops being a routine). Confirm the change in one sentence.
- Read the checklist with the `rotinas_casa` tool or `GET /api/agent/house/routines` (`area`, `status`, `limit`, `include_kit`).
- One routine per room and task. Use `routineKey(area, task)` (`rotina:<area>:<slug>`) as the `external_key`, so a repeated setup does not duplicate.
- The panel records who did each task (one tap, "Feito agora"). There is no assignment or rotation. The app never shows the agent's name: it says "seu agente".

## Day report (who did what)
- `/hoje` reads the day live from `care_events` and `fin_transactions`. Nothing is snapshotted. A house routine (days or months, not hourly) is checklist. Any other live event is a task. An expense that is not the cost of one of those events is a payment, so a task with a cost is not listed twice.
- Today refreshes itself while the page is open. Another day is `?dia=AAAA-MM-DD`, never a future day. `?q=` only filters what is already on the screen.
- `relatorio_do_dia` and `GET /api/agent/day` return the same groups. At 22:00 America/Sao_Paulo the Telegram bot sends that text to the chats that already receive the morning digest (`GET /api/telegram/report`, cron `0 1 * * *`). One send per chat per day, claimed apart from the morning summary. Say "seu agente", never a stored agent name.

## Month close (finance)
- A month can be closed only after it ends. November closes October. The screen offers one tap (`Fechar`), and `fechar_mes` does the same. Closing stores a snapshot; it does not lock transactions and does not create one.
- The forecast for the next month, per expense category: that month's budget if one is set, otherwise the monthly cost of active repeating bills, otherwise this month's spending. Income uses active income bills, or repeats this month.
- `pdf_fechamento` and `GET /api/agent/finance/closes/:month/pdf` return the PDF of a closed month. The logged-in screen uses `/financas/fechamento/:month`. Rebuild a close after a correction with `fechar_mes` `refresh: true` only. Do not invent figures.

## Food (stock, dishes, shopping, calories)
- `/comida` shows today's calories, the open shopping list, the pantry and the dishes. `?q=` only filters what is already on the screen. When a row came from TACO, the screen shows that name and kcal per 100 g so a wrong default is visible. There is no calorie form.
- The agent writes. `ver_comida`, `buscar_taco`, `definir_alimento`, `definir_prato`, `adicionar_compra`, `gerar_lista`, `marcar_compra`, `registrar_refeicao`, `anular_refeicao`. The same rules are on `/api/agent/food/`. `GET /api/agent/food/taco?q=` is the read-only lookup.
- Calories come from the bundled TACO 4th edition (NEPA/UNICAMP), per 100 g. A stated number still wins. The person is never asked for kcal. An ambiguous name returns candidates; the agent picks a `taco_id` and calls again. Do not guess among cuts, banana varieties or cheeses.
- A single household word uses the usual row. Stock prefers raw, a plate prefers cooked: arroz tipo 1, feijão carioca, ovo de galinha inteiro, óleo de soja, açúcar refinado, pão francês, batata inglesa, frango peito sem pele, café em pó no estoque e infusão no prato. An exact description wins over that default.
- Quantities are grams, millilitres or pieces (`g`, `ml`, `un`). `ml` reuses the per-100 g figure (an approximation). Piece weights exist only for pão francês (50 g), banana prata (75 g), ovo de codorna (10 g) and ovo de galinha (45 g, fried 50 g). Anything else counted as `un` stays without kcal until it is recorded in grams.
- A dish has a per-serving calorie total only when every ingredient resolved. A meal without a dish takes the kcal the agent computed from TACO. Never invent a number. Rows with no published energy (leite integral, for one) are omitted.
- Low stock is at or below `min_quantity`. `gerar_lista` adds the shortfall, and skips an item already on the open list. One tap on the screen does the same. **Comprado** only marks the line; it does not change stock. `marcar_compra` with `restock: true` adds the quantity, once.
- A meal is for one day, never a future day. Voiding it (`anular_refeicao`) hides it from the day and frees the `external_key`. Nothing is deleted. `013_food_taco` adds `taco_id`; run it with `012_food`.

## Never break the core experience
The person will use this daily. A broken screen or wrong recommendation creates distrust.
- Prefer Server Components when possible.
- Handle weather, database, and API errors clearly (never leave a blank screen or raw error).
- Test critical logic (due date calculations, status transitions, reminder prioritization) with TDD when it makes sense.
- Never invent connection strings — obtain them via Neon MCP or ask the user.
- Never commit `.env*` or secrets.

## Architecture
Keep separation of responsibilities. Business logic must not be mixed with the UI.  
Agent operations should go through well-defined service layers that both the API routes and (if needed) UI actions can use.
