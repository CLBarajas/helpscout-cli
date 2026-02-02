# Help Scout Docs API - Comprehensive Summary

**Research Date:** 2026-01-19
**API Version:** v1
**Base URL:** `https://docsapi.helpscout.net/v1/`

---

## Overview

The Help Scout Docs API provides programmatic access to manage knowledge base content including articles, categories, collections, assets, and redirects. It's a RESTful API that uses HTTP Basic Authentication and returns JSON responses.

---

## Authentication

- **Method:** HTTP Basic Authentication over HTTPS only
- **Credentials:** API key as username, any value (e.g., "X") as password
- **API Key Location:** Help Scout dashboard under Your Profile > API Keys

```bash
# Example with curl
curl -u "YOUR_API_KEY:X" https://docsapi.helpscout.net/v1/collections
```

---

## Rate Limits

Limits are based on the number of Docs Sites in the account:

| Sites | Requests per 10 minutes |
|-------|------------------------|
| 1 | 2,000 |
| 2 | 3,000 |
| 3+ | 4,000 |

**Response Headers:**
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Requests remaining in current window
- `X-RateLimit-Reset` - Unix timestamp when limit resets

**Rate Limit Exceeded:** Returns HTTP 429

---

## Data Hierarchy

```
Site
  └── Collection (visibility: public/private)
        └── Category (order, defaultSort)
              └── Article (status: published/notpublished)
```

---

## What Can Be Synced TO Help Scout Docs

### Articles (Full CRUD)

**Create Article:** `POST /v1/articles`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `collectionId` | String | Yes | Target collection |
| `name` | String | Yes | Must be unique within collection |
| `text` | String | Yes | Plain text or HTML |
| `status` | String | No | `published` or `notpublished` (default: unpublished) |
| `slug` | String | No | Auto-generated from name if omitted |
| `categories` | Array | No | Category IDs; omit for "Uncategorized" |
| `related` | Array | No | Related article IDs |
| `keywords` | Array | No | Search keywords/metadata |

**Update Article:** `PUT /v1/articles/{id}`
- Supports partial updates (only include fields to change)
- Omitting `categories`, `related`, or `keywords` preserves existing values
- Set to `null` to clear these arrays
- Publishing or editing published content auto-deletes any draft

**Delete Article:** `DELETE /v1/articles/{id}`
- Permanent deletion (no soft-delete documented)
- No recovery mechanism documented

### Drafts

**Save/Update Draft:** `PUT /v1/articles/{id}/drafts`
- Creates draft if none exists, updates if one does
- Only `text` field supported
- Draft is separate from published version
- Publishing the article deletes the draft

### Categories (Full CRUD)

**Create Category:** `POST /v1/categories`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `collectionId` | String | Yes | Parent collection |
| `name` | String | Yes | Must be unique within collection |
| `slug` | String | No | SEO-friendly URL |
| `visibility` | String | No | `public` or `private` |
| `order` | Integer | No | Display sequence |
| `defaultSort` | String | No | `popularity` or `name` |

**Update Category:** `PUT /v1/categories/{id}`
- All fields except `collectionId` can be updated

**Delete Category:** `DELETE /v1/categories/{id}`

### Collections (Full CRUD)

**Create Collection:** `POST /v1/collections`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `siteId` | String | Yes | Parent site |
| `name` | String | Yes | Must be unique in account |
| `visibility` | String | No | `public` or `private` |
| `order` | Integer | No | Display sequence |
| `description` | String | No | Max 45 characters |

**Update Collection:** `PUT /v1/collections/{id}`
- Can move to different site via `siteId`
- All fields updatable

**Delete Collection:** `DELETE /v1/collections/{id}`

### Assets (Images/Files)

**Upload Article Asset:** `POST /v1/assets/article`
- Content-Type: `multipart/form-data`
- Required: `key` (API key), `articleId`, `assetType`, `file`
- `assetType`: `image` (inline) or `attachment` (downloadable)
- Returns S3 URL, filename, and dimensions

**Upload Settings Asset:** `POST /v1/assets/settings`
- For site-wide branding
- `assetType`: `logo`, `favicon`, or `touchicon`

**Limitations:**
- No documented file size limits
- No documented format restrictions
- Assets are hosted on AWS S3

### Redirects

**Create Redirect:** `POST /v1/redirects`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `siteId` | String | Yes | Target site |
| `urlMapping` | String | Yes | Source path (query params ignored) |
| `redirect` | String | Yes | Full destination URL |

**Update Redirect:** `PUT /v1/redirects/{id}`

