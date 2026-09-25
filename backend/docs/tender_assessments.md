# Tender assessment backend guide

## Purpose

`POST /api/tenders/assess-active/` evaluates the crawler's canonical SQLite
`tenders` table, selecting only rows where `tender_status = 'active'`. It never
uses `procurement_state` as a candidate list: that table holds historical
lifecycle records, including completed and cancelled tenders.

For each tender, the backend loads the company Markdown profile, obtains a
schema-valid assessment, validates it, and upserts it using the tender's OCID
as the primary key. Re-running an assessment updates the same OCID; it cannot
create a duplicate because a notice was amended or republished.

## Architecture and data ownership

| Component | Location | Purpose |
| --- | --- | --- |
| Tender source | `backend/scraping/uk_open_tenders.db` | Government-source catalogue; read as active tenders only. |
| Company profile | `backend/company_description_and_capabilities.md` | Markdown context supplied with each assessment. |
| Assessment storage | `backend/db.sqlite3`, `tender_assessments` | Application-owned latest result for every OCID. |
| Django model | `backend/core/models.py` | Ratings, narrative, model/prompt metadata, content hash, and timestamps. |
| Prompt | `backend/core/prompts.py` | Versioned UK public-sector bid/no-bid instructions. |
| Standard endpoint | `POST /api/tenders/assess-active/` | Authenticated endpoint that performs an assessment. |
| Live trial endpoint | `POST /api/tenders/assess-live-trial/` | Hard-capped real-API assessment of the newest 100 active tenders. |

The assessment table uses OCID as its primary key. It has no cross-database
foreign key because Django's app database and the crawler database are separate.

## First-time setup

From the `saasy_baka` directory:

```bash
python -m pip install -r requirements.txt
cd backend
python manage.py migrate
```

The migration creates the `tender_assessments` table. If the migration has not
run, the endpoint returns a `503` explaining that `python manage.py migrate` is
required instead of silently losing assessment results.

## Configuration

The backend automatically reads `backend/.env` via `django-environ`. It is
ignored by Git. A blank local file and a tracked `.env.example` are supplied.

```dotenv
# Required only for live OpenAI assessments.
OPENAI_API_KEY=replace-with-your-real-key
OPENAI_TENDER_MODEL=gpt-4o-mini

# Increase this whenever the prompt or assessment policy materially changes.
TENDER_ASSESSMENT_PROMPT_VERSION=2026-09-26

# Keep false in real environments. See local fake mode below.
TENDER_ASSESSMENT_FAKE_MODE=false

# Optional location overrides.
# TENDER_DATABASE_PATH=/absolute/path/to/uk_open_tenders.db
# TENDER_COMPANY_CONTEXT_PATH=/absolute/path/to/company_profile.md
```

Never commit an API key or put it in the company Markdown profile. Restart the
Django server after changing `.env`.

## Company profile

Replace the template in `backend/company_description_and_capabilities.md` with
the approved company description. Good profile content covers relevant
capabilities, technical stack, delivery geography, team capacity,
certifications, sectors, constraints, and evidence of relevant experience.

The complete file is sent with every tender assessment. Its SHA-256 hash is
stored beside the result so that you can compare inputs without duplicating the
company profile in the database. Do not include credentials or confidential
information that must not be sent to the assessment provider.

## Test without an API key

There are two no-cost test options. Neither contacts OpenAI.

### Automated tests

Run from `backend`:

```bash
python manage.py test core
```

The tests create an isolated temporary tender database and mock the model
response. They verify that inactive tenders are excluded, OCIDs are retained,
ratings are validated, and the Django model persists the assessment.

### Manual end-to-end fake mode

Set the following in `backend/.env`:

```dotenv
OPENAI_API_KEY=
TENDER_ASSESSMENT_FAKE_MODE=true
```

Then run:

```bash
cd backend
python manage.py migrate
python manage.py runserver
```

Fake mode never imports the OpenAI client or makes a network request. It returns
a deterministic, schema-valid assessment with both scores set to `50` and text
that says no AI analysis occurred. Results are stored as `model_name =
"local-fake"`, which makes them easy to identify and remove later.

Use a small limit in fake mode. Do not use fake results to make bid decisions.
Set `TENDER_ASSESSMENT_FAKE_MODE=false` before a live run.

## Calling the endpoint

The endpoint requires an authenticated Django session. For local development,
register an account and retain the login cookie:

```bash
curl -X POST http://127.0.0.1:8000/api/register/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester","password":"choose-a-password"}'

curl -c cookies.txt -X POST http://127.0.0.1:8000/api/login/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"tester","password":"choose-a-password"}'
```

Run one active tender:

```bash
curl -b cookies.txt -X POST http://127.0.0.1:8000/api/tenders/assess-active/ \
  -H 'Content-Type: application/json' \
  -d '{"limit": 1}'
```

This testing environment disables Django's CSRF middleware and REST API session
CSRF enforcement, so no `X-CSRFToken` header is required for these requests.
Do not carry this configuration into a production deployment.

`limit` must be a positive integer. Omitting it selects every active tender.
The response is keyed by OCID:

