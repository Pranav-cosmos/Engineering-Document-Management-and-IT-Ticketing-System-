"""
embeddings.py
-------------
Generates embeddings using text-embedding-004 via the Gemini v1 API.

CRITICAL: embed_content is called with ONE STRING at a time.
Passing a list to `contents` returns 1 combined embedding (not N separate ones),
which caused every query to always hit the same single FAISS chunk.
"""

import numpy as np
from .gemini_client import embed_client

_MODEL = "text-embedding-004"


def embed_documents(chunks: list[str]) -> np.ndarray:
    """Embed document chunks for indexing. Uses RETRIEVAL_DOCUMENT task."""
    return _embed_one_by_one(chunks, "RETRIEVAL_DOCUMENT")


def embed_query(question: str) -> np.ndarray:
    """Embed a search query. Uses RETRIEVAL_QUERY task. Returns shape (1, dim)."""
    return _embed_one_by_one([question], "RETRIEVAL_QUERY")


def _embed_one_by_one(texts: list[str], task_type: str) -> np.ndarray:
    """
    Calls embed_content ONCE PER STRING — guarantees one embedding per text.
    DO NOT pass a list to `contents`; the API collapses it to 1 embedding.
    """
    print(f"[embeddings] Embedding {len(texts)} text(s) | {_MODEL} | {task_type}")
    results = []

    for text in texts:
        resp = embed_client.models.embed_content(
            model=_MODEL,
            contents=text,
            config={"task_type": task_type},
        )
        results.append(resp.embeddings[0].values)

    arr = np.array(results, dtype="float32")
    print(f"[embeddings] Done — shape {arr.shape}")
    return arr