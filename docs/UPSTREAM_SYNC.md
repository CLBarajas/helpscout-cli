# Upstream Sync — Living Ledger

**The single home for volatile "where are we vs upstream" state.** Update this when you
merge, when you check what's newer upstream, or when you decide to skip something. Keep
durable *policy* in the dev `CLAUDE.md`; keep *numbers and dates* here so they have one
place to rot instead of several.

- **Upstream:** https://github.com/stephendolan/helpscout-cli (`upstream` remote)
- **Fork:** https://github.com/CLBarajas/helpscout-cli (`origin`)
- **Issue-level detail (open upstream issues + fork-side state):** [`UPSTREAM_ISSUES_PLAN.md`](UPSTREAM_ISSUES_PLAN.md)
- **Tool inventory / API coverage (source of truth):** [`API_COVERAGE.md`](API_COVERAGE.md)

## Current state (verified 2026-08-05)

| | |
|---|---|
| Fork HEAD | `c0f673e` — **on branch `merge/upstream-2.17.1`, not yet on `main`** |
| `main` | still `ad6f9bb`; lands via `git merge --ff-only merge/upstream-2.17.1` |
| `package.json` version | `2.17.1` (tracks upstream's number; cosmetic) |
| vs `upstream/main` (`6d0f577`, tag `v2.17.1`) | **0 behind, 73 ahead** on the merge branch |
| Push state | `main` is **1 ahead of `origin/main`** (`ad6f9bb` unpushed) and the merge branch is local-only — **Chris pushes manually; never push without his say-so** |
| Rollback | tag `pre-upstream-2.17.1` + branch `backup/pre-merge-2.17.1`, both at `ad6f9bb`. These are the *only* rollback points — `ad6f9bb` is not on the remote. |

## Merge history (recent)

| Merged | Upstream point | Fork commit | Notes |
|--------|----------------|-------------|-------|
| 2026-08-05 | `upstream/main` @ `6d0f577` (tag `v2.17.1`) | `b6eca0a` (+ `c0f673e`) | All 7 commits taken. **zod 3.25.76 → 4.4.3** and **TypeScript 6 → 7** both land here; TS 7 split into its own commit (`c0f673e`) so a red typecheck would have one cause. Draft-reply customer fix closes our own #48. Attachment download adopted (see below). Gates: typecheck 0, lint 0, **123/123** tests (was 110), build OK. Conflicts: bun.lock (regenerated), package.json (hand-assembled), `conversations.ts`, `api-client.test.ts`, `mcp/server.ts`. **Two files merged *silently* and needed hand-fixing — see "Merge hazards proven real" below.** |
| 2026-07-08 | `upstream/main` @ `dc1b7a6` (#58 dep bumps) | `bfe0d84` | commander 15 + html-to-text 10 + TS 6 adopted (typecheck / 89 tests / build all green); zod held at 3.x by upstream itself; kept fork's `mime-types`. Conflicts: package.json (adjacent adds) + bun.lock (regenerated) |
| 2026-06-23 | `upstream/main` @ `38901b2` (v2.16.1 + #51) | `09a8606` | #50 output-schema passthrough + #51 CI bump |
| 2026-06-12 | v2.16.0 | `bea4efd` | "Fortress GTD triage" |
| 2026-06-10 | v2.15.0 | `45df349` | |

## Pending upstream (newer than what we've merged)

*(nothing — `upstream/main` is fully merged as of 2026-08-05)*

Unmerged upstream **branches** exist but none are on `main`, so a wholesale merge ignores them:
`chore/zod-v4-compat-pin`, `chore/typescript-7-lockfile`, `feat/attachment-download`,
`fix/mcp-passthrough-output-schemas`, several `boris/*` and dependabot branches.
Two are already superseded and can be ignored permanently:

- `chore/typescript-7-lockfile` (`297c76c`) — byte-identical to what landed as `47f5913`
  (same patch-id, same tree, same parent).
- `chore/zod-v4-compat-pin` (`df55ea9`, "bump zod to 4.0.17, pinned below SDK-incompatible
  4.1.x") — abandoned in favor of `da69536`, which took `^4.0.0` unpinned. **We installed
  4.4.3 and all gates pass**, so upstream's "4.1.x is SDK-incompatible" worry did not
  materialize for us. Revisit only if MCP tooling starts misbehaving.

### Correction: attachment download was NOT excludable (2026-08-05)

The prior revision of this doc said v2.17.0's attachment work was "tagged from the unmerged
`feat/attachment-download` branch … **not on `main`**, so a `git merge upstream/main` does not
pull it," and that there was "nothing functional to gain." **Both halves were wrong**, and the
error survived here for four weeks:

- `6d0f577` (the v2.17.1 release merge) reconciled that branch into `main`. `30bc16a` and
  `770d234` are commits 1 and 2 of `main..upstream/main` — a wholesale merge pulls them, and
  they collide destructively (see below).
- There *was* functional gain. Upstream's write layer — atomic temp-write, `--force` EEXIST
  guard, recursive `mkdir`, directory-output mode — is strictly better than our bare
  `writeFileSync`, which silently clobbered. We adopted it onto our own command, and kept
  upstream's MCP `download_attachment` (we had no equivalent; ours never wrote a file).

**Lesson for the next sync:** "it's only on a branch upstream" is a fact with a shelf life.
Re-derive `main..upstream/main` every time rather than trusting a recorded exclusion.

## Merge hazards proven real (2026-08-05)

Both of these merged with **no conflict markers** — no gate but `typecheck` and a manual smoke
test would have caught them. Check for recurrences on every future sync:

1. **Duplicate `downloadAttachment` in `api-client.ts`.** Upstream's (metadata return) and
   ours (redirect-safe transport) landed in the same class. Only `bun run typecheck` sees this;
   `tsup` sets `dts: false` and builds a working-looking bundle. Resolved by merging the two:
   our transport (manual redirect + bare `fetch` on the storage hop, so `Authorization` never
   leaves helpscout.net) returning upstream's `AttachmentDownload`.
2. **Duplicate `attachments` command in `conversations.ts`.** Upstream nests
   `attachments download`; we use flat `attachment-download`. Commander 15 *throws* on a
   duplicate name (`_registerCommand`, `commander/lib/command.js:645-659`), and because
   `src/cli.ts` builds commands at module scope, the merged binary would have died on **every**
   invocation including `helpscout mcp`. `src/commands/conversations.test.ts` is now rewritten
   to pin our flat shape so this cannot return silently.

## Watch list (convergence / messy future merges)

- **Attachment surface** — upstream now has its own attachment command group and
  `attachment-download.ts`. Every future sync will re-propose the nested `attachments download`
  namespace. Keep ours flat: ~15 outboard files reference `attachment-download` by name.
- **zod 4 wire-format change (open decision).** Under zod 4 the MCP SDK swaps JSON-Schema
  converters and stops emitting `"additionalProperties": false` on tool `inputSchema`s.
  Measured over a live `tools/list` on both builds: **164 of 168 tools had it under zod 3.25.76;
  0 of 169 have it under 4.4.3.** `outputSchema` is unaffected (18 of 21 keep it). No gate
  detects this — it surfaces only as looser argument validation in MCP clients. We have zero
  `.strict()` input objects (every `inputSchema` is a bare `ZodRawShape`). **Undecided:** accept
  the looser schema, or restore it with `.strict()`.
- **#47 "expose full HelpScout triage tools"** (already in `upstream/main`, merged here) —
  upstream is independently rebuilding the fork's triage surface. Future overlaps land here;
  resolve toward the broader/fork implementation per the wholesale-merge stance.

## Verification gates (every change)

`bun run typecheck && bun run lint && bun run test` → `bun run build` (+ `bun link` if the
global binary changed). MCP changes additionally need a Claude Code session restart to take
effect. Update the outboard `TESTING.md` (`context/tools/`) when commands change.
