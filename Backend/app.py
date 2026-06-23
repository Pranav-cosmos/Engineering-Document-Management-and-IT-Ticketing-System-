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
from rag.retriever import build_index, add_new_documents

print("GENERATOR + RETRIEVER LOADED")


# ── Lifespan: load ML model AND build the RAG index at startup ────────────────

ml_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model

    # 1. Load ticket-classification ML model
    print("[startup] Loading ML model …")
    ml_model = joblib.load(
        os.path.join(os.path.dirname(__file__), "models", "category_pipeline.pkl")
    )
    print("[startup] ML model loaded.")

    # 2. Build the RAG FAISS index from Supabase documents
    #    Wrapped in try/except so the server still starts even if Supabase
    #    is unreachable (e.g. missing env vars during local dev).
    print("[startup] Building RAG index …")
    try:
        build_index()
        print("[startup] RAG index ready.")
    except Exception as exc:
        print(f"[startup] WARNING: RAG index could not be built: {exc}")

    yield   # server runs here
    # (shutdown cleanup can go here if needed)


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="EDMS AI Service", lifespan=lifespan)

# Read allowed origins from env; fall back to * for local dev
frontend_url = os.getenv("FRONTEND_URL", "*")
origins = [frontend_url] if frontend_url != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / response models ─────────────────────────────────────────────────

class TicketRequest(BaseModel):
    title: str
    description: str


class ChatRequest(BaseModel):
    question: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "EDMS AI Service Running"}


@app.post("/predict-category", tags=["Ticket AI"])
def predict_category(ticket: TicketRequest):
    text = f"{ticket.title} {ticket.description}"
    prediction   = ml_model.predict([text])[0]
    probabilities = ml_model.predict_proba([text])[0]
    confidence   = float(max(probabilities))
    return {"category": prediction, "confidence": round(confidence, 2)}


@app.post("/chat", tags=["RAG Chat"])
def chat(data: ChatRequest):
    return answer_question(data.question)


@app.post("/index-documents", tags=["RAG Chat"])
def index_documents():
    """
    Incrementally embeds only NEW documents (those not yet in the in-memory
    index) and appends them to the FAISS index.

    This is memory-safe: we never re-download or re-embed existing documents,
    so memory usage stays proportional to the NEW documents added, not to the
    entire corpus.

    Call this after uploading a new document so the chatbot picks it up
    without restarting the server.
    """
    result = add_new_documents()
    return {
        "status": "ok",
        "message": (
            f"Added {result['added_chunks']} chunks from "
            f"{result['added_docs']} new document(s). "
            f"Total indexed chunks: {result['total_chunks']}."
        ),
        **result,
    }