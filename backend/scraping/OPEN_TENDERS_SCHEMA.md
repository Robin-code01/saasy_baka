# Open tender database schema

This document describes `uk_open_tenders.db`, created by `script01.py`. It is
intended as a contract for people and AI systems that need to search, enrich,
rank, or build products on top of the tender data.

The executable DDL is in [open_tenders_schema.sql](open_tenders_schema.sql).

## Scope

The database ingests tender-stage OCDS releases from UK Contracts Finder. Its
main `tenders` table contains one current record per procurement whose newest
tender release has `tender.status = 'active'`.

It does not contain company data, AI recommendations, downloaded files, or
invented fields. Those belong in separate tables owned by the application that
uses this source database.

## Relationship map

```text
                 procurement_state
                        │
                        │  lifecycle state for every observed OCID
                        │
                        ▼
                 tenders (open only)
                  │       │       │
                  │       │       └──< tender_documents
                  │       └──────────< tender_locations
                  └──────────────────< tender_cpv_codes

                 sync_state
                 (import checkpoint; no foreign key)
```

`ocid` is the stable identifier for all relationships. Never join child tables
using `notice_id`: a procurement can have several published releases, but only
one OCID.

## Lifecycle behavior

The source feed includes amendments, awards, and completed notices. The crawler
processes releases newest-first and follows these rules:

1. It records the newest release timestamp per `ocid` in `procurement_state`.
2. An older release than the recorded timestamp is ignored as `stale`.
3. If the newest tender status is `active`, the normalized tender is upserted
   into `tenders` and its child tables are refreshed.
4. If the newest tender status is anything else, the canonical row is removed
   from `tenders`. `procurement_state` remains as a guard against historical
   active releases reappearing.

Therefore, use `tenders` directly for current opportunities. Do not try to
infer current status from raw historical data yourself.

## Tables and columns

### `procurement_state`

Lifecycle guard, one row per observed procurement. This table may include
closed procurements and is not a candidate list.

| Column | Type | Meaning |
|---|---|---|
| `ocid` | `TEXT`, PK | OCDS procurement/process identifier. |
| `latest_release_id` | `TEXT` | ID of newest release seen for this OCID. |
| `latest_release_date` | `TEXT` | Original release date as ISO-8601 text. |
| `latest_release_timestamp` | `REAL` | Parsed UTC epoch timestamp used solely for ordering. |
| `tender_status` | `TEXT` | Status on newest tender release; commonly `active`, `complete`, or `cancelled`. |
| `updated_at` | `TEXT` | UTC timestamp when crawler last updated this state. |

### `tenders`

The primary, matching-ready dataset. Every row is currently open at the latest
source release known to the crawler.

| Column | Type | Meaning and usage |
|---|---|---|
| `ocid` | `TEXT`, PK | Stable tender identity; use for all joins. |
| `notice_id` | `TEXT` | ID of the latest published OCDS release backing this row. |
| `title` | `TEXT` | Buyer-supplied tender title. Best short text for search/list views. |
| `description` | `TEXT` | Buyer-supplied tender description. Main input for semantic/LLM matching. Empty string means missing, not zero relevance. |
| `buyer_name` | `TEXT`, nullable | Contracting authority name. |
| `buyer_id` | `TEXT`, nullable | OCDS party identifier, if published. |
| `published_date` | `TEXT`, nullable | Latest release publication/edit date. |
| `closing_date` | `TEXT`, nullable | Tender submission deadline. Treat missing values as unknown. |
| `tender_status` | `TEXT` | Always `active` by schema constraint. |
| `procurement_method` | `TEXT`, nullable | OCDS procurement method, such as `open`. |
| `procedure_type` | `TEXT`, nullable | Buyer-provided procedure detail. |
| `value_amount` | `REAL`, nullable | Stated tender value; use only together with `value_currency`. |
| `value_currency` | `TEXT`, nullable | ISO currency code, normally `GBP`. |
| `suitability_json` | `TEXT` | Raw OCDS `tender.suitability` JSON object. Read with `json_extract`. |
| `raw_ocds_json` | `TEXT` | Complete newest source release. It is the authoritative fallback for fields not normalized here. |
| `source_url` | `TEXT`, nullable | Source-supplied URL, if present. |
| `imported_at` | `TEXT` | First time this active row was created. |
| `updated_at` | `TEXT` | Most recent time its canonical data was refreshed. |

### `tender_cpv_codes`

CPV (Common Procurement Vocabulary) classifications for structured capability
matching. A tender can have zero or more rows.

