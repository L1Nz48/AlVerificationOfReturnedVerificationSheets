"""ตัวอ่านเอกสาร — เลือก provider ตามการตั้งค่า"""

from ..config import Settings
from .base import Extractor
from .mock import MockExtractor


def build_extractor(settings: Settings) -> Extractor:
    provider = settings.ai_provider
    if provider == "mock":
        return MockExtractor(settings)
    if provider in ("auto", "gemini"):
        if settings.gemini_api_key:
            try:
                from .gemini import GeminiExtractor

                return GeminiExtractor(settings)
            except Exception:                            # noqa: BLE001
                if provider == "gemini":
                    raise
        elif provider == "gemini":
            raise RuntimeError("ไม่พบ GEMINI_API_KEY ใน .env")
    return MockExtractor(settings)
