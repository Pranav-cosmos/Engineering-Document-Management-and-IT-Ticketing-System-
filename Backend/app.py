from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib

print("APP START")

from rag.generator import answer_question
from rag.retriever import build_index, add_document, remove_document

print("MODULES LOADED")


# ── Lifespan ──────────────────────────────────────────────────────────────────

ml_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model

    print("[startup] Loading ML model ...")
    ml_model = joblib.load(
        os.path.join(os.path.dirname(__file__), "models", "category_pipeline.pkl")
    )
    print("[startup] ML model loaded.")

    # pgvector mode: embeddings are persisted in Supabase, nothing to build.
    build_index()
    print("[startup] Ready.")

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

class DocIdRequest(BaseModel):
    doc_id: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "EDMS AI Service Running"}


@app.post("/predict-category", tags=["Ticket AI"])
def predict_category(ticket: TicketRequest):
    text = f"{ticket.title} {ticket.description}"
    prediction = ml_model.predict([text])[0]
    probabilities = ml_model.predict_proba([text])[0]
    confidence = float(max(probabilities))
    return {"category": prediction, "confidence": round(confidence, 2)}


@app.post("/chat", tags=["RAG Chat"])
def chat(data: ChatRequest):
    return answer_question(data.question)


@app.post("/index-document", tags=["RAG Chat"])
def index_document(data: DocIdRequest):
    """Embed a single document and store its chunks in Supabase pgvector."""
    result = add_document(data.doc_id)
    return {"status": "ok", **result}


@app.post("/remove-document", tags=["RAG Chat"])
def remove_document_endpoint(data: DocIdRequest):
    """Remove a single document's chunks from Supabase pgvector."""
    result = remove_document(data.doc_id)
    return {"status": "ok", **result}