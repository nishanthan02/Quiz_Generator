# services/ocr_fallback.py
import os
import base64
import logging
from io import BytesIO
from typing import Optional

logger = logging.getLogger(__name__)

def extract_text_from_image(image_bytes: bytes, mime_type: str = "image/png") -> Optional[str]:
    """
    Attempts to extract text (OCR) from an image using Gemini 1.5 Flash.
    If Gemini fails (e.g., quota exhausted), falls back to GitHub Models (GPT-4o-mini).
    """
    # 1. Primary: Gemini 1.5 Flash
    text = _try_gemini_vision(image_bytes, mime_type)
    if text:
        return text

    # 2. Fallback: GitHub Models (GPT-4o-mini)
    logger.warning("Gemini Vision failed or exhausted. Falling back to GitHub Models OCR.")
    text = _try_github_models_vision(image_bytes, mime_type)
    if text:
        return text

    logger.error("All OCR fallback methods failed.")
    return None


def _try_gemini_vision(image_bytes: bytes, mime_type: str) -> Optional[str]:
    try:
        import google.generativeai as genai
        from core.config import settings

        if not settings.gemini_api_key:
            return None

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = (
            "Extract all the text from this image exactly as it appears. "
            "If it's in Tamil, return the Tamil text. If English, return English. "
            "If it's a mix, return the mix. Do not add any extra explanation or formatting, "
            "just the raw extracted text."
        )

        response = model.generate_content([
            prompt,
            {"mime_type": mime_type, "data": image_bytes}
        ])

        if response and response.text:
            return response.text.strip()
            
    except Exception as e:
        logger.error(f"Gemini OCR failed: {e}")
        return None


def _try_github_models_vision(image_bytes: bytes, mime_type: str) -> Optional[str]:
    try:
        import openai
        from core.config import settings
        
        # You specified GITHUB_TOKEN in your .env
        github_token = getattr(settings, "github_token", None)
        if not github_token:
            return None

        client = openai.OpenAI(
            base_url="https://models.inference.ai.azure.com",
            api_key=github_token
        )

        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64_image}"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": "Extract all the text from this image exactly as it appears. If it's in Tamil, return the Tamil text. If English, return English. Just the raw text."
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url}
                        }
                    ]
                }
            ],
            temperature=0.0
        )
        
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"GitHub Models OCR failed: {e}")
        return None
