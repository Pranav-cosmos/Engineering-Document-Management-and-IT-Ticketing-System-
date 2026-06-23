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


def search_documents(question: str, top_k: int = 5) -> list:
    """
    Embed *question* and perform a pgvector similarity search.

    Returns
    -------
    List of dicts: [{"chunk", "title", "file_url", "similarity", ...}]
    """
    return search_chunks(question, top_k=top_k)