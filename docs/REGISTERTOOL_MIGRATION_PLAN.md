# registerTool Migration — Implementation Plan

**Drafted:** 2026-06-12 · **Status:** ✅ DONE 2026-06-14 (see "Outcome" below)
**Size:** Large but mechanical; batch-by-batch with gates between batches

## Outcome (2026-06-14)

All 41 legacy `server.tool()` registrations migrated to the upstream
`rememberTool()` + `server.registerTool()` idiom. Zero `server.tool()` call
sites remain; 62 tools served, 62 `rememberTool` entries — full registry parity.

- **Defect #2 fixed (the live one):** `search_tools` now sees all 62 tools (was
  22). Verified via stdio smoke (`tools/call search_tools` returns fork tools).
- **Defect #1 fixed:** no more two-idiom rub on upstream merges.
- **Defect #3 (partial):** `annotations` added to every fork tool — read-only
  fetchers `READ_ONLY_REMOTE_ANNOTATIONS`, writers `MUTATING_REMOTE_ANNOTATIONS`,
  and a **new `DESTRUCTIVE_REMOTE_ANNOTATIONS`** (`destructiveHint:true`) on the
  6 `delete_*` tools. **Deferred (intentional follow-up):** `outputSchema` /
  structured content on the migrated tools — handlers still return `jsonResponse`
  (`textJsonResult`). Several have `{error}` branches that would break output
  validation, so per the spec ("only where cheap") this is left for a later pass.
- **Parity lock:** `src/mcp/server.test.ts` now asserts every served tool has a
  `rememberTool` entry (and vice-versa) via the new `getServerToolNamesForTesting()`
  helper, which reads the SDK's `_registeredTools`. This locks the 22-vs-62 defect
  out permanently.
- **Audits:** no `.color` readers in `src/` (TagStyle deprecation is a no-op for
  us); `search_conversations` and its caps were untouched (already registerTool),
  so the Dev CLAUDE.md "fetch ALL pages → jq-filter by assignee" workflow is
  unaffected.
- **Gates:** typecheck clean, lint 0, 43 tests pass (was 42), `bun run build` +
  `bun link` OK. **Not committed/pushed** (awaiting Chris).
- **Remaining aftercare:** Dev CLAUDE.md MCP-tool table sweep (annotations/search
  coverage note) — left for Chris since it's a global-instructions file.
**Motivation (three concrete defects/costs):**
1. **Merge tax:** upstream's `server.ts` is now 100% `registerTool`; the fork's 41 added tools
   still use legacy `server.tool()`. All 5 conflict hunks in the 6/12 v2.16.0 merge (`bea4efd`)
   were this idiom rub. It recurs every sync and worsens as upstream iterates on MCP.
2. **Discovery defect (live today):** `search_tools` reads the `rememberTool` registry —
   22 entries vs 62 served tools. The 41 fork tools are invisible to tool search.
3. **Capability gap:** fork tools lack `annotations` (read-only/mutating hints hosts use for
   permissioning), `outputSchema`/structured content, and the response-size caps upstream
   applies to list-shaped results.

## Current state (file:line as of `bea4efd`)

- `src/mcp/server.ts` (~2,100 lines): 21 upstream-idiom tools (`rememberTool(name, desc)` +
  `server.registerTool(name, {title, description, inputSchema, outputSchema?, annotations}, handler)`),
  41 fork tools as `server.tool(name, desc, zodShape, handler)` returning `jsonResponse(...)`
  (46 call sites).
- Helpers already in place (from upstream, available to fork tools after migration):
  - `:23` `DEFAULT_MAX_RESULTS = 25`, `:24` `DEFAULT_MAX_THREADS = 20`
  - `:132` `structuredJsonResult(...)` — structured content + resource links
  - `:576/:582/:588` `READ_ONLY_REMOTE_ANNOTATIONS`, `READ_ONLY_LOCAL_ANNOTATIONS`,
    `MUTATING_REMOTE_ANNOTATIONS`
  - `:625` `rememberTool(name, description)` — the search registry
- Canonical target idiom: see `search_by_customer` registration (~`:2030`); canonical legacy
  block to migrate: `create_reply` (~`:1575`).

## Migration shape (per tool)