```json
{
  "selected_active_tenders": 1,
  "assessed": 1,
  "failed": 0,
  "skipped_closed_during_run": 0,
  "assessments": {
    "ocds-example": {
      "risk_rating": 50,
      "risks": "...",
      "fit_reasoning": "...",
      "recommendation_rating": 50
    }
  },
  "failures": {}
}
```

If a crawler closes a tender after the initial query, the endpoint checks the
OCID immediately before submission and skips that tender.

## Live OpenAI mode

Set `TENDER_ASSESSMENT_FAKE_MODE=false`, provide `OPENAI_API_KEY`, restart the
server, and begin with `{"limit": 1}`. The endpoint makes one model request
per tender so every result has a single unambiguous OCID owner and a catalogue
does not have to fit in one model context.

The request uses the Responses API with a strict JSON Schema. The backend also
checks both scores are integers in the 1–100 range and both explanation fields
are text before storing the result. This follows the intended use of Structured
Outputs, which constrains the response to the supplied schema; see the
[official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

### Capped live trial: newest 100 active tenders

For the first real business test, set a valid `OPENAI_API_KEY` and ensure this
is in `backend/.env`:

```dotenv
TENDER_ASSESSMENT_FAKE_MODE=false
```

Restart the server after saving `.env`. This optional preflight confirms that
the installed SDK can construct a client from the configuration; it does not
send a tender or make an API request:

```bash
python manage.py shell -c "from core.views import _get_openai_client; _get_openai_client(); print('OpenAI client configured')"
```

Then call the dedicated trial endpoint. It defaults to 100, but use a smaller
positive integer to make a paid test before the full run:

```bash
curl -b cookies.txt -X POST \
  http://127.0.0.1:8000/api/tenders/assess-live-trial/ \
  -H 'Content-Type: application/json' \
  -d '{"limit": 10}'
```

The limit must be an integer from 1 to 100; omitting it selects 100. This
endpoint cannot be configured to exceed 100 tenders. It queries only canonical
rows where `tender_status = 'active'`, orders them by
the latest source `published_date` descending (with missing dates last), and
then sends one tender per OpenAI request. If fewer than 100 current active rows
exist, it stops naturally after the available number. It rejects fake mode with
HTTP 409, so a successful trial always uses the configured OpenAI API key.

Expect the request to remain open while up to 100 sequential assessments run.
The response's `selected_active_tenders` is the number selected (at most 100),
and `assessed`, `failed` and the OCID-keyed `failures` map show the outcome of
each request. Repeating the same trial updates the existing assessment for each
OCID instead of creating duplicates.

The endpoint upserts each returned result into `tender_assessments` by OCID.
The OpenAI API can enforce request and token rate limits, so allow time for up
to 100 sequential calls and inspect the returned `failures` map before relying
on the results. [OpenAI rate-limit guidance](https://developers.openai.com/api/docs/guides/rate-limits)

## Prompt and audit fields

The default prompt in `core/prompts.py` assesses capability alignment,
qualification and delivery risk, uncertainty, and bid effort using only the
provided evidence. It tells the model to treat missing data as unknown and not
invent qualifications, capacity, pricing, or tender facts.

Each `tender_assessments` record contains:

| Field | Meaning |
| --- | --- |
| `ocid` | Primary key and durable tender identity. |
| `risk_rating`, `risks` | Bid/delivery risk score and evidence. |
| `recommendation_rating`, `fit_reasoning` | Pursuit score and rationale. |
| `assessment_json` | Validated machine response. |
| `model_name`, `prompt_version` | Configuration used for the run. |
| `company_context_sha256` | Hash of the company Markdown input. |
| `tender_updated_at`, `created_at`, `assessed_at` | Source and assessment timing. |

Update `TENDER_ASSESSMENT_PROMPT_VERSION` whenever you materially change the
prompt. `TENDER_ASSESSMENT_PROMPT` can override the prompt through the
environment, but update the version label at the same time.

## Operational guidance

- Start with `{"limit": 1}` in fake mode and then live mode.
- Omitting `limit` can produce tens of thousands of sequential model calls and
  a long HTTP request. Use a background-job or batch design before attempting
  the whole catalogue in production.
- A successful rerun updates the existing OCID row; it does not duplicate it.
- Inspect stored records in Django admin at `/admin/` after creating an admin
  account with `python manage.py createsuperuser`.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `OPENAI_API_KEY is not configured` | Add the key to `backend/.env`, or enable fake mode for a no-key test, then restart Django. |
| `AuthenticationError` / `401 invalid_api_key` | The configured key is invalid, revoked or incorrectly copied. Create or select an active project API key in OpenAI, replace the single `OPENAI_API_KEY=` value without spaces, and restart Django. Reducing the tender limit cannot resolve an authentication failure. |
| `Assessment storage is unavailable` | Run `python manage.py migrate` from `backend`. |
| Company Markdown cannot be read | Correct `TENDER_COMPANY_CONTEXT_PATH` or restore the default profile file. |
| `selected_active_tenders: 0` | The source contains no current active rows. Do not use historical lifecycle data to compensate. |
| `failed` contains an OCID | Retry a small run after reviewing the source data and supplied error. |
