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
from google.genai import types as genai_types
from .gemini_client import embed_client

# text-embedding-004 is stable, universally available, and supports task_type
_MODEL = "text-embedding-004"

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


# ── Legacy wrapper ────────────────────────────────────────────────────────────

def generate_embeddings(chunks: list[str]) -> np.ndarray:
    """
    Backward-compatible wrapper.
    - Single-element list at query time  -> RETRIEVAL_QUERY
    - Multiple chunks at index time      -> RETRIEVAL_DOCUMENT
    """
    if len(chunks) == 1:
        return embed_query(chunks[0])
    return embed_documents(chunks)


# ── Internal ──────────────────────────────────────────────────────────────────

def _embed(texts: list[str], task_type: str) -> np.ndarray:
    """
    Call the Gemini embed_content API in batches and return a float32 ndarray.
    """
    print(f"[embeddings] Embedding {len(texts)} text(s) | model={_MODEL} | task={task_type}")

    embed_config = genai_types.EmbedContentConfig(task_type=task_type)
    batch_size   = 20
    all_embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        try:
            response = embed_client.models.embed_content(
                model=_MODEL,
                contents=batch,
                config=embed_config,
            )
            all_embeddings.extend([emb.values for emb in response.embeddings])

        except Exception as exc:
            # Fallback: embed one at a time to isolate any bad chunk
            print(f"[embeddings] Batch failed ({exc}), retrying one by one ...")
            for text in batch:
                try:
                    resp = embed_client.models.embed_content(
                        model=_MODEL,
                        contents=text,
                        config=embed_config,
                    )
                    all_embeddings.append(resp.embeddings[0].values)
                except Exception as inner:
                    raise RuntimeError(
                        f"[embeddings] Failed to embed text: {inner}"
                    ) from inner

    arr = np.array(all_embeddings, dtype="float32")
    print(f"[embeddings] Done. Shape: {arr.shape}")
    return arr