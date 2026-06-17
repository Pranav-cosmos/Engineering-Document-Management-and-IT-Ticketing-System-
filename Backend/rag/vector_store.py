import faiss
import pickle


def create_index(embeddings):

    dimension = embeddings.shape[1]

    index = faiss.IndexFlatL2(
        dimension
    )

    index.add(embeddings)

    return index


def save_index(
    index,
    chunks
):

    faiss.write_index(
        index,
        "faiss/index.faiss"
    )

    with open(
        "faiss/metadata.pkl",
        "wb"
    ) as f:
        pickle.dump(
            chunks,
            f
        )