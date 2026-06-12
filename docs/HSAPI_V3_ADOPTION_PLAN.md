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
4. Fill in:

| Endpoint | Verified path | Shape delta | Adopt? | Slice |
|----------|--------------|-------------|--------|-------|
| Get Conversation v3 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| List Customers v3 | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| conversationCount | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

**Gate: review the table with Chris before phase 1.**

## Phase 1+ — Implementation slices (sketch; refine after phase 0)

- **Slice A — Get Conversation v3:** likely a `getConversationV3()` or version flag on
  `getConversation()`; surface `system_user` in `conversations view`/`threads` output and the
  `get_conversation` MCP tool (additive fields only — never drop v2 fields consumers read).
  Acceptance: a known bot-actioned conversation from the Knowledge Bot reports shows
  attribution; the bot-FP script can consume it.
- **Slice B — List Customers v3:** cursor-paginated `listCustomers` path behind the same CLI
  flags; keep v2 fallback. Acceptance: full-scan parity vs v2 on a real query.
- **Slice C — conversationCount:** plumb the field through `customers view` + `get_customer`.
- Each slice: new-idiom MCP registration (post REGISTERTOOL_MIGRATION), tests with mocked
  payloads from the *verified* docs shapes, TESTING.md updates, standard gates.

## Out of scope

- Webhooks V3 (website repo's surface — hand off the phase-0 findings).
- Organizations API, user-status endpoints (parked in V3_ROADMAP.md).

## Aftercare

- Knowledge Bot workflow doc gets a pointer once Slice A lands (the FP-audit improvement).
- No push without Chris.
