# saasy_baka

## Active tender assessments

`POST /api/tenders/assess-active/` assesses the crawler's canonical
`scraping/uk_open_tenders.db` `tenders` rows where `tender_status = 'active'`.
It never queries historical releases from `procurement_state`.

Full setup, no-key testing, API, data model, and production guidance are in
[the tender assessment guide](backend/docs/tender_assessments.md).

Copy `backend/.env.example` to `backend/.env`, then set `OPENAI_API_KEY` there.
Replace the dummy `backend/company_description_and_capabilities.md` content (or
set `TENDER_COMPANY_CONTEXT_PATH`) before a production run. The backend loads
the `.env` file automatically and includes a versioned bid/no-bid prompt.

After installing the Python requirements, apply the assessment model migration:

```bash
cd backend
python manage.py migrate
```

The optional JSON request body `{"limit": 10}` is useful for a small trial;
omitting it assesses all active tenders. Results are upserted to Django's
`tender_assessments` table with `ocid` as its primary key and returned as an
OCID-keyed JSON object.
