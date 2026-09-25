"""HTTP views for the application.

The tender matcher deliberately talks to the crawler's SQLite database rather
than Django's authentication database.  The crawler maintains ``tenders`` as
the canonical set of opportunities whose latest release is active; historical
releases live only in ``procurement_state`` and must never be matched.
"""

import hashlib
import json
import os
import sqlite3
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured
from django.db import OperationalError, ProgrammingError

from django.contrib.auth import authenticate, login, logout
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from .models import TenderAssessment


TENDER_ASSESSMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "risk_rating": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "description": "Risk rating, where 1 is lowest risk and 100 is highest risk.",
        },
        "risks": {
            "type": "string",
            "description": "Plain-text explanation of the identified risks.",
        },
        "fit_reasoning": {
            "type": "string",
            "description": "Why this tender is or is not a good fit for the company.",
        },
        "recommendation_rating": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "description": "How strongly the company should pursue the tender, from 1 to 100.",
        },
    },
    "required": ["risk_rating", "risks", "fit_reasoning", "recommendation_rating"],
    "additionalProperties": False,
}

LIVE_TRIAL_TENDER_LIMIT = 100


class _LocalFakeResponses:
    """Schema-valid stand-in for exercising the endpoint without OpenAI."""

    def create(self, **kwargs: Any) -> SimpleNamespace:
        tender = json.loads(kwargs["input"])
        title = tender.get("title") or "this tender"
        return SimpleNamespace(
            output_text=json.dumps(
                {
                    "risk_rating": 50,
                    "risks": (
                        "Local fake mode: no AI analysis was performed, so real tender risks "
                        "have not been evaluated."
                    ),
                    "fit_reasoning": (
                        f"Local fake mode returned a test assessment for {title}. "
                        "Replace it with a live assessment before making a bid decision."
                    ),
                    "recommendation_rating": 50,
                }
            )
        )


class _LocalFakeOpenAIClient:
    """Matches the small part of the OpenAI client interface used by this view."""

    responses = _LocalFakeResponses()


def _assessment_model_name() -> str:
    return "local-fake" if settings.TENDER_ASSESSMENT_FAKE_MODE else settings.OPENAI_TENDER_MODEL


def _configured_path(setting_name: str) -> Path:
    """Return a configured path, resolving relative values from ``BASE_DIR``."""
    value = Path(getattr(settings, setting_name))
    return value if value.is_absolute() else Path(settings.BASE_DIR) / value


def _open_tender_database() -> sqlite3.Connection:
    database_path = _configured_path("TENDER_DATABASE_PATH")
    if not database_path.is_file():
        raise ImproperlyConfigured(f"Tender database does not exist: {database_path}")

    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    # This keeps AI assessments tied to a real, active tender even if the
    # crawler removes a tender while an assessment job is running.
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _read_company_context() -> str:
    context_path = _configured_path("TENDER_COMPANY_CONTEXT_PATH")
    try:
        context = context_path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise ImproperlyConfigured(
            f"Company description and capabilities file cannot be read: {context_path}"
        ) from exc

    if not context:
        raise ImproperlyConfigured(
            f"Company description and capabilities file is empty: {context_path}"
        )
    return context


