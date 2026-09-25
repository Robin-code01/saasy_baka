"""Create a complete, local SQLite database of open UK Contracts Finder tenders.

The first run reads the full tender-stage OCDS history. It preserves a cursor,
so stopping it is safe: run the same command again to continue where it left
off. Once the first full pass completes, future runs fetch only newer releases.

Examples:
    python backend/scraping/script01.py
    python backend/scraping/script01.py --max-pages 10
    python backend/scraping/script01.py --restart --published-from 2026-01-01T00:00:00+00:00
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Iterator, Mapping, Optional

import requests
from requests import Response, Session


API_URL = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search"
# Contracts Finder starts throttling much sooner than a generic public API.
REQUEST_PAUSE_SECONDS = 3.1
RATE_LIMIT_STATUS_CODES = {403, 429}
TRANSIENT_STATUS_CODES = RATE_LIMIT_STATUS_CODES | {502, 503}
RATE_LIMIT_COOLDOWN_SECONDS = 300
MAX_RETRIES = 5
STATE_KEY = "contracts_finder_open_tenders"
LOG = logging.getLogger(__name__)


class ContractsFinderClient:
    """Rate-limited client for the public cursor-paginated OCDS feed."""

    def __init__(self) -> None:
        self.session: Session = requests.Session()
        self.session.headers.update({"User-Agent": "uk-open-tender-database/1.0"})
        self.last_request_at = 0.0

    def get(self, url: str, **kwargs: Any) -> Response:
        last_error: Optional[BaseException] = None
        for attempt in range(MAX_RETRIES):
            retry_delay: Optional[int] = None
            pause = REQUEST_PAUSE_SECONDS - (time.monotonic() - self.last_request_at)
            if pause > 0:
                time.sleep(pause)
            self.last_request_at = time.monotonic()
            try:
                response = self.session.get(url, timeout=(10, 90), **kwargs)
            except requests.RequestException as exc:
                last_error = exc
            else:
                if response.status_code not in TRANSIENT_STATUS_CODES:
                    try:
                        response.raise_for_status()
                    except requests.HTTPError:
                        response.close()
                        raise
                    return response
                retry_delay = self._retry_delay(response, attempt)
                last_error = requests.HTTPError(
                    f"Transient HTTP {response.status_code} for {url}", response=response
                )
                response.close()
            if attempt < MAX_RETRIES - 1:
                # Network and gateway failures receive normal exponential backoff.
                delay = retry_delay if retry_delay is not None else 2**attempt
                LOG.warning("Request failed (%s); retrying in %s seconds", last_error, delay)
                time.sleep(delay)
        assert last_error is not None
        raise last_error

    @staticmethod
    def _retry_delay(response: Response, attempt: int) -> int:
        """Respect Retry-After; Contracts Finder specifies a 5-minute cooldown."""
        if response.status_code not in RATE_LIMIT_STATUS_CODES:
            return 2**attempt
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return max(1, int(retry_after))
            except ValueError:
                try:
                    return max(1, int((parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)).total_seconds()))
                except (TypeError, ValueError):
                    pass
        return RATE_LIMIT_COOLDOWN_SECONDS

    def close(self) -> None:
        self.session.close()


class TenderDatabase:
    """Canonical current-open-tender database plus source and sync state."""

    def __init__(self, path: Path) -> None:
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self._create_schema()

    def _create_schema(self) -> None:
        self.connection.executescript(
            """
            -- Tracks the newest release per procurement, including procurements
            -- that are no longer open. This prevents an older active release
            -- from reappearing while a historical crawl moves backwards.
            CREATE TABLE IF NOT EXISTS procurement_state (
                ocid TEXT PRIMARY KEY,
                latest_release_id TEXT NOT NULL,
                latest_release_date TEXT,
                latest_release_timestamp REAL NOT NULL,
                tender_status TEXT,
                updated_at TEXT NOT NULL
            );

            -- This table contains only procurements whose latest tender release
            -- has OCDS status 'active'. It is the primary table for AI matching.
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

            CREATE TABLE IF NOT EXISTS tender_cpv_codes (
                ocid TEXT NOT NULL,
                scheme TEXT,
                code TEXT NOT NULL,
                description TEXT,
                PRIMARY KEY (ocid, code),
                FOREIGN KEY (ocid) REFERENCES tenders(ocid) ON DELETE CASCADE
            );

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

            -- URLs are retained for later research but files are not downloaded.
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
            """
        )
        self.connection.commit()

    def load_state(self) -> Optional[sqlite3.Row]:
        return self.connection.execute(
            "SELECT * FROM sync_state WHERE state_key = ?", (STATE_KEY,)
        ).fetchone()

    def save_state(self, cursor_url: Optional[str], complete: bool = False) -> None:
        completed_at = utc_now() if complete else None
        self.connection.execute(
            """
            INSERT INTO sync_state (state_key, cursor_url, last_completed_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(state_key) DO UPDATE SET
                cursor_url = excluded.cursor_url,
                last_completed_at = CASE
                    WHEN excluded.last_completed_at IS NOT NULL THEN excluded.last_completed_at
                    ELSE sync_state.last_completed_at
                END,
                updated_at = excluded.updated_at
            """,
            (STATE_KEY, cursor_url, completed_at, utc_now()),
        )
        self.connection.commit()

    def save_release(self, release: Mapping[str, Any]) -> str:
        """Store a release only when it is the newest known release for its OCID.

        Returns ``active``, ``closed``, or ``stale`` for progress reporting.
        """
        profile = normalize_release(release)
        if profile is None:
            return "invalid"
        ocid = profile["ocid"]
        release_timestamp = to_timestamp(profile["published_date"])
        existing = self.connection.execute(
            "SELECT latest_release_timestamp FROM procurement_state WHERE ocid = ?", (ocid,)
        ).fetchone()
        if existing and release_timestamp < existing["latest_release_timestamp"]:
            return "stale"

        with self.connection:
            self.connection.execute(
                """
                INSERT INTO procurement_state (
                    ocid, latest_release_id, latest_release_date, latest_release_timestamp,
                    tender_status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(ocid) DO UPDATE SET
                    latest_release_id = excluded.latest_release_id,
                    latest_release_date = excluded.latest_release_date,
                    latest_release_timestamp = excluded.latest_release_timestamp,
                    tender_status = excluded.tender_status,
                    updated_at = excluded.updated_at
                """,
                (
                    ocid, profile["notice_id"], profile["published_date"], release_timestamp,
                    profile["tender_status"], utc_now(),
                ),
            )
            if profile["tender_status"] != "active":
                self.connection.execute("DELETE FROM tenders WHERE ocid = ?", (ocid,))
                return "closed"
            self._upsert_open_tender(profile, release)
        return "active"

    def _upsert_open_tender(self, profile: Mapping[str, Any], release: Mapping[str, Any]) -> None:
        ocid = profile["ocid"]
        self.connection.execute(
            """
            INSERT INTO tenders (
                ocid, notice_id, title, description, buyer_name, buyer_id, published_date,
                closing_date, tender_status, procurement_method, procedure_type, value_amount,
                value_currency, suitability_json, raw_ocds_json, source_url, imported_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ocid) DO UPDATE SET
                notice_id = excluded.notice_id, title = excluded.title,
                description = excluded.description, buyer_name = excluded.buyer_name,
                buyer_id = excluded.buyer_id, published_date = excluded.published_date,
                closing_date = excluded.closing_date, tender_status = excluded.tender_status,
                procurement_method = excluded.procurement_method,
                procedure_type = excluded.procedure_type, value_amount = excluded.value_amount,
                value_currency = excluded.value_currency, suitability_json = excluded.suitability_json,
                raw_ocds_json = excluded.raw_ocds_json, source_url = excluded.source_url,
                updated_at = excluded.updated_at
            """,
            (
                ocid, profile["notice_id"], profile["title"], profile["description"],
                profile["buyer_name"], profile["buyer_id"], profile["published_date"],
                profile["closing_date"], "active", profile["procurement_method"],
                profile["procedure_type"], profile["value_amount"], profile["value_currency"],
                as_json(profile["suitability"]), as_json(release), profile["source_url"], utc_now(), utc_now(),
            ),
        )
        self.connection.execute("DELETE FROM tender_cpv_codes WHERE ocid = ?", (ocid,))
        self.connection.execute("DELETE FROM tender_locations WHERE ocid = ?", (ocid,))
        self.connection.execute("DELETE FROM tender_documents WHERE ocid = ?", (ocid,))
        self.connection.executemany(
            "INSERT INTO tender_cpv_codes (ocid, scheme, code, description) VALUES (?, ?, ?, ?)",
            [(ocid, item["scheme"], item["code"], item["description"]) for item in profile["cpv_codes"]],
        )
        self.connection.executemany(
            """
            INSERT OR IGNORE INTO tender_locations
                (ocid, country_name, region, locality, postal_code) VALUES (?, ?, ?, ?, ?)
            """,
            [(ocid, item["country_name"], item["region"], item["locality"], item["postal_code"])
             for item in profile["locations"]],
        )
        self.connection.executemany(
            """
            INSERT OR IGNORE INTO tender_documents
                (ocid, document_id, title, url, document_format, document_type, source_path)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [(ocid, item["document_id"], item["title"], item["url"], item["document_format"],
              item["document_type"], item["source_path"]) for item in profile["document_links"]],
        )

    def close(self) -> None:
        self.connection.close()


def as_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def text(value: Any) -> Optional[str]:
    return str(value) if value is not None else None


def mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def to_timestamp(value: Optional[str]) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def buyer_details(release: Mapping[str, Any]) -> tuple[Optional[str], Optional[str]]:
    buyer = mapping(release.get("buyer"))
    name, identifier = text(buyer.get("name")), text(buyer.get("id"))
    if name:
        return name, identifier
    for party in release.get("parties", []):
        party = mapping(party)
        roles = party.get("roles", [])
        if isinstance(roles, list) and "buyer" in roles:
            party_id = text(party.get("id"))
            return text(party.get("name")), party_id
    return None, None


def extract_cpv_codes(tender: Mapping[str, Any]) -> list[dict[str, Optional[str]]]:
    classifications: list[Mapping[str, Any]] = [mapping(tender.get("classification"))]
    classifications.extend(mapping(item) for item in tender.get("additionalClassifications", []))
    for item in tender.get("items", []):
        classifications.append(mapping(mapping(item).get("classification")))
    result: list[dict[str, Optional[str]]] = []
    seen: set[str] = set()
    for classification in classifications:
        code = text(classification.get("id"))
        if code and code not in seen:
            seen.add(code)
            result.append({"scheme": text(classification.get("scheme")), "code": code,
                           "description": text(classification.get("description"))})
    return result


def extract_locations(tender: Mapping[str, Any]) -> list[dict[str, Optional[str]]]:
    addresses: list[Mapping[str, Any]] = [mapping(item) for item in tender.get("deliveryAddresses", [])]
    for item in tender.get("items", []):
        addresses.extend(mapping(address) for address in mapping(item).get("deliveryAddresses", []))
    result: list[dict[str, Optional[str]]] = []
    seen: set[tuple[Optional[str], ...]] = set()
    for address in addresses:
        location = {key: text(address.get(key)) for key in ("countryName", "region", "locality", "postalCode")}
        location = {
            "country_name": location["countryName"], "region": location["region"],
            "locality": location["locality"], "postal_code": location["postalCode"],
        }
        identity = tuple(location.values())
        if any(identity) and identity not in seen:
            seen.add(identity)
            result.append(location)
    return result


def extract_document_links(release: Mapping[str, Any]) -> list[dict[str, Optional[str]]]:
    """Capture every advertised URL, regardless of where OCDS places it."""
    result: list[dict[str, Optional[str]]] = []
    seen: set[str] = set()

    def walk(value: Any, path: str) -> None:
        if isinstance(value, Mapping):
            for key, child in value.items():
                child_path = f"{path}.{key}" if path else str(key)
                if key == "documents" and isinstance(child, list):
                    for index, document in enumerate(child):
                        document = mapping(document)
                        url = text(document.get("url"))
                        if url and url not in seen:
                            seen.add(url)
                            result.append({
                                "document_id": text(document.get("id")), "title": text(document.get("title")),
                                "url": url, "document_format": text(document.get("format")),
                                "document_type": text(document.get("documentType")),
                                "source_path": f"{child_path}[{index}]",
                            })
                walk(child, child_path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f"{path}[{index}]")

    walk(release, "")
    return result


def normalize_release(release: Mapping[str, Any]) -> Optional[dict[str, Any]]:
    """Normalize a release, preserving any status so lifecycle changes are applied."""
    tender = mapping(release.get("tender"))
    ocid = text(release.get("ocid"))
    notice_id = text(release.get("id"))
    if not ocid or not notice_id:
        return None
    value = mapping(tender.get("value"))
    amount = value.get("amount")
    value_amount = float(amount) if isinstance(amount, (int, float)) else None
    period = mapping(tender.get("tenderPeriod"))
    buyer_name, buyer_id = buyer_details(release)
    links = mapping(release.get("links"))
    return {
        "ocid": ocid, "notice_id": notice_id, "title": text(tender.get("title")) or "Untitled tender",
        "description": text(tender.get("description")) or "", "buyer_name": buyer_name, "buyer_id": buyer_id,
        "published_date": text(release.get("date")), "closing_date": text(period.get("endDate")),
        "tender_status": text(tender.get("status")) or "unknown",
        "procurement_method": text(tender.get("procurementMethod")),
        "procedure_type": text(tender.get("procurementMethodDetails")),
        "value_amount": value_amount, "value_currency": text(value.get("currency")),
        "suitability": mapping(tender.get("suitability")), "cpv_codes": extract_cpv_codes(tender),
        "locations": extract_locations(tender), "document_links": extract_document_links(release),
        "source_url": text(links.get("self")) or text(release.get("url")),
    }


def starting_request(database: TenderDatabase, args: argparse.Namespace) -> tuple[str, Optional[dict[str, Any]]]:
    state = database.load_state()
    if not args.restart and state and state["cursor_url"]:
        LOG.info("Resuming a previous full import")
        return state["cursor_url"], None
    params: dict[str, Any] = {"stages": "tender", "limit": args.page_size}
    if args.published_from:
        params["publishedFrom"] = args.published_from
    elif state and state["last_completed_at"] and not args.restart:
        # Once history has been scanned, later syncs need only fetch newer changes.
        params["publishedFrom"] = state["last_completed_at"]
        LOG.info("Fetching changes published since %s", state["last_completed_at"])
    else:
        LOG.info("Starting a full tender-stage history import")
    return API_URL, params


def run(args: argparse.Namespace) -> None:
    database_path = Path(args.db_path).expanduser().resolve()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database = TenderDatabase(database_path)
    client = ContractsFinderClient()
    active = closed = stale = invalid = pages = 0
    try:
        next_url, params = starting_request(database, args)
        while next_url and (args.max_pages == 0 or pages < args.max_pages):
            pages += 1
            LOG.info("Fetching page %s%s", pages, " (unlimited import)" if args.max_pages == 0 else f"/{args.max_pages}")
            payload = client.get(next_url, params=params).json()
            params = None  # Subsequent calls use the API's opaque cursor URL.
            releases = payload.get("releases", []) if isinstance(payload, Mapping) else []
            if not isinstance(releases, list):
                raise ValueError("Contracts Finder response has a non-list releases field")
            for release in releases:
                if not isinstance(release, Mapping):
                    invalid += 1
                    continue
                result = database.save_release(release)
                if result == "active":
                    active += 1
                elif result == "closed":
                    closed += 1
                elif result == "stale":
                    stale += 1
                else:
                    invalid += 1
            links = mapping(payload.get("links")) if isinstance(payload, Mapping) else {}
            next_url = text(links.get("next"))
            database.save_state(next_url, complete=not next_url)
            LOG.info("Page %s: %s active, %s closed, %s older releases", pages, active, closed, stale)
        if next_url:
            LOG.info("Stopped at page limit. Run again to resume from the saved cursor.")
        else:
            LOG.info("Full import complete. Future runs fetch only releases since this sync.")
    finally:
        client.close()
        database.close()
    LOG.info("Finished: %s active updates, %s closures, %s stale, %s invalid", active, closed, stale, invalid)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-pages", type=int, default=0,
        help="Pages to fetch; 0 means no limit and builds the complete database (default: 0).",
    )
    parser.add_argument("--page-size", type=int, default=100, help="Releases per page, 1-100 (default: 100).")
    parser.add_argument("--db-path", default="./uk_open_tenders.db", help="SQLite database path.")
    parser.add_argument("--published-from", help="Optional ISO-8601 lower publication-date bound.")
    parser.add_argument("--restart", action="store_true", help="Start a fresh crawl instead of resuming a saved cursor.")
    args = parser.parse_args()
    if args.max_pages < 0 or not 1 <= args.page_size <= 100:
        parser.error("--max-pages must be 0 or greater and --page-size must be between 1 and 100")
    return args


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        run(parse_args())
    except KeyboardInterrupt:
        LOG.warning("Stopped safely. The saved cursor will be used when you run the importer again.")
