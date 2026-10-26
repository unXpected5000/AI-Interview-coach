from app.utils.file_validation import is_pdf_file


def test_accepts_valid_pdf_with_browser_generic_binary_mime_type() -> None:
    assert is_pdf_file(
        "resume.pdf",
        "application/octet-stream",
        b"%PDF-1.7\nvalid PDF data",
    )


def test_accepts_valid_pdf_with_mime_parameters_and_short_preamble() -> None:
    assert is_pdf_file(
        "resume.PDF",
        "application/pdf; charset=binary",
        b"\n%PDF-1.4\nvalid PDF data",
    )


def test_rejects_non_pdf_mime_even_when_extension_and_bytes_look_like_pdf() -> None:
    assert not is_pdf_file("resume.pdf", "image/png", b"%PDF-1.7")


def test_rejects_file_without_pdf_header() -> None:
    assert not is_pdf_file("resume.pdf", "application/octet-stream", b"not a pdf")


def test_rejects_non_pdf_extension() -> None:
    assert not is_pdf_file("resume.txt", "application/pdf", b"%PDF-1.7")
