"""
embeddings.py
-------------
Generates embeddings via the Gemini API.

Uses task_type to differentiate between:
  - RETRIEVAL_DOCUMENT  : when indexing document chunks at build time
  - RETRIEVAL_QUERY     : when embedding a user question at search time

Using the correct task type is required for accurate semantic search with
Gemini embedding models.
"""

import numpy as np
from .gemini_client import client

_MODEL = "gemini-embedding-exp-03-07"

# ── Public helpers ────────────────────────────────────────────────────────────

def embed_documents(chunks: list[str]) -> np.ndarray:
    """
    Embed a list of document chunks for indexing.
    Uses task_type=RETRIEVAL_DOCUMENT.
    Returns ndarray of shape (N, dim) float32.
    """
    return _embed(chunks, task_type="RETRIEVAL_DOCUMENT")


def embed_query(question: str) -> np.ndarray:
    """
    Embed a single query string for retrieval.
    Uses task_type=RETRIEVAL_QUERY.
    Returns ndarray of shape (1, dim) float32.
    """
    return _embed([question], task_type="RETRIEVAL_QUERY")


# ── Legacy wrapper (still used by retriever for search) ──────────────────────

def generate_embeddings(chunks: list[str]) -> np.ndarray:
    """
    Backward-compatible wrapper.
    - Called with a single-element list at query time -> uses RETRIEVAL_QUERY
    - Called with multiple chunks at index time      -> uses RETRIEVAL_DOCUMENT
    """
    if len(chunks) == 1:
        return embed_query(chunks[0])
    return embed_documents(chunks)


# ── Internal ──────────────────────────────────────────────────────────────────

def _embed(texts: list[str], task_type: str) -> np.ndarray:
    """
    Call the Gemini embed_content API in batches and return a float32 ndarray.
    Sends each string individually to avoid batch-handling quirks in the API.
    """
    print(f"[embeddings] Embedding {len(texts)} text(s) with task_type={task_type} ...")

    batch_size = 20          # keep batches small to stay within limits
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        try:
            response = client.models.embed_content(
                model=_MODEL,
                contents=batch,
                config={"task_type": task_type},
            )
            batch_embeddings = [emb.values for emb in response.embeddings]
            all_embeddings.extend(batch_embeddings)
        except Exception as exc:
            # Try falling back: embed each text individually
            print(f"[embeddings] Batch embed failed ({exc}), retrying one by one ...")
            for text in batch:
                try:
                    resp = client.models.embed_content(
                        model=_MODEL,
                        contents=text,
                        config={"task_type": task_type},
                    )
                    all_embeddings.append(resp.embeddings[0].values)
                except Exception as inner_exc:
                    raise RuntimeError(
                        f"[embeddings] Could not embed text: {inner_exc}"
                    ) from inner_exc

    arr = np.array(all_embeddings, dtype="float32")
    print(f"[embeddings] Done. Shape: {arr.shape}")
    return arr