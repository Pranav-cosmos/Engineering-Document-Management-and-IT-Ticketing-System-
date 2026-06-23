"""
supabase_loader.py – Downloads a document from Supabase Storage, extracts
text, and returns plain chunks.

This module is intentionally thin: it does NOT embed or store anything.
Embedding and pgvector insertion are handled by pgvector_store.py so that
the two concerns stay separated.
"""

from __future__ import annotations

import os
import tempfile
from typing import Tuple, List

import requests
from supabase import create_client, Client

from .document_processor import extract_text
from .chunker import create_chunks

STORAGE_BUCKET = "Documents"

_supabase: Client | None = None


def _get_client() -> Client:
    global _supabase
    if _supabase is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
        _supabase = create_client(url, key)
    return _supabase


# ── Public API ────────────────────────────────────────────────────────────────

def load_and_chunk_document(doc_id: str) -> Tuple[List[str], str, str, int]:
    """
    Fetch a document row from the `documents` table, download the file from
    Supabase Storage, extract its text, and split it into chunks.

    Returns
    -------
    (chunks, title, file_url, document_version)
        chunks           – list of text strings ready for embedding
        title            – document title (for attribution in search results)
        file_url         – storage path (used to build public URL in results)
        document_version – current version number from the documents table
    """
    sb = _get_client()
    resp = (
        sb.table("documents")
        .select("id, title, file_url, version")
        .eq("id", str(doc_id))
        .single()
        .execute()
    )

    row = resp.data
    if not row:
        print(f"[loader] Document {doc_id} not found.")
        return [], "", "", 1

    title            = row.get("title", "Untitled")
    storage_path     = row.get("file_url", "")
    document_version = row.get("version", 1) or 1

    if not storage_path:
        print(f"[loader] Document {doc_id} has no file_url.")
        return [], title, "", document_version

    ext = _guess_ext(storage_path)
    if ext not in (".pdf", ".docx", ".doc", ".txt"):
        print(f"[loader] Skipping '{title}' – unsupported extension: {ext}")
        return [], title, storage_path, document_version

    print(f"[loader] Processing: {title} (v{document_version})")

    try:
        public_url = _get_public_url(storage_path)
        file_bytes = _download(public_url, storage_path)

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        text = extract_text(tmp_path)
        os.unlink(tmp_path)

        if not text.strip():
            print(f"[loader]   -> Empty text for '{title}', skipping.")
            return [], title, public_url, document_version

        chunks = create_chunks(text)
        print(f"[loader]   -> {len(chunks)} chunks for '{title}'")
        return chunks, title, public_url, document_version

    except Exception as exc:
        print(f"[loader] ERROR processing '{title}': {exc}")
        return [], title, storage_path, document_version


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_public_url(storage_path: str) -> str:
    sb = _get_client()
    result = sb.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)
    if isinstance(result, str):
        return result
    base = os.getenv("SUPABASE_URL", "")
    return f"{base}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"


def _download(url: str, storage_path: str | None = None) -> bytes:
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        if "html" in resp.headers.get("content-type", "") and storage_path:
            raise ValueError("Got HTML instead of file content")
        return resp.content
    except Exception:
        if storage_path:
            print("[loader]   -> Public URL failed, trying storage SDK download …")
            sb = _get_client()
            result = sb.storage.from_(STORAGE_BUCKET).download(storage_path)
            if result:
                return result
        raise


def _guess_ext(path: str) -> str:
    name = path.rsplit("/", 1)[-1].split("?")[0]
    if "." in name:
        return "." + name.rsplit(".", 1)[-1].lower()
    return ".pdf"
