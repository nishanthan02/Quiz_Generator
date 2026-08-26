# services/text_extractor.py
import logging
from pptx import Presentation
import pymupdf as fitz  # PyMuPDF
from services.tamil_font_converter import convert_legacy_tamil_to_unicode, _calculate_tamil_ratio
from services.ocr_fallback import extract_text_from_image

logger = logging.getLogger(__name__)

def detect_doc_profile(page: fitz.Page, text: str) -> dict:
    """
    Analyzes a single page to return its profile.
    Returns a dict with:
      is_scanned (bool): True if text is mostly empty and image coverage is high
      tamil_ratio (float): Ratio of Tamil unicode characters
      needs_font_check (bool): True if legacy font is suspected
    """
    profile = {
        "is_scanned": False,
        "tamil_ratio": 0.0,
        "needs_font_check": False
    }

    # Calculate Tamil ratio
    profile["tamil_ratio"] = _calculate_tamil_ratio(text)

    # Scanned detection
    word_count = len(text.split())
    if word_count < 15:
        # Check image coverage
        images = page.get_images(full=True)
        page_area = page.rect.width * page.rect.height
        if page_area > 0:
            for img in images:
                try:
                    bbox = page.get_image_bbox(img[0])
                    img_area = bbox.width * bbox.height
                    if img_area / page_area > 0.70:
                        profile["is_scanned"] = True
                        break
                except Exception:
                    pass

    # Legacy font detection
    # Text exists, but ratio is low, and known fonts exist
    if not profile["is_scanned"] and profile["tamil_ratio"] < 0.3:
        legacy_keywords = {"bamini", "vanavil", "tscii", "anjal", "shree", "softview", "nakkeeran", "tab", "tam", "amudham", "mylai", "koeln", "adaikalamatha"}
        for font_tuple in page.get_fonts(full=True):
            font_name = font_tuple[3].lower()
            if any(k in font_name for k in legacy_keywords):
                profile["needs_font_check"] = True
                break

    return profile


def extract_text_from_pdf(
    file_bytes: bytes,
    declared_language: str | None = "auto",
    doc_type: str | None = None,
    start_page: int | None = None,
    end_page: int | None = None,
) -> tuple[str, list[int]]:
    """
    Extract text with fallback cascade: PyMuPDF -> Font Conversion -> OCR.
    Returns (extracted_text, list_of_failed_page_numbers)
    """
    text_parts = []
    failed_pages = []
    
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        if doc.needs_pass:
            raise ValueError("Document is password-protected and cannot be processed.")
            
        start_idx = max(0, start_page - 1) if start_page is not None else 0
        end_idx = min(len(doc), end_page) if end_page is not None else len(doc)
        
        for i in range(start_idx, end_idx):
            page = doc[i]
            
            # 1. Base Extraction (includes inline tables)
            page_text = page.get_text("text")
            
            # Add tables inline
            tables = page.find_tables()
            if tables:
                for table in tables:
                    md_table = table.to_markdown()
                    if md_table:
                        page_text += f"\n\n{md_table}\n\n"
            
            # 2. Profile the page
            profile = detect_doc_profile(page, page_text)
            
            # Use user overrides if provided
            is_scanned = profile["is_scanned"]
            if doc_type == "scanned":
                is_scanned = True
            
            needs_font_check = profile["needs_font_check"]
            if doc_type == "legacy_tamil":
                needs_font_check = True

            # If user declared Tamil, but ratio is extremely low, trigger font check
            if declared_language == "tamil" and not is_scanned and profile["tamil_ratio"] < 0.1:
                needs_font_check = True
            
            # 3. Apply Legacy Font Conversion if needed
            if needs_font_check and not is_scanned:
                converted_text = convert_legacy_tamil_to_unicode(page_text)
                if _calculate_tamil_ratio(converted_text) > 0.6:
                    page_text = converted_text
                else:
                    # Conversion failed to yield good Tamil, maybe it's really scanned or garbled
                    is_scanned = True 

            # 4. Apply OCR Fallback if scanned or conversion failed
            if is_scanned:
                logger.info(f"Triggering OCR for page {i+1}")
                pix = page.get_pixmap(dpi=150)
                image_bytes = pix.tobytes("png")
                ocr_text = extract_text_from_image(image_bytes, "image/png")
                if ocr_text:
                    page_text = ocr_text
                else:
                    logger.error(f"All OCR fallbacks failed for page {i+1}")
                    failed_pages.append(i + 1)
                    page_text = ""

            if page_text.strip():
                text_parts.append(page_text.strip())

    return "\n\n".join(text_parts), failed_pages


def extract_text_from_pptx(
    file_bytes: bytes,
    start_page: int | None = None,
    end_page: int | None = None,
) -> tuple[str, list[int]]:
    import io
    prs = Presentation(io.BytesIO(file_bytes))
    text_runs = []
    
    slides = list(prs.slides)
    start_idx = max(0, start_page - 1) if start_page is not None else 0
    end_idx = min(len(slides), end_page) if end_page is not None else len(slides)
    
    for slide in slides[start_idx:end_idx]:
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                text_runs.append(shape.text.strip())
    return "\n".join(text_runs), []


def extract_text(
    file_bytes: bytes,
    filename: str,
    declared_language: str | None = "auto",
    doc_type: str | None = None,
    start_page: int | None = None,
    end_page: int | None = None,
) -> tuple[str, dict]:
    """
    Main entry point: dispatch to the correct extractor based on file extension.
    Returns (text, detection_metadata)
    """
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext == "pptx":
        text, failed = extract_text_from_pptx(file_bytes, start_page, end_page)
        return text, {"language": declared_language, "doc_type": "digital", "failed_pages": failed}

    elif ext == "pdf":
        text, failed = extract_text_from_pdf(
            file_bytes, 
            declared_language=declared_language,
            doc_type=doc_type,
            start_page=start_page, 
            end_page=end_page
        )
        return text, {"language": declared_language, "doc_type": doc_type or "auto", "failed_pages": failed}

    else:
        raise ValueError(
            f"Unsupported file type '.{ext}'. "
            "Only .pdf and .pptx are accepted."
        )


def chunk_text(
    text: str,
    chunk_size: int = 250,
    overlap: int = 50,
) -> list[str]:
    words = text.split()
    if not words:
        return []

    chunks = []
    step = chunk_size - overlap 

    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + chunk_size])
        if chunk.strip():
            chunks.append(chunk)

        if start + chunk_size >= len(words):
            break

    return chunks
