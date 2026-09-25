import json
import sqlite3
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from core.models import TenderAssessment
from core.views import _load_active_tenders, assess_active_tenders, assess_live_trial_tenders


class AssessActiveTendersTests(TestCase):
    """The source database is isolated so tests never write to the real crawl."""

    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        directory = Path(self.temporary_directory.name)
        self.tender_database_path = directory / "tenders.db"
        self.company_context_path = directory / "company.md"
        self.company_context_path.write_text("We build accessible software.", encoding="utf-8")
        self._create_tender_database()

        self.settings_override = override_settings(
            TENDER_DATABASE_PATH=self.tender_database_path,
            TENDER_COMPANY_CONTEXT_PATH=self.company_context_path,
            OPENAI_API_KEY="test-key",
            OPENAI_TENDER_MODEL="test-model",
            TENDER_ASSESSMENT_PROMPT="Score this tender.",
            TENDER_ASSESSMENT_PROMPT_VERSION="test-1",
        )
        self.settings_override.enable()
        self.user = get_user_model().objects.create_user("tender-tester", password="not-used")
        self.factory = APIRequestFactory()

    def tearDown(self):
        self.settings_override.disable()
        self.temporary_directory.cleanup()
        super().tearDown()

    def _create_tender_database(self):
        connection = sqlite3.connect(self.tender_database_path)
        connection.executescript(
            """
            CREATE TABLE tenders (
                ocid TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                buyer_name TEXT,
                buyer_id TEXT,
                published_date TEXT,
                closing_date TEXT,
                tender_status TEXT NOT NULL,
                procurement_method TEXT,
                procedure_type TEXT,
                value_amount REAL,
                value_currency TEXT,
                suitability_json TEXT NOT NULL,
                source_url TEXT,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE tender_cpv_codes (
                ocid TEXT, scheme TEXT, code TEXT, description TEXT
            );
            CREATE TABLE tender_locations (
                id INTEGER PRIMARY KEY, ocid TEXT, country_name TEXT, region TEXT,
                locality TEXT, postal_code TEXT
            );
            CREATE TABLE tender_documents (
                id INTEGER PRIMARY KEY, ocid TEXT, document_id TEXT, title TEXT,
                url TEXT, document_format TEXT, document_type TEXT
            );
            """
        )
        connection.executemany(
            """
            INSERT INTO tenders (
                ocid, title, description, tender_status, suitability_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "ocds-active",
                    "Accessible web platform",
                    "Build an accessible public-service website.",
                    "active",
                    "{}",
                    "2026-01-01T00:00:00+00:00",
                ),
                (
                    "ocds-inactive",
                    "Expired work",
                    "This must never be submitted to the AI.",
                    "complete",
                    "{}",
                    "2026-01-01T00:00:00+00:00",
                ),
            ],
        )
        connection.execute(
            """
            INSERT INTO tender_cpv_codes (ocid, scheme, code, description)
            VALUES ('ocds-active', 'CPV', '72000000', 'IT services')
            """
        )
        connection.commit()
        connection.close()

    def test_only_current_active_tenders_are_sent_and_saved_by_ocid(self):
        model_result = {
            "risk_rating": 18,
            "risks": "Delivery schedule is tight.",
            "fit_reasoning": "The accessibility capability is directly relevant.",
            "recommendation_rating": 91,
        }
        openai_client = Mock()
        openai_client.responses.create.return_value = SimpleNamespace(
            output_text=json.dumps(model_result)
        )
        request = self.factory.post("/api/tenders/assess-active/", {"limit": 10}, format="json")
        force_authenticate(request, user=self.user)

        with patch("core.views._get_openai_client", return_value=openai_client):
            response = assess_active_tenders(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["selected_active_tenders"], 1)
        self.assertEqual(response.data["assessed"], 1)
        self.assertEqual(set(response.data["assessments"]), {"ocds-active"})
        self.assertEqual(openai_client.responses.create.call_count, 1)

        sent_tender = json.loads(openai_client.responses.create.call_args.kwargs["input"])
        self.assertEqual(sent_tender["ocid"], "ocds-active")
        self.assertEqual(sent_tender["cpv_codes"][0]["code"], "72000000")

        saved_assessment = TenderAssessment.objects.get(ocid="ocds-active")
        self.assertEqual(saved_assessment.recommendation_rating, 91)
        self.assertEqual(TenderAssessment.objects.count(), 1)

    @override_settings(TENDER_ASSESSMENT_FAKE_MODE=True, OPENAI_API_KEY="")
    def test_fake_mode_runs_without_an_api_key_or_openai_mock(self):
        request = self.factory.post("/api/tenders/assess-active/", {"limit": 1}, format="json")
        force_authenticate(request, user=self.user)

        response = assess_active_tenders(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["assessed"], 1)
        self.assertEqual(response.data["assessments"]["ocds-active"]["risk_rating"], 50)
        self.assertEqual(
            TenderAssessment.objects.get(ocid="ocds-active").model_name, "local-fake"
        )

    @override_settings(TENDER_ASSESSMENT_FAKE_MODE=True, OPENAI_API_KEY="")
    def test_authenticated_session_request_does_not_require_a_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertTrue(client.login(username="tender-tester", password="not-used"))

        response = client.post("/api/tenders/assess-active/", {"limit": 1}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["assessed"], 1)

    @override_settings(TENDER_ASSESSMENT_FAKE_MODE=False)
    def test_live_trial_is_hard_capped_at_100_active_tenders(self):
        connection = sqlite3.connect(self.tender_database_path)
        connection.executemany(
            """
            INSERT INTO tenders (
                ocid, title, description, published_date, tender_status,
                suitability_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    f"ocds-trial-{index:03d}",
                    f"Newest tender {index}",
                    "A current test opportunity.",
                    f"2026-02-{(index % 28) + 1:02d}T00:00:00+00:00",
                    "active",
                    "{}",
                    "2026-02-28T00:00:00+00:00",
                )
                for index in range(101)
            ],
        )
        connection.commit()
        connection.close()

        model_result = {
            "risk_rating": 18,
            "risks": "Delivery schedule is tight.",
            "fit_reasoning": "The capability is directly relevant.",
            "recommendation_rating": 91,
        }
        openai_client = Mock()
        openai_client.responses.create.return_value = SimpleNamespace(
            output_text=json.dumps(model_result)
        )
        request = self.factory.post("/api/tenders/assess-live-trial/", {}, format="json")
        force_authenticate(request, user=self.user)

        with patch("core.views._get_openai_client", return_value=openai_client):
            response = assess_live_trial_tenders(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["selected_active_tenders"], 100)
        self.assertEqual(response.data["assessed"], 100)
        self.assertEqual(openai_client.responses.create.call_count, 100)

    @override_settings(TENDER_ASSESSMENT_FAKE_MODE=False)
    def test_live_trial_can_make_a_smaller_paid_test(self):
        model_result = {
            "risk_rating": 18,
            "risks": "Delivery schedule is tight.",
            "fit_reasoning": "The capability is directly relevant.",
            "recommendation_rating": 91,
        }
        openai_client = Mock()
        openai_client.responses.create.return_value = SimpleNamespace(
            output_text=json.dumps(model_result)
        )
        request = self.factory.post(
            "/api/tenders/assess-live-trial/", {"limit": 10}, format="json"
        )
        force_authenticate(request, user=self.user)

        with patch("core.views._get_openai_client", return_value=openai_client):
            response = assess_live_trial_tenders(request)

        # The fixture has one active tender, so it never falls back to an
        # historical inactive tender to fill the requested limit.
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["selected_active_tenders"], 1)
        self.assertEqual(response.data["assessed"], 1)
        self.assertEqual(openai_client.responses.create.call_count, 1)

    @override_settings(TENDER_ASSESSMENT_FAKE_MODE=False)
    def test_live_trial_rejects_limits_above_100(self):
        request = self.factory.post(
            "/api/tenders/assess-live-trial/", {"limit": 101}, format="json"
        )
        force_authenticate(request, user=self.user)

        response = assess_live_trial_tenders(request)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "limit must be an integer from 1 to 100")

    def test_active_tenders_are_ordered_by_latest_source_publication_date(self):
        connection = sqlite3.connect(self.tender_database_path)
        connection.row_factory = sqlite3.Row
        connection.executemany(
            """
            INSERT INTO tenders (
                ocid, title, description, published_date, tender_status,
                suitability_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "ocds-old-active",
                    "Older current tender",
                    "Older source release.",
                    "2026-01-01T00:00:00+00:00",
                    "active",
                    "{}",
                    "2026-01-01T00:00:00+00:00",
                ),
                (
                    "ocds-new-active",
                    "Newest current tender",
                    "Newest source release.",
                    "2026-02-01T00:00:00+00:00",
                    "active",
                    "{}",
                    "2026-02-01T00:00:00+00:00",
                ),
            ],
        )
        connection.commit()

        tenders = _load_active_tenders(connection, limit=1)
        connection.close()

        self.assertEqual(tenders[0]["ocid"], "ocds-new-active")

    @override_settings(TENDER_ASSESSMENT_FAKE_MODE=True)
    def test_live_trial_rejects_fake_mode(self):
        request = self.factory.post("/api/tenders/assess-live-trial/", {}, format="json")
        force_authenticate(request, user=self.user)

        response = assess_live_trial_tenders(request)

        self.assertEqual(response.status_code, 409)
