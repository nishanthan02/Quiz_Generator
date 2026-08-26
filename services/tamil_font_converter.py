# services/tamil_font_converter.py
import tamil.txt2unicode

def convert_legacy_tamil_to_unicode(text: str) -> str:
    """
    Attempts to convert text from known legacy Tamil fonts (Bamini, TSCII, TAM, TAB)
    to standard Unicode.
    
    We try them in order of prevalence. After each attempt, we check if the 
    resulting text has a high density of Tamil Unicode characters.
    """
    if not text or not text.strip():
        return text

    # List of converter functions to try, in order of likelihood
    converters = [
        ("bamini", tamil.txt2unicode.bamini2unicode),
        ("tscii", tamil.txt2unicode.tscii2unicode),
        ("tam", tamil.txt2unicode.tam2unicode),
        ("tab", tamil.txt2unicode.tab2unicode),
    ]

    best_text = text
    best_ratio = _calculate_tamil_ratio(text)

    # If already high enough, return as is
    if best_ratio > 0.60:
        return text

    for name, converter in converters:
        try:
            converted = converter(text)
            ratio = _calculate_tamil_ratio(converted)
            
            if ratio > best_ratio:
                best_ratio = ratio
                best_text = converted
                
            # If we hit a very good ratio, we can short-circuit
            if ratio > 0.60:
                return converted
                
        except Exception as e:
            # If a converter fails, just try the next one
            continue

    return best_text


def _calculate_tamil_ratio(text: str) -> float:
    """
    Calculate the ratio of Tamil Unicode characters to total non-whitespace characters.
    """
    import re
    # Remove whitespace
    clean_text = re.sub(r'\s+', '', text)
    if not clean_text:
        return 0.0

    # Tamil Unicode block: U+0B80 to U+0BFF
    tamil_chars = [c for c in clean_text if '\u0B80' <= c <= '\u0BFF']
    
    # Also ignore standard punctuation when determining ratio to be fair
    alphanumeric_text = re.sub(r'[^\w]', '', clean_text)
    if not alphanumeric_text:
        return 0.0
        
    return len(tamil_chars) / len(alphanumeric_text)
