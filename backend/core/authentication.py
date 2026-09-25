"""Authentication classes for this testing-only API configuration."""

from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Allow authenticated session requests without a CSRF token in testing.

    Django REST framework enforces CSRF inside ``SessionAuthentication`` even
    when a view has Django's ``@csrf_exempt`` decorator. This override removes
    that second check for the API. Do not use this class in production.
    """

    def enforce_csrf(self, request):
        return
