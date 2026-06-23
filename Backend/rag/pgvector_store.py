"""
pgvector_store.py – Supabase pgvector integration for the EDMS RAG pipeline.

Responsibilities
----------------
1. upsert_document_chunks  – embed chunks and persist them to Supabase.
2. delete_document_chunks  – remove all chunks for a document_id.
3. search_chunks           – embed a query and call the match_chunks RPC.

All Supabase calls use the SERVICE_ROLE_KEY (via _get_service_client()) so
that RLS policies that block anon access do not interfere.
"""

from __future__ import annotations

import os
from typing import List, Dict, Any

from supabase import create_client, Client

from .embeddings import embed_documents, embed_query

# ── Supabase service-role client (NOT the anon client) ──────────────────────

_service_client: Client | None = None


def _get_service_client() -> Client:
    global _service_client
    if _service_client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

        # Graceful fallback: warn if service key is missing but try anon key
        # (useful during local dev where service key may not be set yet)
        if not key:
            key = os.getenv("SUPABASE_KEY", "")
            print(
                "[pgvector_store] WARNING: SUPABASE_SERVICE_ROLE_KEY not set. "
                "Falling back to SUPABASE_KEY (anon). "
                "Set the service-role key for production."
            )

        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )

        _service_client = create_client(url, key)
    return _service_client


TABLE = "document_chunks"
BATCH_SIZE = 50   # rows per Supabase insert call


# ── Public API ────────────────────────────────────────────────────────────────

def upsert_document_chunks(
    doc_id: str,
    title: str,
    file_url: str,
    chunks: List[str],
    document_version: int = 1,
) -> int:
    """
    Embed *chunks* and store them in Supabase, replacing any existing rows
    for *doc_id* (handles re-indexing when a new version is uploaded).

    Returns the number of chunk rows inserted.
    """
    if not chunks:
        print(f"[pgvector_store] No chunks for doc {doc_id} – skipping.")
        return 0

    # 1. Generate embeddings
    print(f"[pgvector_store] Embedding {len(chunks)} chunks for doc {doc_id} ...")
    embeddings = embed_documents(chunks)  # np.ndarray (N, 3072)

    if embeddings is None or len(embeddings) == 0:
        print(f"[pgvector_store] Embedding returned empty result for doc {doc_id}.")
        return 0

    # 2. Remove stale rows for this document
    delete_document_chunks(doc_id)

    # 3. Build rows
    rows = []
    for idx, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        rows.append({
            "document_id":       doc_id,
            "document_version":  document_version,
            "chunk_index":       idx,
            "chunk_text":        chunk,
            "embedding":         emb.tolist(),   # list[float] for JSON serialisation
            "title":             title,
            "file_url":          file_url,
        })

    # 4. Batch-insert
    sb = _get_service_client()
    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        resp = sb.table(TABLE).insert(batch).execute()
        inserted += len(resp.data or [])
        print(f"[pgvector_store]   Inserted batch {i // BATCH_SIZE + 1}: {len(resp.data or [])} rows")

    print(f"[pgvector_store] Done. {inserted} chunks stored for doc {doc_id} (v{document_version}).")
    return inserted


def delete_document_chunks(doc_id: str) -> int:
    """
    Remove all chunk rows for *doc_id* from Supabase.
    Returns the number of deleted rows (may be 0 if doc was never indexed).
    """
    sb = _get_service_client()
    resp = sb.table(TABLE).delete().eq("document_id", str(doc_id)).execute()
    deleted = len(resp.data or [])
    if deleted:
        print(f"[pgvector_store] Deleted {deleted} chunk rows for doc {doc_id}.")
    return deleted


def search_chunks(question: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Embed *question*, call the Supabase match_chunks RPC, and return
    up to *top_k* results as:
        [{"chunk": str, "title": str, "file_url": str, "similarity": float}, ...]
    """
    q_emb = embed_query(question)

    if q_emb is None or len(q_emb) == 0:
        print("[pgvector_store] Query embedding failed – returning empty results.")
        return []

    # q_emb shape: (1, 3072) from embed_query; take the first row
    vector = q_emb[0].tolist()

    sb = _get_service_client()
    try:
        resp = sb.rpc(
            "match_chunks",
            {
                "query_embedding": vector,
                "match_count":     top_k,
                "filter_doc_id":   None,
            },
        ).execute()
    except Exception as exc:
        print(f"[pgvector_store] match_chunks RPC failed: {exc}")
        return []

    results = []
    for row in (resp.data or []):
        results.append({
            "chunk":            row.get("chunk_text", ""),
            "title":            row.get("title", ""),
            "file_url":         row.get("file_url", ""),
            "similarity":       float(row.get("similarity", 0.0)),
            "document_id":      row.get("document_id", ""),
            "document_version": row.get("document_version", 1),
            "chunk_index":      row.get("chunk_index", 0),
        })

    print(f"[pgvector_store] search returned {len(results)} chunks for query.")
    return results
