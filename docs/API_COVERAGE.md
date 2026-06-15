# Mailbox API — CLI Coverage Matrix

**Goal:** full Help Scout Mailbox API (Inbox API 2.0) coverage via the `helpscout` CLI.
**Last updated:** 2026-06-15. Endpoint groups verified against developer.helpscout.com.

Legend: ✅ covered · ◑ partial · ⬜ not yet · ⏸ parked (intentional)

## Conversations
- ✅ list, view (+`--v3`), create, update, delete
- Threads: ✅ list (+`--v3`), note, draft-reply, update-thread, **add-customer/chat/phone-thread**, **thread-source (+`--rfc822`)**
- Threads scheduling: ✅ **schedule-thread / publish-schedule / unschedule-thread**
- ✅ attachments: list, attachment-download (base64), attachment-upload, attachment-delete
- ⬜ **Download Attachment File** (streaming endpoint — the deferred "streaming attachments" item; base64 path works today)
- ✅ custom fields (fields/set-field), tags (add/remove), snooze/unsnooze

## Customers
- ✅ list (+`--v3` cursor), view, create, update, **overwrite**, delete, **delete-async**
- ✅ emails, phones, **chats, social-profiles, websites, address** (full CRUD each)
- ✅ **property-definitions** (list/create/delete) + **set-properties** (JSON Patch)

## Inboxes / Mailboxes
- ✅ list, view, fields, **folders**, **routing / update-routing**
- ✅ default-mailbox helpers (set/get/clear — CLI convenience, no API)

## Webhooks
- ✅ **list, view, create, update, delete** (payloadVersion V2/V3)

## System Users
- ✅ **list, view** (v3 API; the AI-agent actors behind `system_user`)

## Users
- ✅ list, view, me (resource owner)
- ⬜ **create, delete**
- ⏸ status: list / get / set (speculative rotation/coverage tooling)

## Teams / Tags / Workflows / Saved Replies / Reports
- ✅ teams: list, view, members
- ✅ tags: list, view
- ✅ workflows: list, run, activate, deactivate
- ✅ saved-replies: list, view, create, update, delete
- ◑ reports: company, conversations, productivity (overall), happiness (overall),
  ratings, first-response-time. ⬜ remaining drilldowns + user/channel reports
  (company drilldown/customers-helped; conversations volumes-by-channel/busiest/
  drilldown/new/received; docs overall; user/team reports; chat/email/phone reports)
  — large, Plus/Pro-only.

## Ratings
- ⬜ **Get Satisfaction Rating** (single rating by id; happiness ratings list exists)

## Organizations
- ⏸ entire group (list/get/create/update/delete + conversations/customers + property
  definitions) — B2C-shaped; no Rogue Amoeba use case identified.

---

## Remaining work (priority order)

1. **Users create/delete** + **Ratings get** — small, quick wins.
2. **Download Attachment File (streaming)** — the `STREAMING_ATTACHMENTS_PLAN.md` item.
3. **Reports expansion** — many endpoints; Plus/Pro; lower value. Batch if wanted.
4. **Organizations**, **User status** — parked; implement only on a concrete need.

## Notes
- All new client methods are covered by `src/lib/api-client.test.ts` (mock-fetch:
  asserts paths, versions, `_embedded` keys, request bodies).
- MCP tools were NOT added for the coverage batches (CLI was the goal). MCP parity for
  webhooks / system-users / customer sub-resources / threads is a follow-on, and would
  land in the registerTool idiom (see `REGISTERTOOL_MIGRATION_PLAN.md`).
- v3 endpoints (Get Conversation, List Threads, List Customers, System Users) route via
  the version-aware `request()` (`version: 'v3'`).
