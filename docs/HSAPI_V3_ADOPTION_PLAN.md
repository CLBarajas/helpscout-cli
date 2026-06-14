# Help Scout API v3 Adoption — Research-First Plan

**Drafted:** 2026-06-12 · **Status:** SPEC — research phase not started
**Size:** Medium; phase 0 is a docs dive, implementation is thin slices afterward
**Motivation:** HS is rolling v3 variants of Mailbox API endpoints (changelog reviewed
2026-06-12). Two have concrete value for us now; the rest are efficiency/hygiene. Everything
below is provenance-from-notes — **phase 0 verifies against the actual changelog/docs and
fills the decision table before any code.**

## The candidates (from the 6/12 changelog review)

| Item | Claimed value | Our use case |
|------|---------------|--------------|
| Get Conversation v3 — preserves `system_user` attribution | Distinguish bot/workflow actors in threads | **Knowledge Bot false-positive script**: weekly reviews currently infer bot actions; `system_user` would make `ai-resolved` auditing precise (pairs with the NO_ANSWER-tagging defect documented in `projects/helpscout-queue/knowledge-bot/`) |
| Webhooks V3 payload (same `system_user` preservation) | Bot-attributed events at webhook time | Website-side (`HelpScout.inc.php` handlers), NOT this CLI — record the finding, hand to website repo if wanted |
| List Customers v3 — cursor pagination | No page-walk drift on large scans | `bounce-audit` / `paddle-audit` customer reconciliation passes |
| Customer `conversationCount` | Cheap context enrichment | `customers view` output; sidebar-ish triage |

## Phase 0 — Research (output: decision table IN this doc)

1. Read the Mailbox API changelog entries for each item (https://developer.helpscout.com/ →
   changelog) + the endpoint docs. For each, record: exact path/params, auth/scope changes,
   response-shape delta vs v2, pagination semantics (cursor vs page), GA vs beta status.
2. Determine the **versioning mechanism** (separate `/v3/` paths? header opt-in? per-endpoint?)
   — this decides client architecture (new methods vs a version param on `request()`).
3. Check whether upstream has touched any v3 surface (git log + issues) — if the maintainer is
   heading there, prefer filing an issue (see UPSTREAM_ISSUES_PLAN.md) and waiting a beat.
4. Fill in: **DONE 2026-06-14** — see findings + filled table below.

## Phase 0 — Findings (2026-06-14, from developer.helpscout.com)

**Versioning mechanism (the architecture-deciding question):** TWO mechanisms,
both per-endpoint, no global opt-in:

