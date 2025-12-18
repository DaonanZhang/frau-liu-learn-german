from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.models.user_data import UserData
from apps.accounts.serializers.user_data import UserDataReadSerializer, UserDataWriteSerializer


class UserDataViewSet(viewsets.GenericViewSet):
    """
    UserData endpoints:
    - GET/PATCH /user-data/me/
    """

    permission_classes = (IsAuthenticated,)
    queryset = UserData.objects.select_related("user")

    def get_serializer_class(self):
        if self.action in ("me",):
            return UserDataReadSerializer
        if self.action in ("update_me",):
            return UserDataWriteSerializer
        return UserDataReadSerializer

    def _get_or_create_user_data(self, request: Request) -> UserData:
        obj, _ = UserData.objects.get_or_create(user=request.user)
        return obj

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request: Request) -> Response:
        obj = self._get_or_create_user_data(request)
        serializer = UserDataReadSerializer(instance=obj, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["patch"], url_path="me")
    def update_me(self, request: Request) -> Response:
        obj = self._get_or_create_user_data(request)
        serializer = UserDataWriteSerializer(instance=obj, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        out = UserDataReadSerializer(instance=obj, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)
