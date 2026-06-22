from sentence_transformers import SentenceTransformer

_model = None


def get_model():
    global _model

    if _model is None:
        print("[RAG] Loading embedding model...")
        _model = SentenceTransformer(
            "all-MiniLM-L6-v2"
        )

    return _model


def generate_embeddings(chunks):

    return get_model().encode(
        chunks,
        convert_to_numpy=True
    )