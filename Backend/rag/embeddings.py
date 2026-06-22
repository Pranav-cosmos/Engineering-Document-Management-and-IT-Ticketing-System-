import numpy as np
from .gemini_client import client

def generate_embeddings(chunks):
    print(f"[embeddings] Generating embeddings for {len(chunks)} chunks using Gemini...")
    
    batch_size = 100
    all_embeddings = []
    
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        response = client.models.embed_content(
            model="gemini-embedding-2",
            contents=batch
        )
        batch_embeddings = [emb.values for emb in response.embeddings]
        all_embeddings.extend(batch_embeddings)
        
    return np.array(all_embeddings, dtype="float32")