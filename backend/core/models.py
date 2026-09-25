from django.db import models
from django.core.validators import MaxValueValidator, MinValueValidator


class TenderAssessment(models.Model):
    """Latest AI assessment for one source tender, identified by its OCID.

    The source tender catalogue is kept in the crawler's separate SQLite
    database. This application-owned model intentionally stores the stable
    OCID rather than a cross-database foreign key, which Django cannot enforce.
    """

    ocid = models.CharField(max_length=512, primary_key=True)
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

    def __str__(self) -> str:
        return f"{self.ocid} ({self.recommendation_rating}/100)"
