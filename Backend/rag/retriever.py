"""
retriever.py
------------
Manages an **in-memory** FAISS index that is built from Supabase
documents at startup and can be rebuilt on demand.
Falls back to on-disk index files if they exist and no in-memory
index has been built yet.
"""

import os
import faiss
import pickle
import numpy as np
from .embeddings import model
from .supabase_loader import load_all_documents
from .vector_store import create_index as _create_faiss_index

# ── In-memory state ──────────────────────────────────────────────────────────

_index   = None   # faiss.Index
_chunks  = []     # list[str]
_meta    = []     # list[dict]  – parallel to _chunks: {title, file_url}


# ── Public API ───────────────────────────────────────────────────────────────

def build_index():
    """
    Download all documents from Supabase, chunk + embed them,
    and store the FAISS index + metadata in memory.
    Called once at startup (via lifespan) and by /index-documents.
    """
    global _index, _chunks, _meta

    chunks, embeddings, doc_map = load_all_documents()

    if not chunks or embeddings is None:
        print("[retriever] No chunks to index – starting with empty index.")
        _index  = None
        _chunks = []
        _meta   = []
        return

    embeddings = np.ascontiguousarray(embeddings, dtype="float32")
    _index  = _create_faiss_index(embeddings)
    _chunks = chunks
    _meta   = doc_map
    print(f"[retriever] In-memory index built: {_index.ntotal} vectors")


def search_documents(question, top_k=3):
    """
    Search the in-memory index.  Falls back to on-disk index files
    if `build_index()` hasn't been called yet.
    Returns list[dict] with keys: chunk, score, title, file_url
    """
    idx, chunks, meta = _get_index()

    if idx is None or idx.ntotal == 0:
        return []

    question_embedding = model.encode([question]).astype("float32")
    distances, indices = idx.search(question_embedding, min(top_k, idx.ntotal))

    results = []
    for i, doc_idx in enumerate(indices[0]):
        if doc_idx < 0:          # FAISS returns -1 for missing results
            continue
        entry = {
            "chunk": chunks[doc_idx],
            "score": float(distances[0][i]),
        }
        if meta and doc_idx < len(meta):
            entry["title"]    = meta[doc_idx].get("title", "")
            entry["file_url"] = meta[doc_idx].get("file_url", "")
        results.append(entry)

    return results


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_index():
    """Return (index, chunks, meta) – prefer in-memory, fall back to disk."""
    if _index is not None:
        return _index, _chunks, _meta

    # Try on-disk fallback (legacy path)
    disk_index_path = os.path.join(os.path.dirname(__file__), "faiss", "index.faiss")
    disk_meta_path  = os.path.join(os.path.dirname(__file__), "faiss", "metadata.pkl")

    if os.path.exists(disk_index_path) and os.path.exists(disk_meta_path):
        print("[retriever] Loading on-disk FAISS index as fallback …")
        idx = faiss.read_index(disk_index_path)
        with open(disk_meta_path, "rb") as f:
            chunks = pickle.load(f)
        # On-disk legacy format stores only chunk strings, no meta
        return idx, chunks, []

    return None, [], []