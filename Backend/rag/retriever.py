"""
retriever.py
------------
Manages an in-memory FAISS index built from Supabase documents.

Falls back to disk-based FAISS index if no in-memory index exists.
"""

import os
import faiss
import pickle
import numpy as np

from .embeddings import generate_embeddings
from .supabase_loader import load_all_documents
from .vector_store import create_index as _create_faiss_index


# ─────────────────────────────────────────────────────────────
# In-memory state
# ─────────────────────────────────────────────────────────────

_index = None
_chunks = []
_meta = []


# ─────────────────────────────────────────────────────────────
# Build index from Supabase documents
# ─────────────────────────────────────────────────────────────

def build_index():

    global _index, _chunks, _meta

    chunks, embeddings, doc_map = load_all_documents()

    if not chunks or embeddings is None:

        print("[retriever] No chunks found.")

        _index = None
        _chunks = []
        _meta = []

        return

    embeddings = np.ascontiguousarray(
        embeddings,
        dtype="float32"
    )

    _index = _create_faiss_index(
        embeddings
    )

    _chunks = chunks
    _meta = doc_map

    print(
        f"[retriever] Indexed {_index.ntotal} chunks."
    )


# ─────────────────────────────────────────────────────────────
# Search
# ─────────────────────────────────────────────────────────────

def search_documents(
    question,
    top_k=5
):

    idx, chunks, meta = _get_index()

    if idx is None or idx.ntotal == 0:
        return []

    question_embedding = generate_embeddings([question])

    distances, indices = idx.search(
        question_embedding,
        min(top_k, idx.ntotal)
    )

    results = []

    for i, doc_idx in enumerate(indices[0]):

        if doc_idx < 0:
            continue

        item = {
            "chunk": chunks[doc_idx],
            "score": float(
                distances[0][i]
            )
        }

        if meta and doc_idx < len(meta):

            item["title"] = meta[doc_idx].get(
                "title",
                ""
            )

            item["file_url"] = meta[doc_idx].get(
                "file_url",
                ""
            )

        results.append(item)

    return results


# ─────────────────────────────────────────────────────────────
# Get active index
# ─────────────────────────────────────────────────────────────

def _get_index():

    global _index, _chunks, _meta

    # Use in-memory index first

    if _index is not None:

        return (
            _index,
            _chunks,
            _meta
        )

    # ---------------------------------------------------------
    # Disk fallback
    # ---------------------------------------------------------

    BASE_DIR = os.path.dirname(
        os.path.dirname(__file__)
    )

    disk_index_path = os.path.join(
        BASE_DIR,
        "faiss",
        "index.faiss"
    )

    disk_meta_path = os.path.join(
        BASE_DIR,
        "faiss",
        "metadata.pkl"
    )

    if (
        os.path.exists(disk_index_path)
        and
        os.path.exists(disk_meta_path)
    ):

        print(
            "[retriever] Loading FAISS index from disk..."
        )

        idx = faiss.read_index(
            disk_index_path
        )

        with open(
            disk_meta_path,
            "rb"
        ) as f:

            chunks = pickle.load(f)

        return (
            idx,
            chunks,
            []
        )

    return (
        None,
        [],
        []
    )