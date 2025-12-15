from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model for future extension:
    - subscriptions, purchases, feature flags, etc.
    """
    pass
