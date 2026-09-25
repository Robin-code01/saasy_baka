-- UK Contracts Finder open-tender database schema
--
-- Purpose
-- =======
-- This schema is a machine-readable, AI-friendly local representation of the
-- latest known state of UK Contracts Finder procurements. It is deliberately
-- source-first: raw OCDS JSON is retained alongside normalized fields.
--
-- Identity and lifecycle rules
-- ============================
-- * `ocid` is the stable Open Contracting Process Identifier. It identifies a
--   procurement, not a single publication or amendment.
-- * `notice_id` / `release_id` identify a particular published release.
-- * `procurement_state` remembers the newest release for every OCID encountered.
--   This matters when importing history newest-first: an older active release
--   must not make a tender reappear after a newer complete/cancelled release.
-- * `tenders` contains only procurements whose newest tender release has OCDS
--   status `active`. This is the canonical table for matching and recommendations.
-- * All dates are original OCDS ISO-8601 strings. Do not assume they are UTC;
--   normalize explicitly in analytical queries if needed.
-- * Monetary amounts are stated in `value_currency`; never aggregate values in
--   different currencies without an explicit exchange-rate policy.

PRAGMA foreign_keys = ON;

-- Latest lifecycle state for every OCID observed during import.
CREATE TABLE IF NOT EXISTS procurement_state (
    ocid TEXT PRIMARY KEY,
    latest_release_id TEXT NOT NULL,
    latest_release_date TEXT,
    latest_release_timestamp REAL NOT NULL,
    tender_status TEXT,
    updated_at TEXT NOT NULL
);

-- Canonical current opportunity table. One row = one currently open procurement.
CREATE TABLE IF NOT EXISTS tenders (
    ocid TEXT PRIMARY KEY,
    notice_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    buyer_name TEXT,
    buyer_id TEXT,
    published_date TEXT,
    closing_date TEXT,
    tender_status TEXT NOT NULL CHECK (tender_status = 'active'),
    procurement_method TEXT,
    procedure_type TEXT,
    value_amount REAL,
    value_currency TEXT,
    suitability_json TEXT NOT NULL,
    raw_ocds_json TEXT NOT NULL,
    source_url TEXT,
    imported_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- A tender may have several CPV classifications. Never store CPVs as a
-- comma-separated string: this table supports exact category matching.
CREATE TABLE IF NOT EXISTS tender_cpv_codes (
    ocid TEXT NOT NULL,
    scheme TEXT,
    code TEXT NOT NULL,
    description TEXT,
    PRIMARY KEY (ocid, code),
    FOREIGN KEY (ocid) REFERENCES tenders(ocid) ON DELETE CASCADE
);

-- Delivery geography. Values can be absent or only partly specified by a buyer.
CREATE TABLE IF NOT EXISTS tender_locations (
    id INTEGER PRIMARY KEY,
    ocid TEXT NOT NULL,
    country_name TEXT,
    region TEXT,
    locality TEXT,
    postal_code TEXT,
    FOREIGN KEY (ocid) REFERENCES tenders(ocid) ON DELETE CASCADE,
    UNIQUE(ocid, country_name, region, locality, postal_code)
);

-- Published document metadata and URLs. URLs are evidence links, not a guarantee
-- that the resource is downloadable or still live.
CREATE TABLE IF NOT EXISTS tender_documents (
    id INTEGER PRIMARY KEY,
    ocid TEXT NOT NULL,
    document_id TEXT,
    title TEXT,
    url TEXT NOT NULL,
    document_format TEXT,
    document_type TEXT,
    source_path TEXT,
    FOREIGN KEY (ocid) REFERENCES tenders(ocid) ON DELETE CASCADE,
    UNIQUE(ocid, url)
);

-- Resumable import checkpoint. `cursor_url` is opaque and must be followed
-- exactly as supplied by Contracts Finder. NULL cursor means a full pass ended.
CREATE TABLE IF NOT EXISTS sync_state (
    state_key TEXT PRIMARY KEY,
    cursor_url TEXT,
    last_completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenders_closing_date ON tenders(closing_date);
CREATE INDEX IF NOT EXISTS idx_tenders_buyer_name ON tenders(buyer_name);
CREATE INDEX IF NOT EXISTS idx_tenders_value ON tenders(value_amount);
CREATE INDEX IF NOT EXISTS idx_cpv_code ON tender_cpv_codes(code);
CREATE INDEX IF NOT EXISTS idx_locations_region ON tender_locations(region);

-- Recommended extension pattern for AI output (do not overwrite OCDS source data):
--
-- CREATE TABLE ai_tender_assessments (
--   id INTEGER PRIMARY KEY,
--   ocid TEXT NOT NULL REFERENCES tenders(ocid) ON DELETE CASCADE,
--   model_name TEXT NOT NULL,
--   prompt_version TEXT NOT NULL,
--   assessment_json TEXT NOT NULL,
--   confidence REAL,
--   created_at TEXT NOT NULL
-- );
