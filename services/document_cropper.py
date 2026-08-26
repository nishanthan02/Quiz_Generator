import io

def crop_document_bytes(file_bytes: bytes, filename: str, start_page: int | None, end_page: int | None) -> bytes:
    """
    Crops a PDF or PPTX file to the specified page/slide range.
    Returns the cropped file bytes. If no range is specified or cropping fails,
    returns the original file bytes.

    NOTE: fitz (PyMuPDF) is imported lazily inside this function so that a
    broken PyMuPDF installation (e.g. missing DLL) never crashes the server at
    startup. If fitz is unavailable, a warning is logged and the full file is
    used as-is — uploads still succeed, just without page-range cropping.
    """
    if start_page is None and end_page is None:
        return file_bytes
        
    lower_filename = filename.lower()
    
    # ── PDF Cropping ──
    if lower_filename.endswith(".pdf"):
        try:
            import pymupdf as fitz  # lazy import — DLL errors stay contained here
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            total_pages = len(doc)
            
            # 1-indexed to 0-indexed bounds
            s_idx = max(0, (start_page or 1) - 1)
            e_idx = min(total_pages - 1, (end_page or total_pages) - 1)
            
            if s_idx == 0 and e_idx == total_pages - 1:
                doc.close()
                return file_bytes  # No cropping needed
                
            doc.select(list(range(s_idx, e_idx + 1)))
            # tobytes() is the current API; write() is deprecated in newer PyMuPDF
            cropped = doc.tobytes()
            doc.close()
            return cropped
        except ImportError as e:
            print(f"[Cropper] PyMuPDF not available ({e}) — page-range cropping skipped, full file used.")
            return file_bytes
        except Exception as e:
            print(f"[Cropper] Failed to crop PDF '{filename}': {e}")
            return file_bytes
            
    # ── PPTX Cropping ──
    elif lower_filename.endswith(".pptx"):
        try:
            from pptx import Presentation
            prs = Presentation(io.BytesIO(file_bytes))
            xml_slides = prs.slides._sldIdLst
            slides = list(xml_slides)
            total_slides = len(slides)
            
            # 1-indexed to 0-indexed bounds
            s_idx = max(0, (start_page or 1) - 1)
            e_idx = min(total_slides - 1, (end_page or total_slides) - 1)
            
            if s_idx == 0 and e_idx == total_slides - 1:
                return file_bytes
                
            slides_to_keep = set(range(s_idx, e_idx + 1))
            
            for i, slide in enumerate(slides):
                if i not in slides_to_keep:
                    xml_slides.remove(slide)
                    
            out_stream = io.BytesIO()
            prs.save(out_stream)
            return out_stream.getvalue()
        except Exception as e:
            print(f"[Cropper] Failed to crop PPTX '{filename}': {e}")
            return file_bytes
            
    # Unsupported formats just return original
    return file_bytes
