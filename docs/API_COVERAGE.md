# Mailbox API — CLI Coverage Matrix

**Goal:** full Help Scout Mailbox API (Inbox API 2.0) coverage via the `helpscout` CLI.
**Last updated:** 2026-06-15. Endpoint groups verified against developer.helpscout.com.

Legend: ✅ covered · ◑ partial · ⬜ not yet · ⏸ parked (intentional)

## Conversations
- ✅ list, view (+`--v3`), create, update, delete
- Threads: ✅ list (+`--v3`), note, draft-reply, update-thread, **add-customer/chat/phone-thread**, **thread-source (+`--rfc822`)**
- Threads scheduling: ✅ **schedule-thread / publish-schedule / unschedule-thread**
- ✅ attachments: list, attachment-download (✅ now streams via `/file` with base64 fallback),
  attachment-upload, attachment-delete
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
- ✅ list, view, me (resource owner — confirmed == /users/me), **create, delete**
- ⏸ status: list / get / set (speculative rotation/coverage tooling — left for upstream)

## System Users
- ✅ list, view (v3)

## Ratings
- ✅ view (Get Satisfaction Rating, GET /v2/ratings/{id})

## Teams / Tags / Workflows / Saved Replies / Reports
- ✅ teams: list, view, members
- ✅ tags: list, view
- ✅ workflows: list, run, activate, deactivate
- ✅ saved-replies: list, view, create, update, delete
- ✅ reports — **full family coverage** (Plus/Pro). Company (overall, customers-helped,
  drilldown); Conversations (overall, volumes-by-channel, busiest, drilldown,
  fields-drilldown, new-conversations, new-conversations-drilldown, received-messages);
  Productivity (overall, first-response-time, replies-sent, resolution-time, resolved,
  response-time); Happiness (overall, ratings); Docs (overall — needs a Docs plan);
  User/Team (overall, conversation-history, customers-helped, drilldown, happiness,
  happiness-ratings, replies, resolutions, chat); Channel (chat, email, phone).

## Organizations
- ⏸ entire group (list/get/create/update/delete + conversations/customers + property
  definitions) — B2C-shaped; no Rogue Amoeba use case identified. Candidate to gauge
  upstream interest (issues-not-PRs) rather than build.

---

## Remaining (intentionally parked)

Full CLI coverage of the Mailbox API is now in place except:
1. **Organizations** — B2C-shaped; no RA use case. Leave for upstream.
2. **User status** (list/get/set) — speculative presence tooling. Leave for upstream.

Both are good candidates for an upstream "gauge interest" issue (Stephen builds from
issues) rather than fork work — see `UPSTREAM_ISSUES_PLAN.md`.

## Notes
- All new client methods are covered by `src/lib/api-client.test.ts` (mock-fetch:
  asserts paths, versions, `_embedded` keys, request bodies).
- MCP tools were NOT added for the coverage batches (CLI was the goal). MCP parity for
  webhooks / system-users / customer sub-resources / threads is a follow-on, and would
  land in the registerTool idiom (see `REGISTERTOOL_MIGRATION_PLAN.md`).
- v3 endpoints (Get Conversation, List Threads, List Customers, System Users) route via
  the version-aware `request()` (`version: 'v3'`).