def _load_active_tenders(connection: sqlite3.Connection, limit: int | None) -> list[dict[str, Any]]:
    """Load only canonical, currently-active tender rows and their match inputs."""
    query = """
        SELECT
            ocid, title, description, buyer_name, buyer_id, published_date,
            closing_date, procurement_method, procedure_type, value_amount,
            value_currency, suitability_json, source_url, updated_at
        FROM tenders
        WHERE tender_status = 'active'
        -- published_date is the latest source release publication/edit date.
        -- Keep null dates last, then choose the most recently published tender.
        ORDER BY published_date IS NULL, published_date DESC, updated_at DESC, ocid ASC
    """
    params: tuple[int, ...] = ()
    if limit is not None:
        query += " LIMIT ?"
        params = (limit,)

    tenders = [dict(row) for row in connection.execute(query, params).fetchall()]
    for tender in tenders:
        tender["cpv_codes"] = []
        tender["locations"] = []
        tender["documents"] = []

        # Convert the source's JSON text to an object where possible, without
        # treating malformed/missing source metadata as a matching failure.
        try:
            tender["suitability"] = json.loads(tender.pop("suitability_json"))
        except (TypeError, json.JSONDecodeError):
            tender["suitability"] = None

    # SQLite has a bound-parameter limit, so child rows are fetched in chunks.
    # This is still a handful of queries for the full catalogue, rather than
    # three queries per tender.
    for start in range(0, len(tenders), 900):
        batch = tenders[start:start + 900]
        placeholders = ", ".join("?" for _ in batch)
        records_by_ocid = {tender["ocid"]: tender for tender in batch}
        ocids = tuple(records_by_ocid)

        child_queries = (
            (
                "cpv_codes",
                f"""
                SELECT ocid, scheme, code, description
                FROM tender_cpv_codes
                WHERE ocid IN ({placeholders})
                ORDER BY ocid, code
                """,
            ),
            (
                "locations",
                f"""
                SELECT ocid, country_name, region, locality, postal_code
                FROM tender_locations
                WHERE ocid IN ({placeholders})
                ORDER BY ocid, id
                """,
            ),
            (
                "documents",
                f"""
                SELECT ocid, document_id, title, url, document_format, document_type
                FROM tender_documents
                WHERE ocid IN ({placeholders})
                ORDER BY ocid, id
                """,
            ),
        )
        for key, child_query in child_queries:
            for row in connection.execute(child_query, ocids):
                item = dict(row)
                item.pop("ocid")
                records_by_ocid[row["ocid"]][key].append(item)

    return tenders


def _is_still_active(connection: sqlite3.Connection, ocid: str) -> bool:
    """Avoid sending a tender that was closed after the initial catalogue read."""
    return connection.execute(
        "SELECT 1 FROM tenders WHERE ocid = ? AND tender_status = 'active'", (ocid,)
    ).fetchone() is not None


def _get_openai_client():
    """Import lazily so a missing optional package fails only when this view runs."""
    if settings.TENDER_ASSESSMENT_FAKE_MODE:
        return _LocalFakeOpenAIClient()

    api_key = getattr(settings, "OPENAI_API_KEY", None) or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ImproperlyConfigured("OPENAI_API_KEY is not configured")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ImproperlyConfigured(
            "The OpenAI Python package is not installed. Install requirements.txt."
        ) from exc
    return OpenAI(api_key=api_key)


def _validate_assessment(response_text: str) -> dict[str, Any]:
    """Defence in depth for malformed/refused model output."""
    try:
        assessment = json.loads(response_text)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("The AI did not return valid JSON") from exc

    if not isinstance(assessment, dict) or set(assessment) != {
        "risk_rating", "risks", "fit_reasoning", "recommendation_rating"
    }:
        raise ValueError("The AI response did not match the required assessment schema")

    for key in ("risk_rating", "recommendation_rating"):
        value = assessment[key]
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 100:
            raise ValueError(f"AI field {key} must be an integer from 1 to 100")
    for key in ("risks", "fit_reasoning"):
        if not isinstance(assessment[key], str):
            raise ValueError(f"AI field {key} must be text")
    return assessment


def _assess_tender(client: Any, tender: dict[str, Any], company_context: str) -> dict[str, Any]:
    """Request one independently auditable assessment for one stable OCID."""
    instructions = (
        f"{settings.TENDER_ASSESSMENT_PROMPT.strip()}\n\n"
        "Return a JSON assessment that follows the supplied schema exactly. "
        "Use the company context and tender information below. Do not invent tender facts.\n\n"
        "Company description and capabilities:\n"
        f"{company_context}"
    )
    response = client.responses.create(
        model=_assessment_model_name(),
        instructions=instructions,
        input=json.dumps(tender, ensure_ascii=False, default=str),
        text={
            "format": {
                "type": "json_schema",
                "name": "tender_assessment",
                "strict": True,
                "schema": TENDER_ASSESSMENT_SCHEMA,
            }
        },
    )
    return _validate_assessment(getattr(response, "output_text", None))


def _save_assessment(
    ocid: str,
    assessment: dict[str, Any],
    company_context: str,
    tender_updated_at: str | None,
) -> None:
    """Upsert an assessment using OCID, never a notice/release identifier.

    This lives in Django's app database, keeping the government-source
    database read-only to the web application.
    """
    TenderAssessment.objects.update_or_create(
        ocid=ocid,
        defaults={
            "risk_rating": assessment["risk_rating"],
            "risks": assessment["risks"],
            "fit_reasoning": assessment["fit_reasoning"],
            "recommendation_rating": assessment["recommendation_rating"],
            "assessment_json": assessment,
            "model_name": _assessment_model_name(),
            "prompt_version": settings.TENDER_ASSESSMENT_PROMPT_VERSION,
            "company_context_sha256": hashlib.sha256(
                company_context.encode("utf-8")
            ).hexdigest(),
            "tender_updated_at": tender_updated_at or "",
        },
    )


