from __future__ import annotations

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class TelephoneTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    JWT login serializer using telephone as username field.
    """

    username_field = "telephone"