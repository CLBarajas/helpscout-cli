# Docs API — Verification Handoff

Status as of **2026-06-26**. Branch: `docs-api-foundation` (6 commits, `4773ba2`→`1aee311`).
Full Help Scout Docs API support (CLI + MCP) is implemented and unit-tested; this is the
plan to verify the parts that can only be confirmed against the live API. Written so a
fresh session can execute it cold.

## What's already done

- **Build/verify gates pass:** `bun run typecheck`, `bun run lint` (0/0), `bun run test`
  (89 tests incl. the MCP registry-parity test).
- **Reads verified live** against the real account: `docs tree`, `docs collections list`,
  `docs categories list`, `docs articles list/revisions`, `docs sites list`,
  `docs redirects list`. All return real data.
- **Writes are NOT live-exercised** — typechecked + unit-tested only, because they mutate
  real Docs content. That's the main job below.

## Prereqs for this session

1. Docs API key is already in the keychain (`helpscout-cli` / `docs-api-key`); the keychain
   ACL prompt was approved, so `bun dist/cli.js docs …` runs without hanging.
2. Build first: `cd ~/Developer/GitHub/CLBarajas/helpscout-cli && bun run build`
   (run commands as `bun dist/cli.js docs …`; source-run via `bun run src/cli.ts` fails on
   the build-time `__VERSION__` define).
3. **To test the MCP tools**, run `bun run link` and **restart Claude Code** — the connected
   MCP server only surfaces the new `mcp__helpscout__docs_*` tools after a restart.

## Sandbox

Use the **Draft KB** collection — private, internal, low-stakes:
`id 5c20bfb104286304a71da8cc` (number `212`). A stray test article there is harmless. Clean
up everything created (steps include deletes).

## 1. Article write round-trip (create → update → drafts → delete)

```bash
cd ~/Developer/GitHub/CLBarajas/helpscout-cli
CID=5c20bfb104286304a71da8cc

# create — should come back status "notpublished"
bun dist/cli.js docs articles create --collection "$CID" \
  --name "ZZ Test $(date +%s)" --text "<p>hello</p>" -c
#   capture the returned article id → AID

# verify it's unpublished and readable
bun dist/cli.js docs articles view <AID> -c

# partial-merge update: change ONLY the name; confirm text/status are preserved
bun dist/cli.js docs articles update <AID> --name "ZZ Renamed" -c
bun dist/cli.js docs articles view <AID> -c        # text still "<p>hello</p>"?

# draft round-trip (published copy must stay untouched)
bun dist/cli.js docs articles save-draft <AID> --text "<p>draft body</p>"
bun dist/cli.js docs articles view <AID> --draft -c   # draft body
bun dist/cli.js docs articles view <AID> -c           # published body unchanged
bun dist/cli.js docs articles delete-draft <AID> --yes

# clean up
bun dist/cli.js docs articles delete <AID> --yes
```

**Watch for:** create returns the object (proves `?reload=true`); update preserves omitted
fields (proves the partial-merge assumption); `--draft` view differs from the published view.

## 2. Resolve the two UNVERIFIED semantics

These shipped with a documented "unverified" caveat — settle them here and update
`API_COVERAGE.md` + the in-code comments if reality differs.

**(a) Collection / category PUT — merge vs full-replace.** Our `updateDocsCollection` /
`updateDocsCategory` send *only provided fields* + the API-required `name`. If the API is
actually full-replace, omitted fields reset.

```bash
# create a test category with several fields set
bun dist/cli.js docs categories create --collection "$CID" \
  --name "ZZ Cat $(date +%s)" --visibility private --default-sort name -c
#   → capture category id KID

# update ONLY the name, then re-list and inspect whether visibility/defaultSort survived
bun dist/cli.js docs categories update <KID> --collection "$CID" --name "ZZ Cat Renamed" -c
bun dist/cli.js docs categories list "$CID" -c     # did visibility/order persist?

bun dist/cli.js docs categories delete <KID> --yes
```
- If omitted fields **persist** → merge (our impl is correct; drop the "unverified" caveat).
- If they **reset** → full-replace; switch the client to read-then-merge the full field set
  (like `updateDocsSite` already does) and update the docs.

**(b) Redirect create optional-field passthrough.** Our create sends optional
`type`/`documentId`/`anchor`. Confirm the API accepts them (some create endpoints reject
unknown fields). Needs a site with at least one — RA currently has **0 redirects**, so this
is optional / low-stakes; create one on the RA Nucleus site
(`5bf4b58e2c7d3a31944e2e1f`) only if you want to confirm, then delete it.

## 3. Site update is full-replace (already implemented as such — just confirm)

`updateDocsSite` requires the complete field set by design. **Do not** test destructive
site create/update/delete on the live RA Nucleus site casually — there's only one site and
it's production. Treat sites read-only unless you have a specific need.

## 4. MCP tool surface (after `bun run link` + restart)

Confirm the 36 Docs tools surfaced and a couple work end-to-end:
- `mcp__helpscout__docs_tree` → same hierarchy as the CLI.
- `mcp__helpscout__docs_list_collections`, `docs_get_article`, `docs_search_articles`.
- Spot-check that read tools are annotated read-only and writes mutating/destructive
  (the parity test already guarantees registration; this confirms host-side behavior).

## 5. Remaining / out of scope

- **Assets** (3 multipart-upload endpoints) are intentionally unimplemented — Shadow Docs
  keeps images as absolute rogueamoeba.com URLs. Only build if a real need appears.
- **Shadow Docs Python bridge** (`outboard/tools/kb_docs_sync.py`) still has its own
  Basic-auth/pagination/Location-parsing. Once writes are confirmed, it can be repointed at
  these CLI/MCP primitives (keep the sync *policy* — reconcile, content-hash — in Python).
- **Upstream:** fork-only; upstream has no Docs support. Don't push to `origin/main`; at most
  a "gauge interest" issue per `UPSTREAM_ISSUES_PLAN.md`.
