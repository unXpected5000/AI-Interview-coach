from pathlib import Path


ALLOWED_PDF_MIME_TYPES = {"application/pdf", "application/x-pdf"}
GENERIC_BINARY_MIME_TYPES = {"application/octet-stream", "binary/octet-stream"}


def is_pdf_file(
    filename: str,
    content_type: str | None,
    file_bytes: bytes | None = None,
) -> bool:
    suffix = Path(filename).suffix.lower()
    if suffix != ".pdf":
        return False

    mime_type = (content_type or "").split(";", 1)[0].strip().lower()
    if mime_type and mime_type not in ALLOWED_PDF_MIME_TYPES | GENERIC_BINARY_MIME_TYPES:
        return False

    if file_bytes is None:
        return True

    # PDF producers may include a short preamble before the header. PyMuPDF
    # performs the full structural validation after this inexpensive sniff.
    return b"%PDF-" in file_bytes[:1024]

