"""
supabase_loader.py
------------------
Downloads every document stored in the Supabase `documents` table,
extracts text, chunks it, and returns (chunks, embeddings, meta) so
the retriever can build an in-memory FAISS index.

The `file_url` column in the database stores a **storage path**
(e.g. "userId/1718123456-report.pdf"), not a full URL.
We generate a public URL via the Supabase storage API.

Supported formats: PDF, DOCX/DOC, TXT
"""

import os
import tempfile
import requests
from supabase import create_client

from .document_processor import extract_text
from .chunker import create_chunks
from .embeddings import generate_embeddings

# ── Supabase client (lazy - created on first use after dotenv loads) ──────────

STORAGE_BUCKET = "Documents"

_supabase = None


def _get_client():
    """Return (or create) the Supabase client.
    Lazy so env vars are read only after load_dotenv() has run in app.py."""
    global _supabase
    if _supabase is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_KEY", "")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set in Backend/.env"
            )
        _supabase = create_client(url, key)
    return _supabase


# ── Public API ────────────────────────────────────────────────────────────────

def load_all_documents():
    """
    Fetches every row from the `documents` table, downloads each file
    from Supabase Storage, and returns:
        chunks     : list[str]    - all text chunks across all docs
        embeddings : np.ndarray   - shape (N, 384) float32, or None
        doc_map    : list[dict]   - parallel to chunks: {title, file_url}
    """

    sb = _get_client()

    # 1. Pull document metadata
    response = sb.table("documents").select("id, title, file_url").execute()
    rows = response.data or []

    if not rows:
        print("[supabase_loader] No documents found in the database.")
        return [], None, []

    all_chunks = []
    all_meta   = []

    for doc in rows:
        title        = doc.get("title", "Untitled")
        storage_path = doc.get("file_url", "")

        if not storage_path:
            print(f"[supabase_loader] Skipping '{title}' - no file_url")
            continue

        print(f"[supabase_loader] Processing: {title}  ({storage_path})")

        try:
            # 2. Get public URL
            public_url = _get_public_url(storage_path)

            # 3. Determine extension
            ext = _guess_extension(storage_path)

            # Only index text-extractable formats
            if ext not in (".pdf", ".docx", ".doc", ".txt"):
                print(f"[supabase_loader]   -> Skipping unsupported format: {ext}")
                continue

            # 4. Download file bytes
            file_bytes = _download_file(public_url)

            # 5. Write to temp file for extract_text()
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name

            # 6. Extract text
            text = extract_text(tmp_path)
            os.unlink(tmp_path)

            if not text.strip():
                print(f"[supabase_loader]   -> Empty text, skipping.")
                continue

            # 7. Chunk
            chunks = create_chunks(text)
            print(f"[supabase_loader]   -> {len(chunks)} chunks")

            for chunk in chunks:
                all_chunks.append(chunk)
                all_meta.append({"title": title, "file_url": public_url})

        except Exception as exc:
            print(f"[supabase_loader] ERROR on '{title}': {exc}")
            continue

    if not all_chunks:
        return [], None, []

    # 8. Embed all chunks in one batch
    print(f"[supabase_loader] Embedding {len(all_chunks)} total chunks ...")
    embeddings = generate_embeddings(all_chunks)
    print("[supabase_loader] Done.")

    return all_chunks, embeddings, all_meta


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_public_url(storage_path):
    """Generate the public URL for a Supabase Storage object path."""
    sb = _get_client()
    result = sb.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)
    if isinstance(result, str):
        return result
    base = os.getenv("SUPABASE_URL", "")
    return f"{base}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"


def _download_file(url, storage_path=None):
    """Download file bytes from a public URL, with fallback to Supabase storage client."""
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        # Check if the response is actually the file (not an error page)
        content_type = resp.headers.get("content-type", "")
        if "html" in content_type and storage_path:
            raise ValueError("Got HTML instead of file – bucket may not be public")
        return resp.content
    except Exception as exc:
        if storage_path:
            print(f"[supabase_loader]   -> Public URL failed ({exc}), trying storage download...")
            sb = _get_client()
            result = sb.storage.from_(STORAGE_BUCKET).download(storage_path)
            if result:
                return result
        raise


def _guess_extension(path):
    """Extract file extension from a storage path; default to .pdf."""
    name = path.rsplit("/", 1)[-1].split("?")[0]
    if "." in name:
        return "." + name.rsplit(".", 1)[-1].lower()
    return ".pdf"
