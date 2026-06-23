"""
retriever.py – In-memory FAISS index with per-document add/remove support.

Stores raw embeddings alongside chunks so documents can be removed without
re-calling the embedding API. Memory-safe for Render 512 MB.
"""

import numpy as np
import faiss

from .embeddings import (
    embed_documents,
    embed_query
)
from .supabase_loader import load_all_documents, load_single_document

# ── In-memory state ──────────────────────────────────────────────────────────

_index = None                # faiss.IndexFlatL2
_chunks: list = []           # text chunks (parallel)
_meta: list = []             # {title, file_url} per chunk (parallel)
_raw_embeddings = None       # np.ndarray (N, dim) – kept for rebuild on delete
_chunk_doc_ids: list = []    # doc_id per chunk (parallel)
_indexed_doc_ids: set = set()


# ── Build full index (startup) ───────────────────────────────────────────────

def build_index():
    global _index, _chunks, _meta, _raw_embeddings, _chunk_doc_ids, _indexed_doc_ids

    print("[retriever] Building full index from Supabase ...")
    try:
        chunks, embeddings, meta, chunk_doc_ids = load_all_documents()
    except Exception as exc:
        print(f"[retriever] build_index failed: {exc}")
        _reset()
        return

    if not chunks or embeddings is None:
        print("[retriever] No indexable documents found.")
        _reset()
        return

    _raw_embeddings = np.ascontiguousarray(embeddings, dtype="float32")
    _index = _make_faiss(_raw_embeddings)
    _chunks = list(chunks)
    _meta = list(meta)
    _chunk_doc_ids = list(chunk_doc_ids)
    _indexed_doc_ids = set(chunk_doc_ids)

    print(f"[retriever] Index ready: {_index.ntotal} chunks, {len(_indexed_doc_ids)} doc(s).")


# ── Add single document ─────────────────────────────────────────────────────

def add_document(doc_id: str) -> dict:
    global _index, _chunks, _meta, _raw_embeddings, _chunk_doc_ids, _indexed_doc_ids

    doc_id = str(doc_id)

    # If already indexed, remove first (handles version updates)
    if doc_id in _indexed_doc_ids:
        remove_document(doc_id)

    try:
        chunks, embeddings, meta, chunk_doc_ids = load_single_document(doc_id)
    except Exception as exc:
        print(f"[retriever] add_document failed: {exc}")
        return {"added_chunks": 0, "total_chunks": len(_chunks)}

    if not chunks or embeddings is None:
        return {"added_chunks": 0, "total_chunks": len(_chunks)}

    new_emb = np.ascontiguousarray(embeddings, dtype="float32")

    if _index is None:
        _raw_embeddings = new_emb
        _index = _make_faiss(new_emb)
    else:
        _index.add(new_emb)
        _raw_embeddings = np.vstack([_raw_embeddings, new_emb])

    _chunks.extend(chunks)
    _meta.extend(meta)
    _chunk_doc_ids.extend(chunk_doc_ids)
    _indexed_doc_ids.add(doc_id)

    print(f"[retriever] Added {len(chunks)} chunks for doc {doc_id}. Total: {_index.ntotal}")
    return {"added_chunks": len(chunks), "total_chunks": _index.ntotal}


# ── Remove single document ──────────────────────────────────────────────────

def remove_document(doc_id: str) -> dict:
    global _index, _chunks, _meta, _raw_embeddings, _chunk_doc_ids, _indexed_doc_ids

    doc_id = str(doc_id)

    if doc_id not in _indexed_doc_ids:
        return {"removed_chunks": 0, "total_chunks": len(_chunks)}

    # Find which indices to keep
    keep = [i for i, d in enumerate(_chunk_doc_ids) if d != doc_id]
    removed = len(_chunks) - len(keep)

    _indexed_doc_ids.discard(doc_id)

    if not keep:
        _reset()
        print(f"[retriever] Removed {removed} chunks for doc {doc_id}. Index empty.")
        return {"removed_chunks": removed, "total_chunks": 0}

    _chunks[:] = [_chunks[i] for i in keep]
    _meta[:] = [_meta[i] for i in keep]
    _chunk_doc_ids[:] = [_chunk_doc_ids[i] for i in keep]
    _raw_embeddings = _raw_embeddings[keep]

    # Rebuild FAISS from remaining embeddings (no API call needed)
    _index = _make_faiss(_raw_embeddings)

    print(f"[retriever] Removed {removed} chunks for doc {doc_id}. Total: {_index.ntotal}")
    return {"removed_chunks": removed, "total_chunks": _index.ntotal}


# ── Search ───────────────────────────────────────────────────────────────────

def search_documents(question: str, top_k: int = 5) -> list:
    if _index is None or _index.ntotal == 0:
        return []

    q_emb = embed_query(question)
    distances, indices = _index.search(q_emb, min(top_k, _index.ntotal))

    results = []
    for i, idx in enumerate(indices[0]):
        if idx < 0:
            continue
        results.append({
            "chunk": _chunks[idx],
            "score": float(distances[0][i]),
            "title": _meta[idx].get("title", "") if idx < len(_meta) else "",
            "file_url": _meta[idx].get("file_url", "") if idx < len(_meta) else "",
        })
    return results


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_faiss(embeddings: np.ndarray):
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(np.ascontiguousarray(embeddings, dtype="float32"))
    return index


def _reset():
    global _index, _chunks, _meta, _raw_embeddings, _chunk_doc_ids, _indexed_doc_ids
    _index = None
    _chunks = []
    _meta = []
    _raw_embeddings = None
    _chunk_doc_ids = []
    _indexed_doc_ids = set()