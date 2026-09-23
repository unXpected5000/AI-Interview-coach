from pathlib import Path


ALLOWED_PDF_MIME_TYPES = {"application/pdf", "application/x-pdf"}


def is_pdf_file(filename: str, content_type: str | None) -> bool:
    suffix = Path(filename).suffix.lower()
    return suffix == ".pdf" and (content_type in ALLOWED_PDF_MIME_TYPES if content_type else True)

