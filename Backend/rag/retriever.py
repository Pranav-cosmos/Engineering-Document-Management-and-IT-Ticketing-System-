"""
retriever.py
------------
In-memory FAISS index over Supabase document chunks.

Functions:
  build_index()              — called at startup; embeds all docs
  add_new_documents()        — called after upload; only embeds new docs
  remove_document(doc_id)    — called after delete; removes chunks without re-embedding
  search_documents(question) — semantic search
"""

import numpy as np
import faiss

from .embeddings import embed_documents, embed_query
from .supabase_loader import load_all_documents, load_new_documents
from .vector_store import create_index as _create_faiss_index

# ── In-memory state ───────────────────────────────────────────────────────────

_index       = None        # faiss.IndexFlatL2
_chunks      = []          # list[str]  — parallel to index rows
_meta        = []          # list[dict] — {title, file_url, doc_id}
_embeddings  = None        # np.ndarray (N, dim) — stored so delete needs no re-embed
_indexed_ids = set()       # set of doc IDs already in the index


# ── Startup: build full index ─────────────────────────────────────────────────

def build_index():
    """Download ALL Supabase documents, embed, build FAISS. Called once at startup."""
    global _index, _chunks, _meta, _embeddings, _indexed_ids

    print("[retriever] build_index: fetching all documents …")
    try:
        chunks, embeddings, doc_map, indexed_ids = load_all_documents()
    except Exception as exc:
        import traceback
        print(f"[retriever] build_index FAILED:\n{traceback.format_exc()}")
        _reset()
        return

    if not chunks or embeddings is None:
        print("[retriever] No indexable documents found.")
        _reset()
        return

    embeddings = np.ascontiguousarray(embeddings, dtype="float32")
    _index       = _create_faiss_index(embeddings)
    _chunks      = list(chunks)
    _meta        = list(doc_map)
    _embeddings  = embeddings
    _indexed_ids = set(indexed_ids)
    print(f"[retriever] Built index: {_index.ntotal} chunks from {len(_indexed_ids)} doc(s).")


# ── On upload: add only new doc ───────────────────────────────────────────────

def add_new_documents():
    """Embed only newly-uploaded docs and append to the existing index."""
    global _index, _chunks, _meta, _embeddings, _indexed_ids

    print(f"[retriever] add_new_documents: known={len(_indexed_ids)} doc(s)")
    try:
        new_chunks, new_emb, new_meta, new_ids = load_new_documents(_indexed_ids)
    except Exception as exc:
        print(f"[retriever] add_new_documents error: {exc}")
        return {"added_chunks": 0, "added_docs": 0, "total_chunks": len(_chunks)}

    if not new_chunks or new_emb is None:
        print("[retriever] No new documents.")
        return {"added_chunks": 0, "added_docs": 0, "total_chunks": len(_chunks)}

    new_emb = np.ascontiguousarray(new_emb, dtype="float32")

    if _index is None:
        _index      = _create_faiss_index(new_emb)
        _embeddings = new_emb
    else:
        _index.add(new_emb)
        _embeddings = np.vstack([_embeddings, new_emb])

    _chunks.extend(new_chunks)
    _meta.extend(new_meta)
    _indexed_ids.update(new_ids)

    print(f"[retriever] Added {len(new_chunks)} chunks from {len(new_ids)} doc(s). Total: {_index.ntotal}")
    return {"added_chunks": len(new_chunks), "added_docs": len(new_ids), "total_chunks": _index.ntotal}


# ── On delete: remove doc chunks without re-embedding ────────────────────────

def remove_document(doc_id: str) -> dict:
    """
    Remove all chunks that belong to doc_id from the in-memory index.
    Uses the stored _embeddings array so no API calls are needed.
    """
    global _index, _chunks, _meta, _embeddings, _indexed_ids

    keep = [i for i, m in enumerate(_meta) if m.get("doc_id") != doc_id]
    removed = len(_chunks) - len(keep)

    if removed == 0:
        print(f"[retriever] remove_document: doc {doc_id} not found in index.")
        return {"removed_chunks": 0, "total_chunks": len(_chunks)}

    _chunks      = [_chunks[i] for i in keep]
    _meta        = [_meta[i]   for i in keep]
    _indexed_ids.discard(doc_id)

    if keep and _embeddings is not None:
        kept_emb    = np.ascontiguousarray(_embeddings[keep], dtype="float32")
        _embeddings = kept_emb
        _index      = _create_faiss_index(kept_emb)
    else:
        _embeddings = None
        _index      = None

    total = len(_chunks)
    print(f"[retriever] Removed {removed} chunks for doc {doc_id}. Remaining: {total}")
    return {"removed_chunks": removed, "total_chunks": total}


# ── Search ────────────────────────────────────────────────────────────────────

def search_documents(question: str, top_k: int = 5) -> list:
    if _index is None or _index.ntotal == 0:
        print("[retriever] Index is empty.")
        return []

    q_emb = embed_query(question)
    distances, indices = _index.search(q_emb, min(top_k, _index.ntotal))

    results = []
    for i, idx in enumerate(indices[0]):
        if idx < 0:
            continue
        item = {"chunk": _chunks[idx], "score": float(distances[0][i])}
        if _meta and idx < len(_meta):
            item["title"]    = _meta[idx].get("title", "")
            item["file_url"] = _meta[idx].get("file_url", "")
        results.append(item)

    return results


# ── Internal ──────────────────────────────────────────────────────────────────

def _reset():
    global _index, _chunks, _meta, _embeddings, _indexed_ids
    _index       = None
    _chunks      = []
    _meta        = []
    _embeddings  = None
    _indexed_ids = set()