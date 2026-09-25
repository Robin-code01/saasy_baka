from django.contrib import admin

from .models import TenderAssessment


@admin.register(TenderAssessment)
class TenderAssessmentAdmin(admin.ModelAdmin):
    list_display = (
        "ocid",
        "recommendation_rating",
        "risk_rating",
        "model_name",
        "assessed_at",
    )
    search_fields = ("ocid", "risks", "fit_reasoning")
    readonly_fields = ("created_at", "assessed_at", "company_context_sha256")
