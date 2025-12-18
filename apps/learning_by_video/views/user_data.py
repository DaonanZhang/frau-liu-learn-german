from __future__ import annotations

from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

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
