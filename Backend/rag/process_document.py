from .document_processor import extract_text
from .chunker import create_chunks
from .embeddings import generate_embeddings
from .vector_store import (
    create_index,
    save_index
)

pdf_path = r"C:\Users\Hp\VSCODE\Hackathons\Tata\Engineering Document Management System and IT Ticketing Response System\edms-client\Backend\rag\Pranav Thorat - Resume.pdf.pdf"

text = extract_text(pdf_path)

chunks = create_chunks(text)

embeddings = generate_embeddings(chunks)

index = create_index(
    embeddings
)

save_index(
    index,
    chunks
)

print("Document processed")

print("Chunks:", len(chunks))

print(
    "Embedding Shape:",
    embeddings.shape
)