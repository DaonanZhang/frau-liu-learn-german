from __future__ import annotations

import base64
import json
import textwrap
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from django.utils import timezone

from apps.accounts.models import AlipayWebsitePayment


class AlipayConfigurationError(ValueError):
    """Raised when required Alipay configuration is missing or invalid."""


class AlipayGatewayError(RuntimeError):
    """Raised when a direct Alipay gateway request fails."""


@dataclass(frozen=True)
class AlipayClientConfig:
    """
    Runtime configuration for Alipay integration.
    """

    app_id: str
    gateway_url: str
    app_private_key: str
    app_public_key: str
    alipay_public_key: str
    notify_url: str
    return_url: str
    seller_id: str
    sign_type: str
    timeout_express: str
    api_timeout_seconds: float


def _normalize_pem_key(value: str, *, key_type: str) -> str:
    normalized_value = value.strip().strip('"').replace("\\n", "\n")
    if not normalized_value:
        return ""
    if "BEGIN" in normalized_value:
        return normalized_value

    wrapped_body = "\n".join(textwrap.wrap(normalized_value, 64))
    if key_type == "private":
        return (
            "-----BEGIN PRIVATE KEY-----\n"
            f"{wrapped_body}\n"
            "-----END PRIVATE KEY-----"
        )

    return (
        "-----BEGIN PUBLIC KEY-----\n"
        f"{wrapped_body}\n"
        "-----END PUBLIC KEY-----"
    )


def _format_amount(amount: Decimal) -> str:
    quantized_amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return format(quantized_amount, "f")


def _serialize_value(value: object) -> str:
    if isinstance(value, dict):
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return str(value)


def _build_signing_string(params: Mapping[str, object]) -> str:
    filtered_items = []
    for key, value in params.items():
        if key == "sign":
            continue
        if value is None or value == "":
            continue
        filtered_items.append((key, _serialize_value(value)))

    filtered_items.sort(key=lambda item: item[0])
    return "&".join(f"{key}={value}" for key, value in filtered_items)


def _extract_json_object_string(payload: str, *, field_name: str) -> str:
    """
    Extract the exact JSON object string for one top-level field from a raw body.
    """

    field_token = f'"{field_name}"'
    field_index = payload.find(field_token)
    if field_index < 0:
        raise AlipayGatewayError(f"Missing {field_name} in gateway reply.")

    colon_index = payload.find(":", field_index + len(field_token))
    if colon_index < 0:
        raise AlipayGatewayError(f"Malformed {field_name} field in gateway reply.")

    value_start = colon_index + 1
    while value_start < len(payload) and payload[value_start].isspace():
        value_start += 1

    if value_start >= len(payload) or payload[value_start] != "{":
        raise AlipayGatewayError(f"{field_name} is not a JSON object in gateway reply.")

    brace_depth = 0
    in_string = False
    is_escaped = False

    for index in range(value_start, len(payload)):
        char = payload[index]
        if in_string:
            if is_escaped:
                is_escaped = False
            elif char == "\\":
                is_escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue
        if char == "{":
            brace_depth += 1
            continue
        if char == "}":
            brace_depth -= 1
            if brace_depth == 0:
                return payload[value_start:index + 1]

    raise AlipayGatewayError(f"Failed to extract signed payload for {field_name}.")


def load_alipay_client_config() -> AlipayClientConfig:
    """
    Load and validate Alipay configuration from Django settings.
    """

    config = AlipayClientConfig(
        app_id=settings.ALIPAY_APP_ID.strip(),
        gateway_url=settings.ALIPAY_GATEWAY_URL.strip(),
        app_private_key=_normalize_pem_key(
            settings.ALIPAY_APP_PRIVATE_KEY,
            key_type="private",
        ),
        app_public_key=_normalize_pem_key(
            settings.ALIPAY_APP_PUBLIC_KEY,
            key_type="public",
        ),
        alipay_public_key=_normalize_pem_key(
            settings.ALIPAY_PUBLIC_KEY,
            key_type="public",
        ),
        notify_url=settings.ALIPAY_NOTIFY_URL.strip(),
        return_url=settings.ALIPAY_RETURN_URL.strip(),
        seller_id=settings.ALIPAY_SELLER_ID.strip(),
        sign_type=settings.ALIPAY_SIGN_TYPE.strip() or "RSA2",
        timeout_express=settings.ALIPAY_TIMEOUT_EXPRESS.strip() or "15m",
        api_timeout_seconds=max(
            float(getattr(settings, "ALIPAY_API_TIMEOUT_SECONDS", 3.0) or 3.0),
            1.0,
        ),
    )

    missing_fields = [
        field_name
        for field_name, field_value in (
            ("ALIPAY_APP_ID", config.app_id),
            ("ALIPAY_GATEWAY_URL", config.gateway_url),
            ("ALIPAY_APP_PRIVATE_KEY", config.app_private_key),
            ("ALIPAY_PUBLIC_KEY", config.alipay_public_key),
            ("ALIPAY_NOTIFY_URL", config.notify_url),
            ("ALIPAY_RETURN_URL", config.return_url),
        )
        if not field_value
    ]
    if missing_fields:
        raise AlipayConfigurationError(
            f"Missing required Alipay settings: {', '.join(missing_fields)}"
        )

    if config.sign_type != "RSA2":
        raise AlipayConfigurationError("Only RSA2 sign_type is supported.")

    return config