# Create your views here.
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def register_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    email = request.data.get('email', '')

    if not username or not password:
        return Response({'error': 'Username and password are required'}, status=400)

    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username is already taken'}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    
    return Response({
        'message': 'User registered successfully!',
        'user_id': user.id,
        'username': user.username
    }, status=201)

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if user is not None:
        login(request, user)
        return Response({
            'message': 'User logged in successfully!',
            'user_id': user.id,
            'username': user.username
        }, status=200)
    else:
        return Response({'error': 'Invalid username or password'}, status=400)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_user(request):
    logout(request)
    return Response({'message': 'User logged out successfully!'}, status=200)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_profile(request):
    user = request.user
    return Response({
        'message': 'User profile retrieved successfully!',
        'user_id': user.id,
        'username': user.username,
        'email': user.email
    }, status=200)


def _assess_selected_active_tenders(limit: int | None) -> Response:
    """Assess the newest active source tenders, up to an optional hard limit."""
    try:
        company_context = _read_company_context()
        connection = _open_tender_database()
    except ImproperlyConfigured as exc:
        return Response({"error": str(exc)}, status=503)

    try:
        tenders = _load_active_tenders(connection, limit)
        if not tenders:
            return Response({
                "selected_active_tenders": 0,
                "assessed": 0,
                "failed": 0,
                "assessments": {},
            })

        try:
            client = _get_openai_client()
        except ImproperlyConfigured as exc:
            return Response({"error": str(exc)}, status=503)

        try:
            TenderAssessment.objects.exists()
        except (OperationalError, ProgrammingError):
            return Response(
                {"error": "Assessment storage is unavailable. Run: python manage.py migrate"},
                status=503,
            )

        assessments: dict[str, dict[str, Any]] = {}
        failures: dict[str, str] = {}
        skipped_closed = 0
        for tender in tenders:
            ocid = tender["ocid"]
            # The source crawler can run concurrently. A tender that disappeared
            # from its canonical active table after the initial selection is not
            # sent to the model.
            if not _is_still_active(connection, ocid):
                skipped_closed += 1
                continue
            try:
                assessment = _assess_tender(client, tender, company_context)
                _save_assessment(
                    ocid, assessment, company_context, tender["updated_at"]
                )
            except Exception as exc:
                # Retain successes if one tender has malformed source/model data;
                # the response makes individual OCID failures retryable.
                failures[ocid] = str(exc)
                continue
            assessments[ocid] = assessment

        return Response({
            "selected_active_tenders": len(tenders),
            "assessed": len(assessments),
            "failed": len(failures),
            "skipped_closed_during_run": skipped_closed,
            "assessments": assessments,
            "failures": failures,
        })
    finally:
        connection.close()


@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assess_active_tenders(request):
    """Assess active tenders, optionally accepting a caller-supplied limit."""
    limit = request.data.get("limit")
    if limit is not None:
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            return Response({"error": "limit must be a positive integer"}, status=400)
        if limit < 1:
            return Response({"error": "limit must be a positive integer"}, status=400)
    return _assess_selected_active_tenders(limit)


@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assess_live_trial_tenders(request):
    """Run 1--100 newest active tenders against the real OpenAI API.

    The optional request ``limit`` makes smaller paid tests practical while
    preserving an absolute upper bound of 100 model submissions.
    """
    if settings.TENDER_ASSESSMENT_FAKE_MODE:
        return Response(
            {
                "error": (
                    "Live trial requires TENDER_ASSESSMENT_FAKE_MODE=false and "
                    "a configured OPENAI_API_KEY."
                )
            },
            status=409,
        )
    limit = request.data.get("limit", LIVE_TRIAL_TENDER_LIMIT)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        return Response({"error": "limit must be an integer from 1 to 100"}, status=400)
    if not 1 <= limit <= LIVE_TRIAL_TENDER_LIMIT:
        return Response({"error": "limit must be an integer from 1 to 100"}, status=400)
    return _assess_selected_active_tenders(limit)
