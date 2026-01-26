from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework import mixins, viewsets

from apps.learning_by_video.models import LearningVideoUserData
from apps.learning_by_video.serializers import LearningVideoUserDataSerializer


class LearningVideoUserDataViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = LearningVideoUserDataSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self) -> LearningVideoUserData:
        user_data = getattr(self.request.user, "user_data", None)
        if user_data is None:
            raise ValueError(
                "UserData relation not found on user. "
                "Adjust LearningVideoUserDataViewSet.get_object() to match your accounts.UserData relation."
            )

        obj, _ = LearningVideoUserData.objects.get_or_create(user_data=user_data)
        return obj

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request: Request) -> Response:
        obj = self.get_object()
        serializer = LearningVideoUserDataSerializer(instance=obj, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["patch"], url_path="me")
    def update_me(self, request: Request) -> Response:
        obj = self.get_object()
        serializer = LearningVideoUserDataSerializer(
            instance=obj,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        out = LearningVideoUserDataSerializer(instance=obj, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)
