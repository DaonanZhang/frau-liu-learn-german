from config.settings import *  # noqa: F401,F403


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "frau-liu-tests",
    }
}

CELERY_TASK_ALWAYS_EAGER = True

REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "activation_code_verify": "10000/min",
    "activation_code_redeem": "10000/min",
    "alipay_purchase_create": "10000/min",
    "alipay_payment_status": "10000/min",
}
