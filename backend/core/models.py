from django.db import models
from django.core.validators import MaxValueValidator, MinValueValidator
from django.contrib.auth.models import User


class CompanyProfile(models.Model):
    """Stores the business information and AI-generated markdown context for a user."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="companyprofile")
    raw_information = models.TextField(blank=True, help_text="Raw input from the user about their business.")
    markdown_context = models.TextField(blank=True, help_text="AI-generated markdown format of company capabilities.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user.username}'s Company Profile"


class TenderAssessment(models.Model):
    """Latest AI assessment for one source tender, identified by its OCID and tied to a user."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tender_assessments")
    ocid = models.CharField(max_length=512)
    risk_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(100)]
    )
    risks = models.TextField()
    fit_reasoning = models.TextField()
    recommendation_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(100)]
    )
    assessment_json = models.JSONField()
    model_name = models.CharField(max_length=128)
    prompt_version = models.CharField(max_length=128)
    company_context_sha256 = models.CharField(max_length=64)
    tender_updated_at = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    assessed_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tender_assessments"
        ordering = ["-assessed_at"]
        unique_together = ("user", "ocid")

    def __str__(self) -> str:
        return f"{self.ocid} for {self.user.username} ({self.recommendation_rating}/100)"
