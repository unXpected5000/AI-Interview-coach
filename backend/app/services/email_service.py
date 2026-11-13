"""SMTP delivery for verification codes using only the standard library."""
from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    """SMTP settings are missing, so verification email cannot be sent."""


class EmailDeliveryError(RuntimeError):
    """The SMTP server rejected or could not accept the message."""


class EmailService:
    def ensure_available(self) -> None:
        if not settings.smtp_configured and not settings.email_dev_logging_active:
            raise EmailNotConfiguredError(
                "Email verification is not configured on this server. Set SMTP_HOST and SMTP_FROM_EMAIL."
            )

    async def send_verification_code(self, recipient: str, code: str, minutes: int) -> None:
        self.ensure_available()
        if not settings.smtp_configured:
            # Explicit development opt-in only (see config.email_dev_logging_active).
            logger.warning("DEVELOPMENT ONLY: verification code for %s is %s", recipient, code)
            return
        message = EmailMessage()
        message["Subject"] = f"{settings.app_name}: your verification code"
        message["From"] = settings.smtp_from_email
        message["To"] = recipient
        message.set_content(
            f"Your verification code is {code}.\n\n"
            f"It expires in {minutes} minutes and can be used once. "
            "If you did not request this, you can ignore this email."
        )
        try:
            await asyncio.to_thread(self._send, message)
        except (OSError, smtplib.SMTPException) as exc:
            logger.error("Verification email delivery failed: %s", type(exc).__name__)
            raise EmailDeliveryError("The verification email could not be sent. Try again shortly.") from exc

    def _send(self, message: EmailMessage) -> None:
        context = ssl.create_default_context()
        timeout = settings.smtp_timeout_seconds
        if settings.smtp_use_ssl:
            client: smtplib.SMTP = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=timeout, context=context)
        else:
            client = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout)
        with client:
            if settings.smtp_use_starttls and not settings.smtp_use_ssl:
                client.starttls(context=context)
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)
