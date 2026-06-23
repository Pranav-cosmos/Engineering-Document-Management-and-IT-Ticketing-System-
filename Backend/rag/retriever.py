"""
retriever.py
------------
Manages an in-memory FAISS index built from Supabase documents.

Key design for low-memory / 512 MB Render instances:
 - build_index()           : builds the full index from all Supabase docs (called once at startup).
 - add_new_documents()     : incrementally embeds ONLY newly-uploaded docs and appends
                             their vectors to the existing index — avoids re-embedding
                             everything and blowing past the memory limit.
 - search_documents(query) : searches the in-memory index.
"""

import os
import numpy as np
import faiss

from .embeddings import embed_documents, embed_query
from .supabase_loader import load_all_documents, load_new_documents
from .vector_store import create_index as _create_faiss_index


# ─────────────────────────────────────────────────────────────
# In-memory state
# ─────────────────────────────────────────────────────────────

_index        = None   # faiss.Index
_chunks: list = []     # parallel list of text chunks
_meta:   list = []     # parallel list of {title, file_url}
_indexed_ids: set = set()  # document IDs already in the index


# ─────────────────────────────────────────────────────────────
# Build full index at startup
# ─────────────────────────────────────────────────────────────

def build_index():
    """
    Download ALL documents from Supabase, embed them, and build a fresh
    in-memory FAISS index.  Called once during FastAPI lifespan startup.
    """
    global _index, _chunks, _meta, _indexed_ids

    print("[retriever] build_index: loading all documents from Supabase …")

    try:
        chunks, embeddings, doc_map, indexed_ids = load_all_documents()
    except Exception as exc:
        print(f"[retriever] build_index failed: {exc}")
        _index = None
        _chunks = []
        _meta = []
        _indexed_ids = set()
        return

    if not chunks or embeddings is None:
        print("[retriever] No chunks found – index is empty.")
        _index = None
        _chunks = []
        _meta = []
        _indexed_ids = set()
        return

    embeddings = np.ascontiguousarray(embeddings, dtype="float32")
    _index      = _create_faiss_index(embeddings)
    _chunks     = list(chunks)
    _meta       = list(doc_map)
    _indexed_ids = set(indexed_ids)

    print(f"[retriever] Index built: {_index.ntotal} chunks from {len(_indexed_ids)} document(s).")


# ─────────────────────────────────────────────────────────────
# Incremental update (called by /index-documents endpoint)
# ─────────────────────────────────────────────────────────────

def add_new_documents():
    """
    Fetch ONLY documents that have not yet been embedded, embed them, and
    append their vectors to the existing in-memory FAISS index.

    This is memory-efficient because we never re-download or re-embed
    documents that are already indexed.

    Returns a summary dict: {added_chunks, added_docs, total_chunks}.
    """
    global _index, _chunks, _meta, _indexed_ids

    print(f"[retriever] add_new_documents: checking for new docs (already indexed: {len(_indexed_ids)}) …")

    try:
        new_chunks, new_embeddings, new_meta, new_ids = load_new_documents(_indexed_ids)
    except Exception as exc:
        print(f"[retriever] add_new_documents failed: {exc}")
        return {"added_chunks": 0, "added_docs": 0, "total_chunks": len(_chunks)}

    if not new_chunks or new_embeddings is None:
        print("[retriever] No new documents to add.")
        return {"added_chunks": 0, "added_docs": 0, "total_chunks": len(_chunks)}

    new_embeddings = np.ascontiguousarray(new_embeddings, dtype="float32")

    if _index is None:
        # First documents ever – create the index now
        _index = _create_faiss_index(new_embeddings)
    else:
        # Append to existing index
        _index.add(new_embeddings)

    _chunks.extend(new_chunks)
    _meta.extend(new_meta)
    _indexed_ids.update(new_ids)

    added_chunks = len(new_chunks)
    added_docs   = len(new_ids)
    print(f"[retriever] Added {added_chunks} chunks from {added_docs} new document(s). "
          f"Index total: {_index.ntotal} chunks.")

    return {
        "added_chunks": added_chunks,
        "added_docs":   added_docs,
        "total_chunks": _index.ntotal,
    }


# ─────────────────────────────────────────────────────────────
# Search
# ─────────────────────────────────────────────────────────────

def search_documents(question: str, top_k: int = 5) -> list:

    if _index is None or _index.ntotal == 0:
        print("[retriever] search_documents: index is empty.")
        return []

    question_embedding = embed_query(question)

    distances, indices = _index.search(
        question_embedding,
        min(top_k, _index.ntotal)
    )

    results = []
    for i, doc_idx in enumerate(indices[0]):
        if doc_idx < 0:
            continue

        item = {
            "chunk": _chunks[doc_idx],
            "score": float(distances[0][i]),
        }

        if _meta and doc_idx < len(_meta):
            item["title"]    = _meta[doc_idx].get("title", "")
            item["file_url"] = _meta[doc_idx].get("file_url", "")

        results.append(item)

    return results