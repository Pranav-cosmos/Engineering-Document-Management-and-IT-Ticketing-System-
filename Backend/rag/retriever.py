"""
retriever.py – pgvector-backed retriever (replaces in-memory FAISS).

Public API is unchanged so that app.py requires no edits:
    build_index()           → no-op (embeddings are persisted in Supabase)
    add_document(doc_id)    → download + chunk + embed + upsert to pgvector
    remove_document(doc_id) → delete rows from document_chunks
    search_documents(q)     → vector similarity search via Supabase RPC
"""

from __future__ import annotations

from .supabase_loader import load_and_chunk_document
from .pgvector_store import (
    upsert_document_chunks,
    delete_document_chunks,
    search_chunks,
    _get_service_client,
)


# ── Public API ────────────────────────────────────────────────────────────────

def build_index() -> None:
    """
    No-op in pgvector mode.

    Embeddings are stored permanently in Supabase.  There is no in-memory
    index to build at startup, which means cold-starts are instant.
    """
    print("[retriever] pgvector mode – no startup indexing required.")


def add_document(doc_id: str) -> dict:
    """
    Process and index a single document into the Supabase pgvector table.

    Steps
    -----
    1. Download file from Supabase Storage.
    2. Extract text (PDF / DOCX / TXT).
    3. Split into chunks.
    4. Embed with Gemini gemini-embedding-2.
    5. Upsert into document_chunks (deletes old rows first).

    Returns
    -------
    {"added_chunks": int, "document_version": int}
    """
    doc_id = str(doc_id)
    print(f"[retriever] Indexing document {doc_id} …")

    chunks, title, file_url, document_version = load_and_chunk_document(doc_id)

    if not chunks:
        print(f"[retriever] No chunks for doc {doc_id} – skipping.")
        return {"added_chunks": 0, "document_version": document_version}

    n = upsert_document_chunks(
        doc_id=doc_id,
        title=title,
        file_url=file_url,
        chunks=chunks,
        document_version=document_version,
    )

    return {"added_chunks": n, "document_version": document_version}


def remove_document(doc_id: str) -> dict:
    """
    Remove all chunk rows for *doc_id* from Supabase.

    Returns
    -------
    {"removed_chunks": int}
    """
    doc_id = str(doc_id)
    print(f"[retriever] Removing document {doc_id} from pgvector store …")
    n = delete_document_chunks(doc_id)
    return {"removed_chunks": n}


def list_indexable_documents() -> list[dict]:
    """
    Return all current document rows that have a stored file.

    Used by the rebuild endpoint so Render deployments can repopulate
    pgvector from Supabase instead of depending on local files or warm memory.
    """
    sb = _get_service_client()
    resp = (
        sb.table("documents")
        .select("id, title, file_url, version")
        .order("created_at", desc=False)
        .execute()
    )
    return [doc for doc in (resp.data or []) if doc.get("file_url")]


def rebuild_index() -> dict:
    """
    Re-index every document currently recorded in Supabase.

    This is intentionally synchronous: on Render free tier there is no durable
    local worker or disk-backed queue, so the request itself does the work and
    persisted pgvector rows survive cold starts.
    """
    docs = list_indexable_documents()
    indexed = []
    failed = []

    for doc in docs:
        doc_id = str(doc.get("id", ""))
        if not doc_id:
            continue

        try:
            result = add_document(doc_id)
            indexed.append({
                "doc_id": doc_id,
                "title": doc.get("title", ""),
                **result,
            })
        except Exception as exc:
            failed.append({
                "doc_id": doc_id,
                "title": doc.get("title", ""),
                "error": str(exc),
            })

    return {
        "documents_seen": len(docs),
        "documents_indexed": len(indexed),
        "documents_failed": len(failed),
        "indexed": indexed,
        "failed": failed,
    }


def _normalise(text: str) -> str:
    return " ".join((text or "").lower().split())


def resolve_document_from_question(question: str) -> dict | None:
    """
    If the question explicitly mentions a known document title, return it.

    Vector search only sees chunk text. Titles such as "Safety SOP" or
    "Resume" may not appear inside every chunk, so metadata-aware filtering is
    needed for document-specific questions.
    """
    q = _normalise(question)
    if not q:
        return None

    docs = list_indexable_documents()
    best_doc = None
    best_score = 0

    for doc in docs:
        title = _normalise(doc.get("title", ""))
        if not title:
            continue

        if title in q:
            score = len(title)
        else:
            words = [word for word in title.split() if len(word) >= 3]
            matches = sum(1 for word in words if word in q)
            score = matches * 10 if words and matches == len(words) else 0

        if score > best_score:
            best_doc = doc
            best_score = score

    if best_doc and best_score >= 10:
        return best_doc
    return None


def search_documents(question: str, top_k: int = 5) -> list:
    """
    Embed *question* and perform a pgvector similarity search.

    Returns
    -------
    List of dicts: [{"chunk", "title", "file_url", "similarity", ...}]
    """
    selected_doc = resolve_document_from_question(question)
    filter_doc_id = str(selected_doc["id"]) if selected_doc else None
    if selected_doc:
        print(
            "[retriever] Document-specific query matched "
            f"'{selected_doc.get('title', '')}' ({filter_doc_id})."
        )

    return search_chunks(question, top_k=top_k, filter_doc_id=filter_doc_id)
