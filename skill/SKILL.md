---
name: helpscout
description: Read and manage Help Scout support data — conversations, threads, replies, notes, tags, customers, mailboxes, saved replies, workflows, users, teams, and analytics reports — via a bundled Help Scout CLI binary. Use when the user mentions Help Scout, a support inbox, support tickets or conversations, customer email history, canned/saved replies, support volume or happiness metrics, or asks to look up, triage, reply to, tag, assign, snooze, or close a support conversation.
---

# Help Scout

Bundled CLI for Help Scout's Mailbox API 2.0 (helpscout-cli v{{VERSION}}). Outputs JSON on
stdout, so pipe to `jq` freely.

## Running the CLI

Invoke the binary bundled with this skill:

```bash
"$SKILL_DIR/bin/{{BINARY_NAME}}" conversations list
```

`$SKILL_DIR` is this skill's base directory, given when the skill loaded. Set it once per
session rather than repeating the full path. If the binary cannot execute (wrong platform, or
macOS quarantine — clear with `xattr -d com.apple.quarantine`), fall back to a `helpscout` on
PATH; the commands are identical.

## Authentication

Check first — every data command fails without credentials:

```bash
helpscout auth status     # {"authenticated": true, "configured": true} when ready
```

If not configured, the user must create an OAuth app at Help Scout > Your Profile > My Apps,
then run `helpscout auth login --app-id ID --app-secret SECRET`. Do not invent credentials.
`HELPSCOUT_APP_ID` / `HELPSCOUT_APP_SECRET` / `HELPSCOUT_MAILBOX_ID` are honored as an
alternative.

## Controlling output size

Conversation payloads are large and thread bodies are HTML. Default to the narrowest output
that answers the question:

| Flag | Effect |
| --- | --- |
| `-f, --fields id,number,subject,status` | Whitelist fields, applied to each record in a list |
| `-p, --plain` | Strip HTML from body fields |
| `-c, --compact` | Single-line JSON |
| `--summary` (on `conversations list`) | Aggregate counts instead of the conversation list |

Global flags go before the subcommand: `helpscout -p conversations threads 456`.

## Conversation numbers are not conversation ids

The number a user quotes ("issue 27146"), and the number shown in the Help Scout UI, is **not**
the id every command takes. Passing a number where an id belongs returns a bare 404. Resolve it
first:

```bash
helpscout conversations list --status all -q 'number:27146' -f id,number,subject,status
# → {"conversations":[{"id":3379889773,"number":27146,...}]}
helpscout -p conversations threads 3379889773
```

`--status all` matters: `conversations list` defaults to active conversations only, so a lookup
by number silently misses anything closed. A search with no matches prints just
`{"page":{"number":1}}` — an empty page object means "not found", not "command failed".

## Common workflows

```bash
# Triage: what is open right now
helpscout conversations list --status active -f id,number,subject,status

# Volume snapshot rather than the full list
helpscout conversations list --status active --summary

# Search with Help Scout query syntax
helpscout conversations list -q 'status:open customer:john@example.com'

# Read a thread history as plain text, including internal notes
helpscout -p conversations threads 456 --include-notes

# Find a customer, then open their record
helpscout customers list --first-name John
helpscout customers view 789
```

`conversations threads` shows email communications only by default. Add `--include-notes` for
internal notes, or `--all` for line items, workflow entries, and other machinery.

Resolve a mailbox once with `helpscout mailboxes list` and reuse its id; set a default with
`helpscout mailboxes set-default <id>` when the user works in a single inbox.

## Investigating customer-supplied files

Bug reports arrive as attachments — logs, crash reports, zip archives. `-o` takes a **file
path**, not a directory; pointing it at a directory fails, and the failure is easy to miss
because errors print as JSON rather than exiting loudly.

```bash
helpscout conversations attachments 3379889773
# → filename, mimeType, size, threadId per attachment

helpscout conversations attachment-download 3379889773 949578308 -o "$SCRATCH/Archivio.zip"
unzip -q "$SCRATCH/Archivio.zip" -d "$SCRATCH/archivio"
```

Download into a scratch directory rather than the user's project. Check `size` before
downloading — support archives are routinely tens or hundreds of MB unpacked, so summarize
large logs with a script instead of reading them whole.

## Before writing

`reply` sends real email to a real customer, and `delete` is permanent. Confirm the exact
recipient and body with the user before running `conversations reply`, `conversations delete`,
`conversations update`, or any `customers` mutation. Drafting the command and showing it for
approval is the correct default.

Notes (`conversations note`) are internal-only and safe to add without the same ceremony.

Write endpoints are rate limited to 12 requests per 5 seconds (200 reads/minute overall). Batch
work sequentially rather than in parallel; a 429 means back off.

## Errors

Failures print JSON rather than throwing:

```json
{ "error": { "name": "Not Found", "detail": "...", "statusCode": 404 } }
```

A 401 after a successful `auth status` usually means an expired token — `helpscout auth refresh`.

## Full command reference

Generated from the binary's own `--help`, so flags are exact. Read the one file matching the
task instead of guessing flags:

{{REFERENCE_INDEX}}
- global flags — `references/global-options.md`
