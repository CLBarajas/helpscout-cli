# v3 Enhancement Wave — Roadmap

**Drafted:** 2026-06-12 (post v2.16.0 merge `bea4efd`)
**Status (2026-06-14):** Item #2 (registerTool migration) ✅ DONE (not yet committed/pushed).
Item #3 (HS API v3) Phase-0 research ✅ DONE — decision table filled in
`HSAPI_V3_ADOPTION_PLAN.md`. Item #4 first issue (#48, draft-reply 400) ✅ FILED.
Remaining code work is now an ordered, rollable checklist — see **Execution order** below.
Each linked spec is self-contained for a fresh session.
**Provenance:** Synthesized from the 6/12 HS Mailbox API changelog review (outboard `tasks/log.md`),
the 6/10 merge-session backlog (outboard `tasks/inbox.md`), and `FORK_IMPLEMENTATION_PLAN.md`.
"v3" = this wave of fork enhancements, largely built around Help Scout's API v3 endpoint rollout.

## Context for a cold session

- Fork = daily-driver Help Scout CLI + MCP server. Upstream (stephendolan) is active again and
  building agent-triage features on MCP; we merge wholesale now (v2.15.0 on 6/10 → `45df349`,
  v2.16.0 on 6/12 → `bea4efd`), not cherry-pick. Strategy with upstream: **file issues, never PRs**
  (no outside human PR has ever been merged there; maintainer reimplements from issues — see
  note `--status` precedent: our PR #26 closed, his PR #45 shipped it).
- Fork state at writing: 62 MCP tools (41 fork-only), v2.16.0, main 2 ahead of origin (Chris
  pushes manually — **never push without his say-so**).
- Verification gates for everything: `bun run typecheck && bun run lint && bun test`, then
  `bun run build` + `bun link`; MCP changes additionally need a Claude Code session restart
  to take effect. Update `TESTING.md` when commands change.

## Execution order (rolling checklist)

The single source of truth for "what's next." Tick each as it lands; gates
(`typecheck && lint && test` → `build` + `link`; MCP changes need a session restart)
apply to every code step. **Never push without Chris.**

- [ ] **0. Commit + push the registerTool migration** *(manual — Chris)*. Clears the
      deck (origin is ~4 behind). Also pending: post-restart MCP smokes
      (`create_note`, one live `note --status closed`, `search_conversations` caps)
      and the Dev CLAUDE.md MCP-table annotations note.
- [ ] **1. v3 Slice C — `conversationCount`** · S · no v3 plumbing. Surface the
      existing **v2** field (added 2025-11-26) in `customers view` + `get_customer`
      (CLI + MCP). Smallest, zero-risk warm-up. → `HSAPI_V3_ADOPTION_PLAN.md` Slice C.
- [ ] **2. Streaming attachments** · S · independent. → `STREAMING_ATTACHMENTS_PLAN.md`.
      Step 0 (confirm exact download path/redirect behavior against the docs) is the
      gate; changelog research is already warm from the v3 dive. Implement with the
      base64 fallback so `/debug-log-reader` is unaffected.
- [ ] **3. Version-aware `request()` refactor** · XS · enables all v3 REST. Add an
      optional `version: 'v2' | 'v3'` to `api-client.ts` `request()` (build base from
      `…helpscout.net/${version}`, default `v2`). Isolated, no behavior change. HS
      exposes v3 as separate `/v3/` paths per-endpoint, so do NOT flip the base globally.
- [ ] **4. v3 Slice A — Get Conversation v3 + List Threads v3** · M · depends on #3.
      `system_user` attribution: `closedByUser`/`createdBy`/`assignee` on the
      conversation (`GET /v3/conversations/{id}`) + per-thread `createdBy`/`assignedTo`
      (`GET /v3/conversations/{id}/threads`). Surface as **additive** fields in CLI +
      `get_conversation`/`get_conversation_threads` MCP — never drop v2 fields. This is
      the slice with a waiting consumer: the Knowledge Bot false-positive audit.
- [ ] **5. v3 Slice B — List Customers v3 cursor** · M · depends on #3 · **conditional**.
      Only if a concrete large-scan need surfaces (bounce/paddle reconciliation). New
      cursor-walk helper (`cursor` param → `_links.next.href`), v2 fallback retained.
- [ ] **6. Upstream issues** · ongoing · independent. #48 filed 6/14; stagger 1–2 more
      per `UPSTREAM_ISSUES_PLAN.md`, watch reception before investing further.

### Spec index (size + status)

| Spec | Size | Status |
|------|------|--------|
| [REGISTERTOOL_MIGRATION_PLAN.md](REGISTERTOOL_MIGRATION_PLAN.md) | L | ✅ Done 6/14 (uncommitted) |
| [HSAPI_V3_ADOPTION_PLAN.md](HSAPI_V3_ADOPTION_PLAN.md) | M | Phase-0 research ✅; slices C/A/B = checklist #1,#4,#5 |
| [STREAMING_ATTACHMENTS_PLAN.md](STREAMING_ATTACHMENTS_PLAN.md) | S | Spec only = checklist #2 |
| [UPSTREAM_ISSUES_PLAN.md](UPSTREAM_ISSUES_PLAN.md) | S | In progress (#48 filed) = checklist #6 |

## Parked (not in this wave)

- **Organizations API** — no Rogue Amoeba use case identified yet; B2C-shaped support load.
- **User-status endpoints** — speculative rotation/coverage tooling; revisit if the support-schedule
  workflows ever want live presence data.
- **Docs API surface** (`docs/HELPSCOUT_DOCS_API_SUMMARY.md`, Jan 2026 research) — separate product
  (KB sync); big ticket; belongs to website/KB tooling discussions, not the CLI wave.
- **Independent-identity rename** (`FORK_IMPLEMENTATION_PLAN.md` § Versioning Strategy, Mar 2026) —
  premise ("diverged too far to track upstream") no longer holds after the 6/10+6/12 reconvergence.
  Stay on upstream's version numbers; revisit only if upstream goes quiet again.

## Riding along (not spec-worthy alone)

- **TagStyle deprecation audit** — folded into REGISTERTOOL_MIGRATION_PLAN (audit `.tags[].color`
  readers while touching tag tools; no outboard skills/tools consume it — repo-internal only).
- **Pending post-merge MCP smokes** — folded into REGISTERTOOL_MIGRATION_PLAN verification
  (esp. `search_conversations` response caps vs. the Dev CLAUDE.md "fetch ALL pages"
  assignee-filter workflow; `create_note`; live `note --status closed`).
- **Doc refresh** — `FORK_IMPLEMENTATION_PLAN.md` sync policy rewritten 6/12 (wholesale-merge
  reality); Dev CLAUDE.md MCP tool table gets a sweep after the migration lands.
