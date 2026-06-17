import fitz
from docx import Document
from pathlib import Path


def extract_pdf(file_path):
    pdf = fitz.open(file_path)

    text = ""

    for page in pdf:
        text += page.get_text() + "\n"

    return text


def extract_docx(file_path):
    doc = Document(file_path)

    text = "\n".join(
        paragraph.text
        for paragraph in doc.paragraphs
    )

    return text


def extract_txt(file_path):
    with open(
        file_path,
        "r",
        encoding="utf-8",
        errors="ignore"
    ) as f:
        return f.read()


def extract_text(file_path):
    """
    Universal extractor for:
    pdf
    doc
    docx
    txt
    """

    suffix = Path(file_path).suffix.lower()

    if suffix == ".pdf":
        return extract_pdf(file_path)

    elif suffix in [".docx", ".doc"]:
        return extract_docx(file_path)

    elif suffix == ".txt":
        return extract_txt(file_path)

    else:
        raise ValueError(
            f"Unsupported file type: {suffix}"
        )