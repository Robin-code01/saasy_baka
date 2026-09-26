from django.urls import path
from . import views

urlpatterns = [
    path("register/", views.register_user, name="register_user"),
    path("login/", views.login_user, name="login_user"),
    path("logout/", views.logout_user, name="logout_user"),
    path("profile/", views.get_profile, name="get_profile"),
    path("tenders/assess-active/", views.assess_active_tenders, name="assess_active_tenders"),
    path(
        "tenders/assess-live-trial/",
        views.assess_live_trial_tenders,
        name="assess_live_trial_tenders",
    ),
    path(
        "tenders/top-assessments/",
        views.get_top_assessed_tenders,
        name="get_top_assessed_tenders",
    ),
    path(
        "tenders/<str:ocid>/draft/",
        views.get_tender_draft,
        name="get_tender_draft",
    ),
    path(
        "profile/business-info/generate/",
        views.generate_business_profile,
        name="generate_business_profile",
    ),
    path(
        "profile/business-info/",
        views.manage_business_profile,
        name="manage_business_profile",
    ),
]