- **REST endpoints → separate `/v3/` URL path.** Not a header, not a query param.
  Only specific endpoints have a v3 twin (`/v3/conversations/{id}`,
  `/v3/conversations/{id}/threads`, `/v3/customers`). Sources:
  [changelog](https://developer.helpscout.com/mailbox-api/changelog/),
  [Get Conversation v3](https://developer.helpscout.com/mailbox-api/endpoints/conversations/get-v3/),
  [List Customers v3](https://developer.helpscout.com/mailbox-api/endpoints/customers/list-v3/),
  [List Threads v3](https://developer.helpscout.com/mailbox-api/endpoints/conversations/threads/list-v3/).
- **Webhooks → `payloadVersion: V3` field** (set at webhook create/update; defaults
  V2). Website-repo surface (`HelpScout.inc.php`), NOT this CLI.

  **Client impact:** `api-client.ts` hardcodes `const API_BASE = '…/v2'` (`:27`)
  and prefixes it on every call (`:155`). v3 needs a **version-aware `request()`**
  (add an optional `version: 'v2' | 'v3'` building `…helpscout.net/${version}`,
  default `v2`). Small, isolated refactor; v3 methods then stay thin. Do NOT
  globally flip the base — only a few endpoints have v3.

**`conversationCount` is ALREADY in v2** (added 2025-11-26 to Get/List Customers).
The plan grouped it under "v3" — **correction: it needs no v3 work at all.** Just
surface the existing field in `customers view` / `get_customer`. Cheapest slice,
fully decoupled from the `/v3/` plumbing.

**GA status:** all GA, none beta. List Customers v3 GA 2025-10-27; conversationCount
2025-11-26; Webhooks V3 GA 2026-05-20; Get Conversation v3 / List Threads v3 listed
as standard (no beta tag). No new OAuth scopes documented.

**Upstream check (6/14):** upstream (stephendolan) has touched **zero** v3 surface —
no commits, no issues mention v3 / system_user / cursor / conversationCount (latest
upstream is the v2.16.0 feature commit, already merged). So: implement in fork
independently; optionally file a single "gauge interest" issue per the issues-not-PRs
strategy (UPSTREAM_ISSUES_PLAN.md) if we want eventual upstream alignment — but no
need to wait on him.

### Decision table (filled)

| Endpoint | Verified path | Shape delta vs v2 | Adopt? | Slice |
|----------|--------------|-------------------|--------|-------|
| Get Conversation v3 | `GET /v3/conversations/{id}` | `createdBy.type` / `assignee.type` / `closedByUser.type` return the real value incl. `system_user` (v2 normalizes to `user`) | **Yes** | A |
| List Threads v3 | `GET /v3/conversations/{id}/threads` | thread `createdBy.type` / `assignedTo.type` return real `system_user`; HAL `_embedded.threads[]` + `page` | **Yes** (the real lever — per-thread "who actioned" is what the bot-FP audit needs) | A |
| List Customers v3 | `GET /v3/customers` | cursor pagination (`cursor` param → next at `_links.next.href`); HAL `_embedded.customers[]`; always `createdAt` desc | **Maybe** (value for large scans; bigger lift — new cursor-walk helper) | B |
| conversationCount | already in v2 Get/List Customers | additive field `conversationCount` | **Yes — no v3 needed** | C (trivial) |
| Webhooks V3 | `payloadVersion: V3` | `system_user` preserved in payloads | **Hand off** to website repo | — |

**Recommended sequencing:** C (trivial, v3-independent) → version-aware `request()`
refactor → A (Get Conversation v3 + List Threads v3 together; system_user lives on
both — `closedByUser`/`createdBy` on the conversation, per-thread `createdBy` on the
threads) → B (cursor customers, only if a large-scan need is concrete). Slice A is
the one with a waiting consumer (Knowledge Bot false-positive auditing).

**Gate: review the table with Chris before phase 1.** ⬅ HERE NOW.

## Phase 1+ — Implementation slices (verified after phase 0)

Execution order is tracked in `V3_ROADMAP.md` → **Execution order**. Slices here map
to checklist items #1 (C), #3 (refactor), #4 (A), #5 (B).

- **Slice C — `conversationCount`** *(first; no v3 plumbing)*: the field is already in
  the **v2** Get/List Customers response (added 2025-11-26). Just surface it in
  `customers view` + `get_customer` (CLI + MCP). Acceptance: a customer with known
  history shows a non-zero `conversationCount`. Fully decoupled from the `/v3/` work.
- **Prerequisite for A & B — version-aware `request()`**: `api-client.ts` hardcodes
  `API_BASE = '…/v2'` (`:27`, used at `:155`). Add an optional `version: 'v2' | 'v3'`
  to `request()` building `…helpscout.net/${version}` (default `v2`). Isolated, no
  behavior change. Don't flip the base globally — v3 is per-endpoint `/v3/` paths.
- **Slice A — Get Conversation v3 + List Threads v3** *(the system_user payoff)*: add
  `getConversationV3()` (`GET /v3/conversations/{id}`) and a v3 threads path
  (`GET /v3/conversations/{id}/threads`) via the version-aware `request()`. Surface
  the real `.type` (incl. `system_user`) — conversation `closedByUser`/`createdBy`/
  `assignee` and per-thread `createdBy`/`assignedTo` — as **additive** fields in
  `conversations view`/`threads` and the `get_conversation`/`get_conversation_threads`
  MCP tools (never drop v2 fields). Acceptance: a known bot-actioned conversation from
  the Knowledge Bot reports shows `system_user` attribution; the bot-FP script can
  consume it.
- **Slice B — List Customers v3** *(conditional)*: cursor-paginated path
  (`GET /v3/customers`, `cursor` param → next at `_links.next.href`, HAL
  `_embedded.customers[]`, always `createdAt` desc) behind the same CLI flags; keep the
  v2 page-based fallback. New cursor-walk helper. Acceptance: full-scan parity vs v2 on
  a real query. Do only when a concrete large-scan need surfaces.
- Each slice: new-idiom MCP registration (registerTool — done wave-wide), tests with
  mocked payloads from the *verified* docs shapes above, TESTING.md updates, standard gates.

## Out of scope

- Webhooks V3 (website repo's surface — hand off the phase-0 findings).
- Organizations API, user-status endpoints (parked in V3_ROADMAP.md).

## Aftercare

- Knowledge Bot workflow doc gets a pointer once Slice A lands (the FP-audit improvement).
- No push without Chris.
