from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

load_dotenv()   # must be before any other local imports that read env vars

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib

print("APP START")

from rag.generator import answer_question
from rag.retriever import build_index, add_new_documents, remove_document

print("GENERATOR + RETRIEVER LOADED")


# ── Lifespan ──────────────────────────────────────────────────────────────────

ml_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model

    print("[startup] Loading ML model …")
    ml_model = joblib.load(
        os.path.join(os.path.dirname(__file__), "models", "category_pipeline.pkl")
    )
    print("[startup] ML model loaded.")

    print("[startup] Building RAG index …")
    try:
        build_index()
        print("[startup] RAG index ready.")
    except Exception as exc:
        print(f"[startup] WARNING: RAG index build failed: {exc}")

    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="EDMS AI Service", lifespan=lifespan)

frontend_url = os.getenv("FRONTEND_URL", "*")
origins = [frontend_url] if frontend_url != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class TicketRequest(BaseModel):
    title: str
    description: str

class ChatRequest(BaseModel):
    question: str

class RemoveDocRequest(BaseModel):
    doc_id: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "EDMS AI Service Running"}


@app.post("/predict-category", tags=["Ticket AI"])
def predict_category(ticket: TicketRequest):
    text = f"{ticket.title} {ticket.description}"
    prediction    = ml_model.predict([text])[0]
    probabilities = ml_model.predict_proba([text])[0]
    confidence    = float(max(probabilities))
    return {"category": prediction, "confidence": round(confidence, 2)}


@app.post("/chat", tags=["RAG Chat"])
def chat(data: ChatRequest):
    return answer_question(data.question)


@app.post("/index-documents", tags=["RAG Chat"])
def index_documents():
    """
    Called by the frontend after a document is uploaded.
    Embeds ONLY the new document and appends it to the index — memory-safe.
    """
    result = add_new_documents()
    return {
        "status": "ok",
        "message": (
            f"Added {result['added_chunks']} chunks from "
            f"{result['added_docs']} new doc(s). "
            f"Total: {result['total_chunks']} chunks."
        ),
        **result,
    }


@app.post("/remove-document", tags=["RAG Chat"])
def remove_doc(data: RemoveDocRequest):
    """
    Called by the frontend after a document is deleted from Supabase.
    Removes that document's chunks from the in-memory index instantly —
    no re-embedding needed (uses stored embeddings array).
    """
    result = remove_document(data.doc_id)
    return {
        "status": "ok",
        "message": (
            f"Removed {result['removed_chunks']} chunks. "
            f"Total remaining: {result['total_chunks']}."
        ),
        **result,
    }