**Delete Redirect:** `DELETE /v1/redirects/{id}`

### View Counts

**Update View Count:** `PUT /v1/articles/{id}/views`
- `count` parameter (default: 1) - increment amount
- Used for popularity calculations
- Best practice: batch/cache views locally, update periodically

---

## What Can Be Pulled FROM Help Scout Docs

### Articles

**List Articles:**
- `GET /v1/collections/{id}/articles`
- `GET /v1/categories/{id}/articles`

| Parameter | Default | Options |
|-----------|---------|---------|
| `page` | 1 | Any positive integer |
| `pageSize` | 50 | Max: 100 |
| `status` | all | `all`, `published`, `notpublished` |
| `sort` | order | `number`, `status`, `name`, `popularity`, `createdAt`, `updatedAt` |
| `order` | desc | `asc`, `desc` |

**Response Fields (ArticleRef):**
- `id`, `number`, `collectionId`
- `status`, `hasDraft`, `name`
- `publicUrl`, `popularity`, `viewCount`
- `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `lastPublishedAt`

**Get Single Article:** `GET /v1/articles/{id}` or `GET /v1/articles/{number}`
- `draft=true` parameter returns draft version if exists

**Full Article Response:**
- All ArticleRef fields plus:
- `slug`, `text` (full HTML/content), `categoryIds`, `related`

### Search

**Search Articles:** `GET /v1/search/articles?query={query}`

| Parameter | Required | Notes |
|-----------|----------|-------|
| `query` | Yes | Search term |
| `collectionId` | No | Filter by collection |
| `siteId` | No | Filter by site |
| `status` | No | `all`, `published`, `notpublished` |
| `visibility` | No | `all`, `public`, `private` |

**Response includes:**
- `preview` - Article excerpt
- `url` - Full article URL
- `docsUrl` - Relative documentation path

### Categories

**List Categories:** `GET /v1/collections/{id}/categories`
- Sortable by: `number`, `name`, `articleCount`, `createdAt`, `updatedAt`

**Get Category:** `GET /v1/categories/{id}`

### Collections

**List Collections:** `GET /v1/collections`
- Filterable by `siteId`, `visibility`
- Sortable by: `number`, `visibility`, `order`, `name`, `createdAt`, `updatedAt`

**Get Collection:** `GET /v1/collections/{id}`

**Response Fields:**
- `id`, `siteId`, `number`, `slug`, `name`, `description`
- `visibility`, `order`, `publicUrl`
- `articleCount`, `publishedArticleCount`
- Audit fields (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`)

### Sites

**List Sites:** `GET /v1/sites`

**Get Site:** `GET /v1/sites/{id}`

**Site Configuration Fields:**
- Identity: `id`, `status`, `subDomain`, `cname`
- Branding: `companyName`, `title`, `logoUrl`, `logoWidth`, `logoHeight`, `favIconUrl`, `touchIconUrl`
- Navigation: `homeUrl`, `homeLinkText`
- Styling: `bgColor`, `styleSheetUrl`, `headerCode`
- Contact: `mailboxId`, `contactEmail`, `hasContactForm`
- Metadata: `hasPublicSite`, `createdAt`, `updatedAt`

### Redirects

**List Redirects:** `GET /v1/redirects/site/{siteId}`

**Get Redirect:** `GET /v1/redirects/{id}`

---

## Limitations and Gotchas

### No Webhook Support for Docs

**Critical:** Help Scout webhooks only support Mailbox/conversation events, NOT Docs events. There are no webhooks for:
- Article created/updated/published
- Category changes
- Collection changes

**Workaround:** Poll the API periodically to detect changes using `updatedAt` timestamps.

### Article Constraints

1. **Article names must be unique within a collection** - Duplicates will fail
2. **Slugs cannot be used to retrieve articles** - Use ID or number only
3. **The "Uncategorized" category is automatic** - Cannot be manually assigned
4. **Publishing deletes drafts** - No way to preserve draft after publish
5. **No revision history via API** - Revisions endpoint returned 404 (may be deprecated or undocumented)

### URL and Slug Behavior

- Query parameters are stripped from `urlMapping` in redirects
- Slugs are auto-generated from name if not provided
- Slugs are for SEO/URLs only, not for API lookups

### Asset Handling

- No documented file size limits
- No documented format restrictions
- Assets are stored on AWS S3 with Help Scout-managed URLs
- Asset URLs are permanent (no expiration documented)
- Cannot delete assets via API

### Pagination

