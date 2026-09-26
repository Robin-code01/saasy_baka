"""HTTP views for the application.

The tender matcher deliberately talks to the crawler's SQLite database rather
than Django's authentication database.  The crawler maintains ``tenders`` as
the canonical set of opportunities whose latest release is active; historical
releases live only in ``procurement_state`` and must never be matched.
"""

import hashlib
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
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
from django.views.decorators.csrf import csrf_exempt

from .models import TenderAssessment, CompanyProfile


logger = logging.getLogger(__name__)


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
TOP_ASSESSMENT_MAX_LIMIT = 1000
TENDER_LOOKUP_CHUNK_SIZE = 900


def _future_closing_date(value: str | None, now: datetime) -> datetime | None:
    """Parse an ISO-8601 closing date and return it only when still future."""
    if not value:
        return None
    try:
        closing_date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if closing_date.tzinfo is None:
        closing_date = closing_date.replace(tzinfo=timezone.utc)
    return closing_date if closing_date > now else None


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


class _LocalFakeChatCompletions:
    def create(self, **kwargs: Any) -> SimpleNamespace:
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content="## Fake AI Draft Proposal\n\nThis is a mocked draft proposal generated locally without calling the actual OpenAI API."
                    )
                )
            ]
        )

class _LocalFakeChat:
    completions = _LocalFakeChatCompletions()

class _LocalFakeOpenAIClient:
    """Matches the small part of the OpenAI client interface used by this view."""

    responses = _LocalFakeResponses()
    chat = _LocalFakeChat()


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
    try:
        # sqlite3.connect() succeeds even for arbitrary files. Validate the
        # database and canonical source table here, before an endpoint starts
        # doing work and can otherwise fail with an unhelpful Django 500.
        connection.execute("PRAGMA schema_version").fetchone()
        has_tenders_table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tenders'"
        ).fetchone()
        if has_tenders_table is None:
            raise sqlite3.DatabaseError("the canonical 'tenders' table is missing")
        # This keeps AI assessments tied to a real, active tender even if the
        # crawler removes a tender while an assessment job is running.
        connection.execute("PRAGMA foreign_keys = ON")
    except sqlite3.DatabaseError as exc:
        connection.close()
        raise ImproperlyConfigured(
            "Tender database is not a readable crawler SQLite database: "
            f"{database_path}. Verify TENDER_DATABASE_PATH and restore or re-run the crawler."
        ) from exc
    return connection


def _read_company_context(user) -> str:
    try:
        profile = user.companyprofile
        context = profile.markdown_context.strip()
        if not context:
            raise ImproperlyConfigured("Your company profile markdown is empty. Please generate it first.")
        return context
    except CompanyProfile.DoesNotExist:
        raise ImproperlyConfigured("You have not created a company profile yet.")


