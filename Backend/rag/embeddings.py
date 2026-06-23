"""
embeddings.py
-------------
Embeds text using Google's embedding-001 model (v1beta compatible).

KEY FIX: embed_content is called with a SINGLE string per call.
Passing a list can return 1 combined embedding instead of N separate ones —
which caused the "always same chunk" bug.
"""

import numpy as np
from .gemini_client import client

_MODEL = "models/embedding-001"


def embed_documents(chunks: list[str]) -> np.ndarray:
    """Embed document chunks for indexing (RETRIEVAL_DOCUMENT task)."""
    return _embed_one_by_one(chunks, "RETRIEVAL_DOCUMENT")


def embed_query(question: str) -> np.ndarray:
    """Embed a search query (RETRIEVAL_QUERY task). Returns shape (1, dim)."""
    return _embed_one_by_one([question], "RETRIEVAL_QUERY")


def _embed_one_by_one(texts: list[str], task_type: str) -> np.ndarray:
    """
    Calls embed_content ONCE PER STRING — guarantees one embedding per text.
    Using a list in `contents` can silently return only 1 embedding total.
    """
    print(f"[embeddings] Embedding {len(texts)} text(s) | {_MODEL} | {task_type}")
    results = []

    for i, text in enumerate(texts):
        resp = client.models.embed_content(
            model=_MODEL,
            contents=text,
            config={"task_type": task_type},
        )
        results.append(resp.embeddings[0].values)

    arr = np.array(results, dtype="float32")
    print(f"[embeddings] Done — shape {arr.shape}")
    return arr