class AlipayService:
    """
    Minimal Alipay website payment service for request signing and notify verification.
    """

    def __init__(self, config: AlipayClientConfig) -> None:
        self.config = config
        self._app_private_key = serialization.load_pem_private_key(
            config.app_private_key.encode("utf-8"),
            password=None,
        )
        self._alipay_public_key = serialization.load_pem_public_key(
            config.alipay_public_key.encode("utf-8"),
        )

    def build_page_pay_params(
        self,
        *,
        payment: AlipayWebsitePayment,
    ) -> dict[str, str]:
        """
        Build signed query parameters for `alipay.trade.page.pay`.

        Args:
            payment: Local payment record used to build the Alipay request.
        """

        biz_content = {
            "out_trade_no": payment.merchant_order_no,
            "product_code": "FAST_INSTANT_TRADE_PAY",
            "total_amount": _format_amount(payment.total_amount),
            "subject": payment.subject,
            "timeout_express": self.config.timeout_express,
        }
        params: dict[str, object] = {
            "app_id": self.config.app_id,
            "method": "alipay.trade.page.pay",
            "charset": "utf-8",
            "sign_type": self.config.sign_type,
            "timestamp": payment.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "version": "1.0",
            "return_url": self.config.return_url,
            "biz_content": biz_content,
        }
        if self.config.notify_url:
            params["notify_url"] = self.config.notify_url

        sign = self.sign(params)
        signed_params = {
            key: _serialize_value(value)
            for key, value in params.items()
            if value is not None and value != ""
        }
        signed_params["sign"] = sign
        return signed_params

    def build_api_params(
        self,
        *,
        method: str,
        biz_content: Mapping[str, object],
    ) -> dict[str, str]:
        """
        Build signed API request parameters for Alipay gateway RPC methods.
        """

        params: dict[str, object] = {
            "app_id": self.config.app_id,
            "method": method,
            "charset": "utf-8",
            "sign_type": self.config.sign_type,
            "timestamp": timezone.now().strftime("%Y-%m-%d %H:%M:%S"),
            "version": "1.0",
            "biz_content": dict(biz_content),
        }
        sign = self.sign(params)
        signed_params = {
            key: _serialize_value(value)
            for key, value in params.items()
            if value is not None and value != ""
        }
        signed_params["sign"] = sign
        return signed_params

    def execute_api(
        self,
        *,
        method: str,
        biz_content: Mapping[str, object],
    ) -> tuple[dict[str, object], str]:
        """
        Execute a direct Alipay gateway API call and return the decoded JSON body.
        """

        params = self.build_api_params(method=method, biz_content=biz_content)
        body = urlencode(params).encode("utf-8")
        request = Request(
            self.config.gateway_url,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.config.api_timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise AlipayGatewayError(f"Failed to call Alipay gateway: {exc}") from exc

        try:
            parsed = json.loads(response_body)
        except json.JSONDecodeError as exc:
            raise AlipayGatewayError("Alipay gateway returned invalid JSON.") from exc

        if not isinstance(parsed, dict):
            raise AlipayGatewayError("Alipay gateway returned an unexpected response shape.")

        return parsed, response_body

    def query_trade(self, *, merchant_order_no: str) -> dict[str, object]:
        """
        Query one trade by merchant order number using `alipay.trade.query`.
        """

        payload, response_body = self.execute_api(
            method="alipay.trade.query",
            biz_content={
                "out_trade_no": merchant_order_no,
            },
        )
        response = payload.get("alipay_trade_query_response")
        if not isinstance(response, dict):
            raise AlipayGatewayError("Missing alipay_trade_query_response in gateway reply.")

        signature = str(payload.get("sign") or "").strip()
        if not signature:
            raise AlipayGatewayError("Missing gateway response signature.")

        response_string = _extract_json_object_string(
            response_body,
            field_name="alipay_trade_query_response",
        )
        try:
            self._alipay_public_key.verify(
                base64.b64decode(signature),
                response_string.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
        except (InvalidSignature, ValueError, TypeError) as exc:
            raise AlipayGatewayError("Invalid gateway response signature.") from exc

        return response

    def build_page_pay_url(
        self,
        *,
        payment: AlipayWebsitePayment,
    ) -> str:
        """
        Build the full Alipay redirect URL for a website payment.

        Args:
            payment: Local payment record used to build the Alipay request.
        """

        params = self.build_page_pay_params(payment=payment)
        return f"{self.config.gateway_url}?{urlencode(params)}"

    def sign(self, params: Mapping[str, object]) -> str:
        """
        Sign a parameter mapping with the merchant private key.

        Args:
            params: Request parameters to sign before sending to Alipay.
        """

        signing_string = _build_signing_string(params)
        signature = self._app_private_key.sign(
            signing_string.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return base64.b64encode(signature).decode("utf-8")

    def verify_notify_signature(self, data: Mapping[str, str]) -> bool:
        """
        Verify an Alipay notify payload signature.

        Args:
            data: Raw notify payload data including the `sign` field from Alipay.
        """

        signature = data.get("sign", "")
        if not signature:
            return False

        signing_string = _build_signing_string(data)
        try:
            self._alipay_public_key.verify(
                base64.b64decode(signature),
                signing_string.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
        except (InvalidSignature, ValueError, TypeError):
            return False
        return True


def get_alipay_service() -> AlipayService:
    """
    Create an Alipay service instance from Django settings.
    """

    return AlipayService(config=load_alipay_client_config())
