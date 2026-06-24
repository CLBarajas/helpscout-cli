# Upstream Sync — Living Ledger

**The single home for volatile "where are we vs upstream" state.** Update this when you
merge, when you check what's newer upstream, or when you decide to skip something. Keep
durable *policy* in the dev `CLAUDE.md`; keep *numbers and dates* here so they have one
place to rot instead of several.

- **Upstream:** https://github.com/stephendolan/helpscout-cli (`upstream` remote)
- **Fork:** https://github.com/CLBarajas/helpscout-cli (`origin`)
- **Issue-level detail (open upstream issues + fork-side state):** [`UPSTREAM_ISSUES_PLAN.md`](UPSTREAM_ISSUES_PLAN.md)
- **Tool inventory / API coverage (source of truth):** [`API_COVERAGE.md`](API_COVERAGE.md)

## Current state (verified 2026-06-23)

| | |
|---|---|
| Fork HEAD | `09a8606` (merge of `upstream/main`) |
| `package.json` version | `2.16.1` (tracks upstream's number; cosmetic) |
| vs `upstream/main` (`38901b2`) | **0 behind, 57 ahead** — caught up to main |
| Push state | `main` ahead of `origin/main` — **Chris pushes manually; never push without his say-so** |

## Merge history (recent)

| Merged | Upstream point | Fork commit | Notes |
|--------|----------------|-------------|-------|
| 2026-06-23 | `upstream/main` @ `38901b2` (v2.16.1 + #51) | `09a8606` | #50 output-schema passthrough + #51 CI bump |
| 2026-06-12 | v2.16.0 | `bea4efd` | "Fortress GTD triage" |
| 2026-06-10 | v2.15.0 | `45df349` | |

## Pending upstream (newer than what we've merged)

- **v2.17.0 — attachment download — DELIBERATELY EXCLUDED.** Tagged from the unmerged
  `feat/attachment-download` branch (commits `30bc16a` + `770d234`); **not on `main`**, so a
  `git merge upstream/main` does not pull it. The fork already has a broader attachment
  surface (CLI `attachments` + `attachment-download`; MCP `list_conversation_attachments` /
  `get_attachment_data` / `create_attachment` / `delete_attachment`; plus
  [`STREAMING_ATTACHMENTS_PLAN.md`](STREAMING_ATTACHMENTS_PLAN.md)). Keep the fork's. Optional:
  skim upstream's `attachment-download.ts` for a nicer streaming-to-disk idea, but nothing
  functional to gain. Re-evaluate only if upstream merges it to `main` with something the
  fork lacks.

## Watch list (convergence / messy future merges)

- **#47 "expose full HelpScout triage tools"** (already in `upstream/main`, merged here) —
  upstream is independently rebuilding the fork's triage surface. Future overlaps land here;
  resolve toward the broader/fork implementation per the wholesale-merge stance.

## Verification gates (every change)

`bun run typecheck && bun run lint && bun run test` → `bun run build` (+ `bun link` if the
global binary changed). MCP changes additionally need a Claude Code session restart to take
effect. Update the outboard `TESTING.md` (`context/tools/`) when commands change.
