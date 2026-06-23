import numpy as np
from .gemini_client import client

MODEL = "gemini-embedding-2"


def _embed(texts, task_type):
    if not texts:
        return np.array([], dtype="float32")

    print(
        f"[embeddings] Embedding {len(texts)} text(s) "
        f"| model={MODEL} | task={task_type}"
    )

    all_embeddings = []
    batch_size = 100

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        print(type(texts))
        print(len(texts))
        print(texts[:2])

        response = client.models.embed_content(
            model=MODEL,
            contents=batch,
            config={
                "task_type": task_type
            }
        )
        print(len(response.embeddings))

        all_embeddings.extend(
            [e.values for e in response.embeddings]
        )

    arr = np.array(
        all_embeddings,
        dtype=np.float32
    )

    print(
        f"[embeddings] Done. Shape={arr.shape}"
    )

    return arr


def embed_documents(chunks):
    """
    Used when indexing uploaded documents.
    """
    return _embed(
        chunks,
        "RETRIEVAL_DOCUMENT"
    )


def embed_query(question):
    """
    Used when searching.
    """
    return _embed(
        [question],
        "RETRIEVAL_QUERY"
    )