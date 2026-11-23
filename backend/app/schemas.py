from datetime import date, datetime
from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class WishlistItem(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    url: str | None = Field(default=None, max_length=500)
    notes: str = Field(default="", max_length=280)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Wishlist item title cannot be empty.")
        return cleaned

    @field_validator("url")
    @classmethod
    def validate_safe_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        parsed = urlparse(cleaned)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Item links must begin with http:// or https://.")
        return cleaned

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: str) -> str:
        return value.strip()


class InvitePreviewResponse(BaseModel):
    exchange_id: UUID
    title: str
    description: str
    budget_amount: float | None
    currency: str
    exchange_date: date | None
    status: str
    participant_count: int
    target_participants: int | None = None


class JoinExchangeRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    alias: str = Field(default="", max_length=40)
    wishlist_items: list[WishlistItem] = Field(default_factory=list, max_length=20)
    dislikes: str = Field(default="", max_length=500)
    delivery_notes: str = Field(default="", max_length=500)

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Display name cannot be empty.")
        return cleaned

    @field_validator("alias", "dislikes", "delivery_notes")
    @classmethod
    def clean_optional_text(cls, value: str) -> str:
        return value.strip()


class JoinExchangeResponse(BaseModel):
    exchange_id: UUID
    participant_id: UUID
    already_joined: bool


class DrawResponse(BaseModel):
    exchange_id: UUID
    status: str
    participant_count: int
    drawn_at: datetime


class ResetDrawResponse(BaseModel):
    exchange_id: UUID
    status: str


class AnonymousMessageCreateRequest(BaseModel):
    assignment_id: UUID
    sender_role: Literal["santa", "recipient"]
    body: str = Field(min_length=1, max_length=1000)

    @field_validator("body")
    @classmethod
    def clean_body(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Message cannot be empty.")
        return cleaned


class AnonymousMessageResponse(BaseModel):
    id: UUID
    exchange_id: UUID
    assignment_id: UUID
    sender_role: Literal["santa", "recipient"]
    body: str
    created_at: datetime


class QaWebhookEventRequest(BaseModel):
    event: str = Field(default="message_created", min_length=1, max_length=64)
    assignment_id: UUID | None = None


class QaWebhookResponse(BaseModel):
    status: str
    delivered: int
