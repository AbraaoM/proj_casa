# Home Organizer System — instructions for agents

Personal app to help organize and manage my home life.  
Focus on simplicity, clarity, beauty, and daily use on the phone.

Extremely **agent-first / agent-friendly**: the application is primarily a visualizer and dashboard. Data inputs, updates, and maintenance are performed by an agent (Grok Bot named **James**). Design all data models, APIs, and interfaces so an AI agent can operate them reliably with minimal friction. User interaction should be mostly read-only or confirmation-based.

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
- Expose dedicated API routes under `/api/agent/` designed for James:
  - Consistent JSON request/response shapes
  - Clear error messages (never silent failures)
  - Idempotent operations where possible
  - Support for bulk or sequential updates
  - Endpoints for listing upcoming items, marking done, adding records, updating status
- Document the agent API (simple README section or inline comments + TypeScript types) so James can operate it reliably.
- Authentication for agent routes: simple shared secret or API key (via environment variable). Never hardcode secrets.
- User-facing UI is primarily visual: dashboards, lists, timelines, cards. Minimal forms. Prefer agent-driven data entry.
- Business logic lives in dedicated modules (not mixed with UI components).

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