def _add_tender_children(
    connection: sqlite3.Connection, tenders: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Add all related source records to tender dictionaries in SQLite-safe batches."""
    for tender in tenders:
        tender["cpv_codes"] = []
        tender["locations"] = []
        tender["documents"] = []

        # Convert the source's JSON text to an object where possible, without
        # treating malformed/missing source metadata as a matching failure.
        try:
            tender["suitability"] = json.loads(tender.get("suitability_json"))
        except (TypeError, json.JSONDecodeError):
            tender["suitability"] = None

    # SQLite has a bound-parameter limit, so child rows are fetched in chunks.
    for start in range(0, len(tenders), TENDER_LOOKUP_CHUNK_SIZE):
        batch = tenders[start:start + TENDER_LOOKUP_CHUNK_SIZE]
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


def _load_active_tenders(connection: sqlite3.Connection, limit: int | None) -> list[dict[str, Any]]:
    """Load active tenders for assessment, prioritising the latest closing date."""
    query = """
        SELECT
            ocid, title, description, buyer_name, buyer_id, published_date,
            closing_date, procurement_method, procedure_type, value_amount,
            value_currency, suitability_json, source_url, updated_at
        FROM tenders
        WHERE tender_status = 'active'
        -- Assess tenders with the furthest/latest closing date first. Source
        -- publication date resolves ties; missing closing dates always last.
        ORDER BY closing_date IS NULL, closing_date DESC, published_date DESC,
                 updated_at DESC, ocid ASC
    """
    params: tuple[int, ...] = ()
    if limit is not None:
        query += " LIMIT ?"
        params = (limit,)

    tenders = [dict(row) for row in connection.execute(query, params).fetchall()]
    return _add_tender_children(connection, tenders)


def _load_active_tenders_by_ocid(
    connection: sqlite3.Connection, ocids: list[str]
) -> list[dict[str, Any]]:
    """Load every current source field for specified OCIDs, excluding inactive rows."""
    tenders: list[dict[str, Any]] = []
    for start in range(0, len(ocids), TENDER_LOOKUP_CHUNK_SIZE):
        batch = ocids[start:start + TENDER_LOOKUP_CHUNK_SIZE]
        placeholders = ", ".join("?" for _ in batch)
        query = f"""
            SELECT *
            FROM tenders
            WHERE tender_status = 'active' AND ocid IN ({placeholders})
        """
        tenders.extend(dict(row) for row in connection.execute(query, batch).fetchall())
    return _add_tender_children(connection, tenders)


def _load_active_tender_closing_dates(
    connection: sqlite3.Connection, ocids: list[str]
) -> dict[str, str | None]:
    """Return only the active-tender metadata needed to rank stored results."""
    closing_dates: dict[str, str | None] = {}
    for start in range(0, len(ocids), TENDER_LOOKUP_CHUNK_SIZE):
        batch = ocids[start:start + TENDER_LOOKUP_CHUNK_SIZE]
        placeholders = ", ".join("?" for _ in batch)
        query = f"""
            SELECT ocid, closing_date
            FROM tenders
            WHERE tender_status = 'active' AND ocid IN ({placeholders})
        """
        closing_dates.update(
            {row["ocid"]: row["closing_date"] for row in connection.execute(query, batch)}
        )
    return closing_dates


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
    user,
    ocid: str,
    assessment: dict[str, Any],
    company_context: str,
    tender_updated_at: str | None,
) -> None:
    TenderAssessment.objects.update_or_create(
        user=user,
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


def _serialise_assessment(assessment: TenderAssessment) -> dict[str, Any]:
    """Return every application-owned assessment field in a JSON-safe form."""
    return {
        "ocid": assessment.ocid,
        "risk_rating": assessment.risk_rating,
        "risks": assessment.risks,
        "fit_reasoning": assessment.fit_reasoning,
        "recommendation_rating": assessment.recommendation_rating,
        "assessment_json": assessment.assessment_json,
        "model_name": assessment.model_name,
        "prompt_version": assessment.prompt_version,
        "company_context_sha256": assessment.company_context_sha256,
        "tender_updated_at": assessment.tender_updated_at,
        "created_at": assessment.created_at.isoformat(),
        "assessed_at": assessment.assessed_at.isoformat(),
    }


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


def _assess_selected_active_tenders(limit: int | None, user) -> Response:
    """Assess active source tenders with the latest closing dates first."""
    try:
        company_context = _read_company_context(user)
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
                    user, ocid, assessment, company_context, tender["updated_at"]
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
    except sqlite3.DatabaseError:
        return Response(
            {
                "error": (
                    "Tender source database became unreadable. Verify "
                    "TENDER_DATABASE_PATH and re-run or restore the crawler database."
                )
            },
            status=503,
        )
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
    return _assess_selected_active_tenders(limit, request.user)


@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assess_live_trial_tenders(request):
    """Run 1--100 active tenders with the latest closing dates against OpenAI.

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
    return _assess_selected_active_tenders(limit, request.user)


@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def get_top_assessed_tenders(request):
    """Return the best stored assessments with details loaded by their OCIDs.

    Ratings and risk are read from Django's ``db.sqlite3``. The crawler
    database is queried only after that, to restrict results to canonical
    active tenders with future closing dates, and provide tender details.
    """
    limit = request.data.get("limit", 10)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        return Response(
            {"error": f"limit must be an integer from 1 to {TOP_ASSESSMENT_MAX_LIMIT}"},
            status=400,
        )
    if not 1 <= limit <= TOP_ASSESSMENT_MAX_LIMIT:
        return Response(
            {"error": f"limit must be an integer from 1 to {TOP_ASSESSMENT_MAX_LIMIT}"},
            status=400,
        )

    try:
        connection = _open_tender_database()
    except ImproperlyConfigured as exc:
        return Response({"error": str(exc)}, status=503)

    try:
        assessments = list(TenderAssessment.objects.filter(user=request.user))
        closing_dates = _load_active_tender_closing_dates(
            connection, [assessment.ocid for assessment in assessments]
        )
        now = datetime.now(timezone.utc)
        candidates = [
            (assessment, closing_date)
            for assessment in assessments
            if (
                assessment.ocid in closing_dates
                and (closing_date := _future_closing_date(closing_dates[assessment.ocid], now))
                is not None
            )
        ]

        # Python's stable sort lets us apply deterministic priorities without
        # comparing the two separate SQLite databases in one SQL statement.
        # Recommendation is the primary decision signal. Dates are an
        # eligibility requirement and only the third tie-breaker.
        candidates.sort(key=lambda item: item[0].ocid)
        candidates.sort(key=lambda item: item[0].assessed_at, reverse=True)
        candidates.sort(key=lambda item: item[1], reverse=True)
        candidates.sort(key=lambda item: item[0].risk_rating)
        candidates.sort(key=lambda item: item[0].recommendation_rating, reverse=True)

        selected_candidates = candidates[:limit]
        selected_tenders = _load_active_tenders_by_ocid(
            connection, [assessment.ocid for assessment, _ in selected_candidates]
        )
        tenders_by_ocid = {tender["ocid"]: tender for tender in selected_tenders}
        results = [
            {
                "ocid": assessment.ocid,
                "tender": tenders_by_ocid[assessment.ocid],
                "assessment": _serialise_assessment(assessment),
            }
            for assessment, _ in selected_candidates
            # The crawler can close a tender between ranking and full lookup.
            if assessment.ocid in tenders_by_ocid
        ]
    except sqlite3.DatabaseError:
        return Response(
            {
                "error": (
                    "Tender source database is unreadable. Verify "
                    "TENDER_DATABASE_PATH and re-run or restore the crawler database."
                )
            },
            status=503,
        )
    except (OperationalError, ProgrammingError):
        return Response(
            {"error": "Assessment storage is unavailable. Run: python manage.py migrate"},
            status=503,
        )
    finally:
        connection.close()

    return Response(
        {
            "requested": limit,
            "returned": len(results),
            "ranking": (
                "recommendation_rating descending, risk_rating ascending, "
                "closing_date descending (future dates only)"
            ),
            "results": results,
        }
    )

import markdown
from xhtml2pdf import pisa
from io import BytesIO
from django.http import HttpResponse

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_tender_draft(request, ocid):
    """Generate and return a PDF draft proposal for a specific tender using AI."""
    try:
        connection = _open_tender_database()
        company_context = _read_company_context(request.user)
    except ImproperlyConfigured as exc:
        return Response({"error": str(exc)}, status=503)

    try:
        tenders = _load_active_tenders_by_ocid(connection, [ocid])
        if not tenders:
            return Response({"error": "Tender not found or inactive"}, status=404)
        
        tender = tenders[0]
        
        # Try to get assessment if it exists
        assessment = None
        try:
            assessment = TenderAssessment.objects.get(ocid=ocid, user=request.user)
        except TenderAssessment.DoesNotExist:
            pass

        try:
            client = _get_openai_client()
        except ImproperlyConfigured as exc:
            return Response({"error": str(exc)}, status=503)
            
        # Build prompt
        prompt = (
            "You are an expert bid writer. Create a professional draft proposal for the following tender. "
            "Use the company context, the tender information, and the AI assessment risks and fit reasoning provided below. "
            "Format the proposal clearly in Markdown.\n\n"
            "Company description and capabilities:\n"
            f"{company_context}\n\n"
            "Tender Details:\n"
            f"Title: {tender.get('title')}\n"
            f"Buyer: {tender.get('buyer_name')}\n"
            f"Description: {tender.get('description')}\n\n"
        )
        if assessment:
            prompt += (
                "AI Assessment:\n"
                f"Risks: {assessment.risks}\n"
                f"Fit Reasoning: {assessment.fit_reasoning}\n"
            )

        try:
            ai_response = client.chat.completions.create(
                model=_assessment_model_name(),
                messages=[
                    {"role": "system", "content": "You are a helpful bid writing assistant."},
                    {"role": "user", "content": prompt}
                ],
            )
            markdown_draft = ai_response.choices[0].message.content
        except Exception as e:
            return Response({"error": f"AI generation failed: {str(e)}"}, status=500)
        
        # Add a title at the top
        final_markdown = f"# Draft Proposal for {tender.get('title')}\n\n{markdown_draft}"
        
        # Convert Markdown to HTML
        html_content = markdown.markdown(final_markdown, extensions=['tables', 'fenced_code'])
        
        # Add basic CSS for PDF
        styled_html = f"""
        <html>
        <head>
        <style>
            body {{ font-family: Helvetica, Arial, sans-serif; font-size: 12px; }}
            h1 {{ font-size: 24px; color: #333; }}
            h2 {{ font-size: 18px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 5px; }}
            p {{ margin-bottom: 10px; line-height: 1.5; }}
            ul, ol {{ margin-bottom: 10px; margin-left: 20px; }}
        </style>
        </head>
        <body>
        {html_content}
        </body>
        </html>
        """
        
        # Convert HTML to PDF
        pdf_buffer = BytesIO()
        pisa_status = pisa.CreatePDF(styled_html, dest=pdf_buffer)
        
        if pisa_status.err:
            return Response({"error": "Failed to generate PDF"}, status=500)
            
        pdf_buffer.seek(0)
        
        response = HttpResponse(pdf_buffer.read(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="tender_draft_{ocid}.pdf"'
        return response
        
    except sqlite3.DatabaseError:
        return Response({"error": "Tender source database is unreadable."}, status=503)
    finally:
        connection.close()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_business_profile(request):
    """Takes raw user input, sends to AI to generate markdown profile, and saves."""
    raw_info = request.data.get("raw_information", "").strip()
    if not raw_info:
        return Response({"error": "raw_information is required"}, status=400)

    # Do this before the paid AI request. A deployment with unapplied migrations
    # must not successfully generate a profile only to fail while saving it.
    try:
        CompanyProfile.objects.exists()
    except (OperationalError, ProgrammingError):
        return Response(
            {"error": "Profile storage is unavailable. Run: python manage.py migrate"},
            status=503,
        )
    
    try:
        client = _get_openai_client()
    except ImproperlyConfigured as exc:
        return Response({"error": str(exc)}, status=503)
        
    prompt = (
        "You are an expert business analyst and copywriter. Convert the following raw information "
        "provided by a company into a highly professional, well-structured Markdown document outlining "
        "their company description and capabilities. This document will be used as context for bidding on tenders.\n\n"
        f"Raw Information:\n{raw_info}"
    )
    
    try:
        ai_response = client.chat.completions.create(
            model=_assessment_model_name(),
            messages=[
                {"role": "system", "content": "You are a professional business writer."},
                {"role": "user", "content": prompt}
            ],
        )
        markdown_draft = ai_response.choices[0].message.content
    except Exception:
        # The provider's error text can include implementation and account
        # details, so retain it in server logs but do not expose it to clients.
        logger.exception("Business profile generation failed for user %s", request.user.pk)
        return Response(
            {"error": "Business profile generation is temporarily unavailable. Please try again."},
            status=502,
        )

    if not isinstance(markdown_draft, str) or not markdown_draft.strip():
        logger.error("Business profile generation returned no text for user %s", request.user.pk)
        return Response(
            {"error": "Business profile generation returned no content. Please try again."},
            status=502,
        )

    try:
        profile, _ = CompanyProfile.objects.update_or_create(
            user=request.user,
            defaults={
                "raw_information": raw_info,
                "markdown_context": markdown_draft,
            },
        )
    except (OperationalError, ProgrammingError):
        return Response(
            {"error": "Profile storage is unavailable. Run: python manage.py migrate"},
            status=503,
        )
    
    return Response({
        "message": "Profile generated successfully",
        "markdown_context": profile.markdown_context
    }, status=200)


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def manage_business_profile(request):
    """Fetch or update the generated markdown context."""
    if request.method == 'GET':
        try:
            profile = request.user.companyprofile
            return Response({
                "raw_information": profile.raw_information,
                "markdown_context": profile.markdown_context
            })
        except CompanyProfile.DoesNotExist:
            # A new account has no profile until its first generation. This is
            # an expected empty state, not a missing API resource.
            return Response({"raw_information": "", "markdown_context": ""})
            
    elif request.method == 'PUT':
        markdown_context = request.data.get("markdown_context")
        if not markdown_context:
            return Response({"error": "markdown_context is required"}, status=400)
            
        profile, created = CompanyProfile.objects.update_or_create(
            user=request.user,
            defaults={"markdown_context": markdown_context}
        )
        return Response({"message": "Profile updated successfully"})
