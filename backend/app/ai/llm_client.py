from __future__ import annotations

import json
from dataclasses import dataclass

import httpx

from app.core.config import settings


class LLMClientError(RuntimeError):
    pass


@dataclass
class LLMResult:
    text: str


class LLMClient:
    def __init__(self) -> None:
        self.timeout = settings.llm_timeout_seconds

    async def generate(self, prompt: str) -> str:
        provider = settings.llm_provider.lower().strip()
        if provider == "openai":
            return await self._generate_openai(prompt)
        if provider == "gemini":
            return await self._generate_gemini(prompt)
        raise LLMClientError(f"Unsupported LLM provider: {settings.llm_provider}")

    async def _generate_openai(self, prompt: str) -> str:
        if not settings.openai_api_key:
            raise LLMClientError("OPENAI_API_KEY is not configured.")

        payload = {
            "model": settings.openai_model,
            "messages": [
                {"role": "system", "content": "Respond with strict JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }

        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LLMClientError("OpenAI response did not contain message content.") from exc

    async def _generate_gemini(self, prompt: str) -> str:
        if not settings.gemini_api_key:
            raise LLMClientError("GEMINI_API_KEY is not configured.")

        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": prompt}]},
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
        )

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

        try:
            parts = data["candidates"][0]["content"]["parts"]
            return "".join(part.get("text", "") for part in parts)
        except (KeyError, IndexError) as exc:
            raise LLMClientError("Gemini response did not contain text content.") from exc

    @staticmethod
    def parse_json(text: str) -> dict:
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise LLMClientError("LLM response was not valid JSON.") from exc