| Column | Type | Meaning |
|---|---|---|
| `ocid` | `TEXT`, FK | Parent tender. |
| `scheme` | `TEXT` | Usually `CPV`. |
| `code` | `TEXT` | CPV identifier. Treat as text; leading zeros must be preserved. |
| `description` | `TEXT` | Published category description. |

The primary key is `(ocid, code)`, so repeat classifications are deduplicated.

### `tender_locations`

Delivery addresses extracted from `tender.deliveryAddresses` and tender items.
Every field is nullable because public notices often provide partial geography.

| Column | Type | Meaning |
|---|---|---|
| `id` | `INTEGER`, PK | Surrogate row identifier. |
| `ocid` | `TEXT`, FK | Parent tender. |
| `country_name` | `TEXT` | Delivery country. |
| `region` | `TEXT` | Delivery region; useful for regional filters. |
| `locality` | `TEXT` | Delivery town/city. |
| `postal_code` | `TEXT` | Delivery postal code. |

### `tender_documents`

All OCDS `documents` arrays found anywhere in a release. This is metadata only;
no file download is implied.

| Column | Type | Meaning |
|---|---|---|
| `id` | `INTEGER`, PK | Surrogate row identifier. |
| `ocid` | `TEXT`, FK | Parent tender. |
| `document_id` | `TEXT` | Source document identifier, if supplied. |
| `title` | `TEXT` | Document label published by the buyer. |
| `url` | `TEXT` | Published resource URL. It can be a notice web page rather than a binary file. |
| `document_format` | `TEXT` | MIME type or buyer-supplied format, such as `application/pdf`. |
| `document_type` | `TEXT` | OCDS document type, if supplied. |
| `source_path` | `TEXT` | Location in source release, e.g. `tender.documents[0]`. |

The unique key `(ocid, url)` deduplicates links published in more than one OCDS
section.

### `sync_state`

One-row operational checkpoint table. It is not tender data.

| Column | Type | Meaning |
|---|---|---|
| `state_key` | `TEXT`, PK | Fixed importer identifier. |
| `cursor_url` | `TEXT`, nullable | Opaque next-page URL from Contracts Finder. Non-null means a crawl can resume. |
| `last_completed_at` | `TEXT`, nullable | UTC time of last fully completed historical crawl. |
| `updated_at` | `TEXT` | Time the checkpoint was last saved. |

Never edit or parse `cursor_url`; resume by running the importer again.

## Query recipes

### Current opportunities closing soon

```sql
SELECT ocid, title, buyer_name, closing_date, value_amount, value_currency
FROM tenders
WHERE closing_date IS NOT NULL
ORDER BY closing_date ASC;
```

### Find a CPV category in a region

```sql
SELECT DISTINCT t.ocid, t.title, t.buyer_name, t.closing_date
FROM tenders AS t
JOIN tender_cpv_codes AS cpv ON cpv.ocid = t.ocid
LEFT JOIN tender_locations AS location ON location.ocid = t.ocid
WHERE cpv.code = '72000000'
  AND location.region = 'South East'
ORDER BY t.closing_date ASC;
```

### Produce AI-ready source records

```sql
SELECT
  t.ocid,
  t.title,
  t.description,
  t.buyer_name,
  t.closing_date,
  t.value_amount,
  t.value_currency,
  t.raw_ocds_json
FROM tenders AS t
ORDER BY t.published_date DESC;
```

### Inspect crawl progress

```sql
SELECT
  CASE WHEN cursor_url IS NULL THEN 'complete' ELSE 'resume-ready' END AS crawl_state,
  last_completed_at,
  updated_at
FROM sync_state;
```

## Guidance for AI and application builders

- Use `tenders.description`, `title`, CPV rows, and locations as the matching
  inputs. Use `raw_ocds_json` only when a required field is not normalized.
- Preserve `ocid` in every derived record, embedding, evaluation, and user
  decision. It is the durable join key.
- Keep model outputs in a new table such as `ai_tender_assessments`; never
  overwrite source fields or `raw_ocds_json`.
- Store the model name, prompt/version, input snapshot/hash, confidence, and
  evaluation timestamp with every AI result. This makes recommendations
  reproducible and auditable.
- Treat nulls as **unknown**, not as negative evidence. Buyers omit many
  optional OCDS fields.
- Treat tender value as buyer-supplied information, not guaranteed revenue.
- Respect `closing_date`; any matching job should refresh a tender from this
  database immediately before presenting it as actionable.

## Safe future extensions

Create separate tables for company data, embeddings, saved searches, user
feedback, and AI assessments. A recommended AI-assessment table is included as
commented SQL in `open_tenders_schema.sql`. This separation keeps imported
government source data independently refreshable and prevents model output from
being mistaken for an official tender fact.
