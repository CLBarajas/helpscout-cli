# v3 Enhancement Wave — Roadmap

**Drafted:** 2026-06-12 (post v2.16.0 merge `bea4efd`)
**Status:** Specs written, none started. Each spec below is self-contained for a fresh session.
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

## The wave, in recommended order

| # | Spec | Size | Why this order |
|---|------|------|----------------|
| 1 | [STREAMING_ATTACHMENTS_PLAN.md](STREAMING_ATTACHMENTS_PLAN.md) | S | Fast win, independent surface, daily debug-log value; also exercises the changelog-research muscle the v3 spec needs |
| 2 | [REGISTERTOOL_MIGRATION_PLAN.md](REGISTERTOOL_MIGRATION_PLAN.md) | L | Pay the modernization tax before adding features: kills the two-idiom merge churn (all 5 conflicts in the 6/12 merge were idiom rub), fixes the 41-tools-invisible-to-`search_tools` defect, unlocks caps/outputSchemas/annotations for fork tools |
| 3 | [HSAPI_V3_ADOPTION_PLAN.md](HSAPI_V3_ADOPTION_PLAN.md) | M (research-first) | New endpoints land in the new idiom; research phase can overlap #2 |
| 4 | [UPSTREAM_ISSUES_PLAN.md](UPSTREAM_ISSUES_PLAN.md) | S (drafting) | Independent of code work; stagger 1–2 issues at a time, watch reception |

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
