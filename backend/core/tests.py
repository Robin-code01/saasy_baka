from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.db import OperationalError
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import CompanyProfile


class BusinessProfileTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("profile-user", password="not-used")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_get_returns_an_empty_profile_for_a_new_user(self):
        response = self.client.get("/api/profile/business-info/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"raw_information": "", "markdown_context": ""},
        )

    @patch("core.views._get_openai_client")
    def test_generate_creates_the_profile_and_it_can_be_fetched(self, get_openai_client):
        get_openai_client.return_value = Mock(
            chat=Mock(
                completions=Mock(
                    create=Mock(
                        return_value=SimpleNamespace(
                            choices=[
                                SimpleNamespace(
                                    message=SimpleNamespace(content="# Acme capabilities")
                                )
                            ]
                        )
                    )
                )
            )
        )

        response = self.client.post(
            "/api/profile/business-info/generate/",
            {"raw_information": "We make reliable widgets."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["markdown_context"], "# Acme capabilities")
        self.assertEqual(
            CompanyProfile.objects.get(user=self.user).raw_information,
            "We make reliable widgets.",
        )

        fetched_profile = self.client.get("/api/profile/business-info/")
        self.assertEqual(fetched_profile.status_code, 200)
        self.assertEqual(fetched_profile.json()["markdown_context"], "# Acme capabilities")

    @patch("core.views._get_openai_client")
    def test_generate_returns_a_safe_gateway_error_when_ai_fails(self, get_openai_client):
        client = Mock()
        client.chat.completions.create.side_effect = RuntimeError("provider details")
        get_openai_client.return_value = client

        response = self.client.post(
            "/api/profile/business-info/generate/",
            {"raw_information": "We make reliable widgets."},
            format="json",
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json()["error"],
            "Business profile generation is temporarily unavailable. Please try again.",
        )

    @patch("core.views._get_openai_client")
    @patch("core.views.CompanyProfile.objects.exists", side_effect=OperationalError)
    def test_generate_checks_profile_storage_before_calling_ai(
        self, profile_storage_exists, get_openai_client
    ):
        response = self.client.post(
            "/api/profile/business-info/generate/",
            {"raw_information": "We make reliable widgets."},
            format="json",
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json()["error"],
            "Profile storage is unavailable. Run: python manage.py migrate",
        )
        get_openai_client.assert_not_called()

# Create your tests here.
