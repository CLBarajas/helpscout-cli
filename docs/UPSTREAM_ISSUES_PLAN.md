# Upstream Issues Batch — Drafting Plan

**Drafted:** 2026-06-12 · **Status:** SPEC — no drafts written yet
**Size:** Small (writing exercise + staggered posting)
**Hard rule:** Drafts live in THIS doc until Chris approves each one individually.
**Never post without explicit confirmation. Issues only — never PRs.**

## Strategy (why issues, why now)

- Repo-history data point (verified 6/10, pinned in Dev CLAUDE.md): **no outside human PR has
  ever been merged** into stephendolan/helpscout-cli. The maintainer builds from issues, his
  way — precedent: our note `--status` PR (#26) closed unmerged; he shipped his own (#45).
- **Receptive window:** v2.16.0 ("Fortress GTD triage", PR #47) shows he's actively building
  agent-triage workflows on MCP. Features that serve triage agents fit his current direction.
- Each issue MAY include a "our fork implements a version of this: <permalink>" pointer —
  reference, not submission.
- Exception standing: if he ever replies "PR welcome," invest in ONE atomic, idiom-matched PR
  (registerTool style, zod shapes, his test patterns) for that item only.

## Candidates, ranked by fit to his triage direction

| Rank | Feature (fork has it) | Triage story (the framing that lands) |
|------|----------------------|----------------------------------------|
| 1 | Update conversation (assignee/status/subject/mailbox) | An agent that triages must be able to route — assignment is the core triage mutation |
| 2 | Custom fields read/write | Triage = classification; HS custom fields are where classification lives |
| 3 | Attachments list + download | Agents can't diagnose without the log/file the customer attached |
| 4 | Snooze/unsnooze | Follow-up scheduling is half of queue management |
| 5 | Saved-replies list/get (read tier first) | Agents drafting replies should reuse the team's approved language |
| 6 | Reports | Weakest fit for triage; possibly hold back entirely |

## Drafting rules (per issue)

- **One claim + one ask** — use-case framed, not implementation-framed. Describe the workflow
  gap ("an MCP-driven triage agent cannot reassign a conversation"), not the code we wrote.
- Match his issue register: short, concrete, no feature-list dumps. One issue per capability —
  no omnibus.
- Include the fork permalink as a single trailing line, take-it-or-leave-it tone.
- No timelines, no "would you accept a PR" (the data answers that).

## Process

1. Write all six drafts into the section below (one PR-able… *issue-able* block each).
2. Chris reviews → trims/kills/approves individually.
3. **Stagger posting: 1–2 at a time** (rank order), wait for reception before the next pair.
   If one gets implemented upstream, the next sync drops the fork duplicate (note `--status`
   precedent) — that's the win condition.
4. Track outcomes in this doc (filed link, his response, shipped-in version, fork-side cleanup).

## Drafts

_(to be written at execution; one `### Draft N — <title>` block per candidate, full issue
body verbatim, status line: DRAFT / APPROVED / POSTED <link> / SHIPPED <version>)_

## Aftercare

- On any upstream adoption: drop fork duplicate at next merge, retest dependent skills
  (the `/paddle-refund` note-and-close retest pattern from the note `--status` swap).
- No push of the fork repo without Chris (unrelated, but standing).