```ts
// BEFORE (legacy fork idiom)
server.tool(
  'remove_tag',
  'Remove a tag from a conversation',
  {
    conversationId: z.coerce.number().describe('Conversation ID'),
    tag: z.string().describe('Tag name to remove'),
  },
  async ({ conversationId, tag }) => {
    await client.removeConversationTag(conversationId, tag);
    return jsonResponse({ success: true });
  }
);

// AFTER (upstream idiom)
rememberTool('remove_tag', 'Remove a tag from a conversation');
server.registerTool(
  'remove_tag',
  {
    title: 'Remove Tag',
    description: 'Remove a tag from a conversation',
    inputSchema: {
      conversationId: z.coerce.number().describe('Conversation ID'),
      tag: z.string().describe('Tag name to remove'),
    },
    outputSchema: { success: z.boolean() },          // only where cheap; else omit
    annotations: MUTATING_REMOTE_ANNOTATIONS,
  },
  async ({ conversationId, tag }) => {
    await client.removeConversationTag(conversationId, tag);
    return structuredJsonResult({ success: true });   // or jsonResponse if no outputSchema
  }
);
```

**Rules:**
- Zod shapes move verbatim — keep every `z.coerce`; behavior drift in arg parsing is the main
  regression risk.
- `title` = Title Case of the tool name; `description` = existing description verbatim
  (these feed `search_tools` and host UIs).
- Annotations: read-only fetchers → `READ_ONLY_REMOTE_ANNOTATIONS`; anything that writes →
  `MUTATING_REMOTE_ANNOTATIONS`; **add a new `DESTRUCTIVE_REMOTE_ANNOTATIONS`**
  (`destructiveHint: true`) for the `delete_*` family (8 tools) — upstream has no destructive
  tools so no constant exists yet.
- `outputSchema`: add only where the return shape is already stable and simple (`success`
  booleans, small fixed objects). Do NOT invent schemas for rich API passthroughs — that's
  follow-up work, not this migration.
- Response caps: apply `maxResults`-style caps ONLY to fork tools returning unbounded lists,
  and audit consumers first (see Batch 6 note on `search_conversations`-style workflow
  dependencies in Dev CLAUDE.md).

## Batches (gate: typecheck + lint + test + stdio smoke between each)

1. **Read-only simple** (≈12): `get_current_user`, `get_team`, `list_teams`, `list_team_members`,
   `list_saved_replies`, `get_saved_reply`, `list_mailbox_fields`, `get_conversation_fields`,
   `list_customer_emails`, `list_customer_phones`, `list_conversation_attachments`,
   `get_attachment_data`.
2. **Reports** (≈6): `get_company_report`, `get_conversations_report`, `get_productivity_report`,
   `get_first_response_time`, `get_happiness_report`, `get_happiness_ratings`.
3. **Customer CRUD** (≈9): `create_customer`, `update_customer`, `delete_customer`,
   `create/update/delete_customer_email`, `create/update/delete_customer_phone`.
4. **Conversation mutations** (≈10): `update_conversation`, `update_conversation_fields`,
   `create_reply`, `create_conversation`, `update_thread`, `snooze_conversation`,
   `unsnooze_conversation`, `remove_tag`, `delete_conversation`, `create_attachment`,
   `delete_attachment`.
5. **Saved-reply CRUD** (≈3): `create/update/delete_saved_reply`.
6. **Cleanup + audits:**
   - Delete any now-unused legacy helpers (`jsonResponse` only if zero call sites remain).
   - **TagStyle audit (riding along):** HS deprecated `tags[].color` for TagStyle — grep the
     repo for `.color` readers (types in `src/types/index.ts`, tag cleaning in server.ts);
     outboard skills/tools confirmed clean 6/12. Adjust types/strippers if we read it.
   - **Caps/workflow audit:** Dev CLAUDE.md documents a "fetch ALL pages then jq-filter by
     assignee" workflow on `search_conversations`. Verify upstream's caps + omission metadata
     don't truncate it; if they do, document the `maxResults` escape hatch there.

## Verification

- Per batch: `bun run typecheck && bun run lint && bun test`, plus the stdio handshake harness
  (see 6/12 journal — initialize → tools/list → assert count == 62 and batch tools present),
  plus one real `tools/call` per migrated read-only tool against live data.
- Final: `bun run build && bun link`; **session-restart MCP smokes** (the standing pending set):
  `search_conversations` caps behavior, `create_note`, one live `note --status closed`, and
  `search_tools` now returning fork tools (the defect this fixes — assert `get_team` et al.
  appear).
- Add/extend `src/mcp/server.test.ts` to assert registry parity: every registered tool has a
  `rememberTool` entry (locks the 22-vs-62 defect out permanently).

## Out of scope

- Resource templates / prompt templates (upstream's `helpscout://` resources) — separate decision.
- Rich outputSchemas for API passthrough tools.
- Any CLI command changes.

## Aftercare

- Update `FORK_IMPLEMENTATION_PLAN.md` (MCP tools section) + Dev CLAUDE.md MCP table ("Fork"
  column unchanged, but note annotations/search coverage).
- No push without Chris.
