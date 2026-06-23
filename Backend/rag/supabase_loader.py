"""
supabase_loader.py – Downloads documents from Supabase, extracts text, chunks,
and embeds them.  Supports loading all docs or a single doc by ID.
"""

import os, tempfile, requests
from supabase import create_client

from .document_processor import extract_text
from .chunker import create_chunks
from .embeddings import (
    embed_documents,
    embed_query
)
STORAGE_BUCKET = "Documents"
_supabase = None


def _get_client():
    global _supabase
    if _supabase is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
        _supabase = create_client(url, key)
    return _supabase


# ── Public API ────────────────────────────────────────────────────────────────

def load_all_documents():
    """Load every document. Returns (chunks, embeddings, meta, chunk_doc_ids)."""
    sb = _get_client()
    response = sb.table("documents").select("id, title, file_url").execute()
    rows = response.data or []
    if not rows:
        print("[loader] No documents in database.")
        return [], None, [], []
    return _process_rows(rows)


def load_single_document(doc_id):
    """Load one document by ID. Returns (chunks, embeddings, meta, chunk_doc_ids)."""
    sb = _get_client()
    response = sb.table("documents").select("id, title, file_url").eq("id", str(doc_id)).execute()
    rows = response.data or []
    if not rows:
        print(f"[loader] Document {doc_id} not found.")
        return [], None, [], []
    return _process_rows(rows)


# ── Internal ──────────────────────────────────────────────────────────────────

def _process_rows(rows):
    all_chunks = []
    all_meta = []
    chunk_doc_ids = []

    for doc in rows:
        doc_id = doc.get("id")
        title = doc.get("title", "Untitled")
        storage_path = doc.get("file_url", "")

        if not storage_path:
            continue

        ext = _guess_ext(storage_path)
        if ext not in (".pdf", ".docx", ".doc", ".txt"):
            print(f"[loader] Skipping '{title}' – unsupported: {ext}")
            continue

        print(f"[loader] Processing: {title}")
        try:
            public_url = _get_public_url(storage_path)
            file_bytes = _download(public_url, storage_path)

            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name

            text = extract_text(tmp_path)
            os.unlink(tmp_path)

            if not text.strip():
                print(f"[loader]   -> Empty text, skipping.")
                continue

            chunks = create_chunks(text)
            print(f"[loader]   -> {len(chunks)} chunks")

            for c in chunks:
                all_chunks.append(c)
                all_meta.append({"title": title, "file_url": public_url})
                chunk_doc_ids.append(doc_id)

        except Exception as exc:
            print(f"[loader] ERROR on '{title}': {exc}")
            continue

    if not all_chunks:
        return [], None, [], []

    print(f"[loader] Embedding {len(all_chunks)} chunks ...")
    embeddings = embed_documents(all_chunks)
    return all_chunks, embeddings, all_meta, chunk_doc_ids


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_public_url(storage_path):
    sb = _get_client()
    result = sb.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)
    if isinstance(result, str):
        return result
    base = os.getenv("SUPABASE_URL", "")
    return f"{base}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"


def _download(url, storage_path=None):
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        if "html" in resp.headers.get("content-type", "") and storage_path:
            raise ValueError("Got HTML instead of file")
        return resp.content
    except Exception as exc:
        if storage_path:
            print(f"[loader]   -> Public URL failed, trying storage download...")
            sb = _get_client()
            result = sb.storage.from_(STORAGE_BUCKET).download(storage_path)
            if result:
                return result
        raise


def _guess_ext(path):
    name = path.rsplit("/", 1)[-1].split("?")[0]
    if "." in name:
        return "." + name.rsplit(".", 1)[-1].lower()
    return ".pdf"
