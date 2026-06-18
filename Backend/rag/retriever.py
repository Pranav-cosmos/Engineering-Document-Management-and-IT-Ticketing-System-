import faiss
import pickle
from .embeddings import model


def load_index():

    index = faiss.read_index(
        "rag/faiss/index.faiss"
    )

    with open(
        "rag/faiss/metadata.pkl",
        "rb"
    ) as f:

        chunks = pickle.load(f)

    return index, chunks


def search_documents(
    question,
    top_k=3
):

    index, chunks = load_index()

    question_embedding = model.encode(
        [question]
    )

    distances, indices = index.search(
        question_embedding,
        top_k
    )

    results = []

    for i, idx in enumerate(indices[0]):

        results.append({
            "chunk": chunks[idx],
            "score": float(distances[0][i])
        })

    return results