- Default page size: 50 items
- Maximum page size: 100 items
- No cursor-based pagination (offset-based only)
- Large datasets require multiple requests

### Update Behavior

- Partial updates supported for articles, categories, collections
- Array fields (`categories`, `related`, `keywords`):
  - Omit to preserve existing values
  - Set to `null` to clear
  - Set to new array to replace

### View Count Tracking

- `GET /v1/articles/{id}` does NOT increment view count
- Must explicitly call `PUT /v1/articles/{id}/views`
- Best practice: batch view counts locally, update periodically

---

## Bulk Operations Considerations

### Rate Limit Strategy

With 2,000-4,000 requests per 10 minutes:

| Operation | Requests | Max per 10 min |
|-----------|----------|----------------|
| Sync 100 articles | 100-200 | ~10-20 syncs |
| Full KB export | 3-5 per collection + 1 per article | Variable |
| Asset upload | 1 per asset | 2,000-4,000 |

### Recommended Sync Patterns

**Initial Import:**
1. Create collections first
2. Create categories per collection
3. Create articles (can set status to `notpublished` for review)
4. Upload assets and update article text with asset URLs
5. Publish articles

**Incremental Sync:**
1. List articles with `sort=updatedAt&order=desc`
2. Compare `updatedAt` timestamps with local cache
3. Fetch and update only changed articles
4. Use `reload=true` parameter to get updated entity in response

**Export:**
1. List all collections
2. For each collection, list categories and articles
3. For each article, fetch full content with `GET /v1/articles/{id}`
4. Store locally with all metadata

### Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| 200 | Success | Continue |
| 201 | Created | Extract Location header |
| 400 | Bad Request | Check required fields |
| 401 | Unauthorized | Check API key |
| 404 | Not Found | Check ID/number |
| 429 | Rate Limited | Wait and retry |
| 500 | Server Error | Retry with backoff |

---

## API Response Examples

### Article Object (Full)

```json
{
  "id": "abc123",
  "number": 456,
  "collectionId": "col123",
  "slug": "getting-started",
  "name": "Getting Started Guide",
  "text": "<p>Article content in HTML...</p>",
  "status": "published",
  "hasDraft": false,
  "categoryIds": ["cat1", "cat2"],
  "related": ["art1", "art2"],
  "keywords": ["setup", "beginner"],
  "publicUrl": "https://docs.example.com/article/456-getting-started",
  "popularity": 85.5,
  "viewCount": 1234,
  "createdBy": 12345,
  "updatedBy": 12345,
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-18T14:22:00Z",
  "lastPublishedAt": "2025-01-18T14:22:00Z"
}
```

### Search Result Object

```json
{
  "id": "abc123",
  "collectionId": "col123",
  "categoryIds": ["cat1"],
  "slug": "getting-started",
  "name": "Getting Started Guide",
  "preview": "This guide will help you get started with...",
  "url": "https://docs.example.com/article/456-getting-started",
  "docsUrl": "/article/456-getting-started",
  "number": 456,
  "status": "published",
  "visibility": "public"
}
```

---

## Use Cases and Recommendations

### KB Sync from External Source (e.g., Git)

**Strategy:** One-way sync from external source to Help Scout

1. Store article metadata in local JSON/YAML alongside content
2. Map local file structure to collections/categories
3. On sync:
   - Compare local hash/timestamp with Help Scout `updatedAt`
   - Create/update only changed articles
   - Use `slug` for human-readable URLs
   - Set `status=notpublished` for draft workflow

**Limitations:**
- No webhook to trigger reverse sync
- Must poll for external changes to Help Scout (manual edits)
- Asset URLs must be Help Scout S3 URLs (upload first)

### Multi-Product Documentation

**Strategy:** One collection per product

1. Create collection per product with descriptive name
2. Use categories for major sections (Getting Started, Features, Troubleshooting)
3. Use `related` articles for cross-product links
4. Use `keywords` for improved search across products

### Content Migration

**Strategy:** Bulk import with validation

1. Export existing content to intermediate format
2. Transform to match Help Scout structure
3. Create collections/categories first
4. Import articles in batches (respect rate limits)
5. Upload assets and update article references
6. Validate with search queries
7. Set `status=published` when ready

---

## Sources

- [Help Scout Docs API Overview](https://developer.helpscout.com/docs-api/)
- [Help Scout Webhooks](https://developer.helpscout.com/webhooks/)
- [Help Scout Product Updates](https://updates.helpscout.com/)
- [Help Scout Support - Docs API](https://docs.helpscout.com/article/1141-docs-api)
